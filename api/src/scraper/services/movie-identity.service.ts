import { WriteFence } from './scraper-lease';
import { Prisma } from '@prisma/client';
import { extractReleaseYearHint } from '../../common/utils/title-normalizer.util';
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  TmdbLookupResult,
  TmdbResolvedMovie,
  TmdbService,
} from '../../tmdb/tmdb.service';
import { TitleNormalizerService } from './title-normalizer.service';

@Injectable()
export class MovieIdentityService {
  private readonly logger = new Logger(MovieIdentityService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tmdbService: TmdbService,
    private readonly normalizer: TitleNormalizerService,
  ) {}

  buildNormalizedKey(rawTitle: string): {
    normalizedKey: string;
    displayTitle: string;
  } {
    const normalized = this.normalizer.normalize(rawTitle).trim();
    const displayTitle = normalized || rawTitle.trim();
    const year = extractReleaseYearHint(rawTitle);
    const normalizedKey =
      displayTitle.toLowerCase() + (year ? `#year:${year}` : '');
    return { normalizedKey, displayTitle };
  }

  /**
   * Resolves a scraped title to a stable Movie.id without hash collisions (F08).
   * - Separates internal identity (`normalizedKey`) from optional `tmdbId` (nullable).
   * - Preserves unmatched movies on transient TMDB outages without creating duplicates later.
   * - Reconciles existing unmatched records in-place (or merges showtimes) once TMDB resolves.
   */
  async resolveAndUpsertMovie(
    rawTitle: string,
    runCache: Map<string, number | null>,
    context?: {
      provider: string;
      sourceMovieId?: string;
      originalTitle?: string;
      writeFence?: WriteFence;
    },
  ): Promise<number | null> {
    const originalTitle = context?.originalTitle ?? rawTitle;
    const titleIdentity = this.buildNormalizedKey(originalTitle);
    const displayTitle = titleIdentity.displayTitle;
    // A provider ID is stronger than a title. Without an ID, retain provider + year.
    const normalizedKey = context
      ? JSON.stringify([
          'provider',
          context.provider,
          context.sourceMovieId
            ? ['id', context.sourceMovieId]
            : ['title', titleIdentity.normalizedKey],
        ])
      : titleIdentity.normalizedKey;
    if (!displayTitle) {
      return null;
    }

    const findExisting = async (
      db: Pick<Prisma.TransactionClient, 'movie' | 'movieAlias'>,
    ) => {
      const alias = context
        ? await db.movieAlias.findUnique({
            where: { key: normalizedKey },
            include: { movie: true },
          })
        : null;
      return alias?.movie ?? db.movie.findUnique({ where: { normalizedKey } });
    };
    // Persistent aliases are authoritative: a run cache may refer to a merged/deleted temporary ID.
    const prior = await findExisting(this.prisma);
    let lookup: TmdbLookupResult | null =
      prior?.tmdbId != null
        ? null
        : await this.tmdbService.lookupMovie(originalTitle);
    const yearHint = extractReleaseYearHint(originalTitle);
    if (
      lookup?.status === 'matched' &&
      yearHint &&
      Number(lookup.movie.releaseDate?.slice(0, 4)) !== yearHint
    ) {
      lookup = { status: 'not_found' };
    }
    const lockKeys = [`cine-radar:movie:source:${normalizedKey}`];
    const tmdbId =
      lookup?.status === 'matched' ? lookup.movie.tmdbId : prior?.tmdbId;
    if (tmdbId != null) lockKeys.push(`cine-radar:movie:tmdb:${tmdbId}`);
    lockKeys.sort();

    for (let attempt = 0; ; attempt++) {
      try {
        const result = await this.prisma.$transaction(
          async (tx) => {
            await context?.writeFence?.(tx);
            // Transaction-scoped locks survive pooling and release on commit/rollback.
            for (const key of lockKeys)
              await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))`;
            const existing = await findExisting(tx);
            const remember = async (id: number, mergedFrom?: number) => {
              if (context)
                await tx.movieAlias.upsert({
                  where: { key: normalizedKey },
                  create: { key: normalizedKey, movieId: id, originalTitle },
                  update: { movieId: id, originalTitle },
                });
              await context?.writeFence?.(tx);
              return { id, mergedFrom };
            };
            if (existing?.tmdbId != null) return remember(existing.id);
            const resolved = lookup ?? {
              status: 'transient_error' as const,
              reason: 'Identity changed while resolving',
            };
            if (resolved.status !== 'matched') {
              const movie = existing
                ? await tx.movie.update({
                    where: { id: existing.id },
                    data: { tmdbStatus: resolved.status },
                  })
                : await tx.movie.create({
                    data: {
                      normalizedKey,
                      tmdbId: null,
                      tmdbStatus: resolved.status,
                      title: displayTitle,
                      overview: '',
                      genres: [],
                    },
                  });
              return remember(movie.id);
            }
            const info = resolved.movie;
            const canonical = await tx.movie.findUnique({
              where: { tmdbId: info.tmdbId },
            });
            if (existing && canonical && existing.id !== canonical.id) {
              const orphanShowtimes = await tx.showtime.findMany({
                where: { movieId: existing.id },
              });
              if (orphanShowtimes.length)
                await tx.showtime.createMany({
                  data: orphanShowtimes.map((st) => ({
                    movieId: canonical.id,
                    locationId: st.locationId,
                    dateTime: st.dateTime,
                    format: st.format,
                    language: st.language,
                    ticketUrl: st.ticketUrl,
                  })),
                  skipDuplicates: true,
                });
              await tx.movieAlias.updateMany({
                where: { movieId: existing.id },
                data: { movieId: canonical.id },
              });
              await tx.movie.delete({ where: { id: existing.id } });
              await tx.movie.update({
                where: { id: canonical.id },
                data: this.buildEnrichedMovieData(info),
              });
              return remember(canonical.id, existing.id);
            }
            const target = canonical ?? existing;
            const movie = target
              ? await tx.movie.update({
                  where: { id: target.id },
                  data: this.buildEnrichedMovieData(info),
                })
              : await tx.movie.create({
                  data: { normalizedKey, ...this.buildEnrichedMovieData(info) },
                });
            return remember(movie.id);
          },
          {
            isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
            maxWait: 5000,
            timeout: 15000,
          },
        );
        if (result.mergedFrom !== undefined) {
          for (const [key, id] of runCache)
            if (id === result.mergedFrom) runCache.set(key, result.id);
        }
        runCache.set(normalizedKey, result.id);
        return result.id;
      } catch (error: unknown) {
        const code =
          error instanceof Prisma.PrismaClientKnownRequestError
            ? error.code
            : undefined;
        if (
          attempt >= 2 ||
          !code ||
          !['P2002', 'P2034', 'P2025'].includes(code)
        )
          throw error;
        this.logger.warn(
          `Retrying concurrent movie resolution (${code}, attempt ${attempt + 1})`,
        );
      }
    }
  }

  private buildEnrichedMovieData(info: TmdbResolvedMovie) {
    return {
      tmdbId: info.tmdbId,
      tmdbStatus: 'matched',
      title: info.officialTitle,
      posterUrl: info.posterUrl,
      backdropUrl: info.backdropUrl,
      overview: info.overview ?? '',
      releaseDate: info.releaseDate,
      duration: info.duration,
      rating: info.rating,
      genres: info.genres,
    };
  }
}
