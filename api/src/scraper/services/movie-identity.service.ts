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
    const normalizedKey = displayTitle.toLowerCase();
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
  ): Promise<number | null> {
    const { normalizedKey, displayTitle } = this.buildNormalizedKey(rawTitle);
    if (!normalizedKey) {
      return null;
    }

    if (runCache.has(normalizedKey)) {
      return runCache.get(normalizedKey) ?? null;
    }

    const existingByKey = await this.prisma.movie.findUnique({
      where: { normalizedKey },
    });

    // Fast path: already enriched with a verified TMDB ID
    if (existingByKey && existingByKey.tmdbId !== null) {
      runCache.set(normalizedKey, existingByKey.id);
      return existingByKey.id;
    }

    const lookup = await this.tmdbService.lookupMovie(displayTitle);

    if (lookup.status !== 'matched') {
      if (existingByKey) {
        if (existingByKey.tmdbStatus !== lookup.status) {
          await this.prisma.movie.update({
            where: { id: existingByKey.id },
            data: { tmdbStatus: lookup.status },
          });
        }
        runCache.set(normalizedKey, existingByKey.id);
        return existingByKey.id;
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

      runCache.set(normalizedKey, created.id);
      return created.id;
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
      runCache.set(normalizedKey, updated.id);
      return updated.id;
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

        await tx.movie.delete({
          where: { id: existingByKey.id },
        });

        await tx.movie.update({
          where: { id: existingByTmdb.id },
          data: this.buildEnrichedMovieData(info),
        });
      });

      runCache.set(normalizedKey, existingByTmdb.id);
      return existingByTmdb.id;
    }

    // Case 3: Canonical TMDB record already exists (same movie under another alias or same key)
    if (existingByTmdb) {
      const updated = await this.prisma.movie.update({
        where: { id: existingByTmdb.id },
        data: this.buildEnrichedMovieData(info),
      });
      runCache.set(normalizedKey, updated.id);
      return updated.id;
    }

    // Case 4: Brand new movie with verified TMDB match
    const created = await this.prisma.movie.create({
      data: {
        normalizedKey,
        ...this.buildEnrichedMovieData(info),
      },
    });

    runCache.set(normalizedKey, created.id);
    return created.id;
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
