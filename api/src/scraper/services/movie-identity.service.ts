import { extractReleaseYearHint } from '../../common/utils/title-normalizer.util';
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { TmdbResolvedMovie, TmdbService } from '../../tmdb/tmdb.service';
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

    if (runCache.has(normalizedKey)) {
      return runCache.get(normalizedKey) ?? null;
    }

    const sourceAlias = context
      ? await this.prisma.movieAlias.findUnique({
          where: { key: normalizedKey },
          include: { movie: true },
        })
      : null;
    const existingByKey =
      sourceAlias?.movie ??
      (await this.prisma.movie.findUnique({
        where: { normalizedKey },
      }));
    const remember = async (id: number): Promise<number> => {
      if (context)
        await this.prisma.movieAlias.upsert({
          where: { key: normalizedKey },
          create: { key: normalizedKey, movieId: id, originalTitle },
          update: { movieId: id, originalTitle },
        });
      runCache.set(normalizedKey, id);
      return id;
    };

    // Fast path: already enriched with a verified TMDB ID
    if (existingByKey && existingByKey.tmdbId !== null) {
      return remember(existingByKey.id);
    }

    let lookup = await this.tmdbService.lookupMovie(originalTitle);
    const yearHint = extractReleaseYearHint(originalTitle);
    if (
      lookup.status === 'matched' &&
      yearHint &&
      Number(lookup.movie.releaseDate?.slice(0, 4)) !== yearHint
    ) {
      // Do not attach a known classic/remake to metadata from a different release.
      lookup = { status: 'not_found' };
    }

    if (lookup.status !== 'matched') {
      if (existingByKey) {
        if (existingByKey.tmdbStatus !== lookup.status) {
          await this.prisma.movie.update({
            where: { id: existingByKey.id },
            data: { tmdbStatus: lookup.status },
          });
        }
        return remember(existingByKey.id);
      }

      const created = await this.prisma.movie.create({
        data: {
          normalizedKey,
          tmdbId: null,
          tmdbStatus: lookup.status,
          title: displayTitle,
          overview: '',
          genres: [],
        },
      });

      return remember(created.id);
    }

    const info = lookup.movie;
    const existingByTmdb = await this.prisma.movie.findUnique({
      where: { tmdbId: info.tmdbId },
    });

    // Case 1: Movie was created earlier without TMDB (outage or pre-indexing) -> enrich in-place
    if (existingByKey && !existingByTmdb) {
      const updated = await this.prisma.movie.update({
        where: { id: existingByKey.id },
        data: this.buildEnrichedMovieData(info),
      });
      return remember(updated.id);
    }

    // Case 2: Both an unmatched key record and a canonical TMDB record exist -> reconcile showtimes & merge
    if (
      existingByKey &&
      existingByTmdb &&
      existingByKey.id !== existingByTmdb.id
    ) {
      this.logger.log(
        `Reconciliando película temporal #${existingByKey.id} ("${existingByKey.title}") en película TMDB #${existingByTmdb.id} (tmdbId=${info.tmdbId})`,
      );

      await this.prisma.$transaction(async (tx) => {
        const orphanShowtimes = await tx.showtime.findMany({
          where: { movieId: existingByKey.id },
        });

        if (orphanShowtimes.length > 0) {
          await tx.showtime.createMany({
            data: orphanShowtimes.map((st) => ({
              movieId: existingByTmdb.id,
              locationId: st.locationId,
              dateTime: st.dateTime,
              format: st.format,
              language: st.language,
              ticketUrl: st.ticketUrl,
            })),
            skipDuplicates: true,
          });
        }

        await tx.movieAlias.updateMany({
          where: { movieId: existingByKey.id },
          data: { movieId: existingByTmdb.id },
        });
        await tx.movie.delete({
          where: { id: existingByKey.id },
        });

        await tx.movie.update({
          where: { id: existingByTmdb.id },
          data: this.buildEnrichedMovieData(info),
        });
      });

      return remember(existingByTmdb.id);
    }

    // Case 3: Canonical TMDB record already exists (same movie under another alias or same key)
    if (existingByTmdb) {
      const updated = await this.prisma.movie.update({
        where: { id: existingByTmdb.id },
        data: this.buildEnrichedMovieData(info),
      });
      return remember(updated.id);
    }

    // Case 4: Brand new movie with verified TMDB match
    const created = await this.prisma.movie.create({
      data: {
        normalizedKey,
        ...this.buildEnrichedMovieData(info),
      },
    });

    return remember(created.id);
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
