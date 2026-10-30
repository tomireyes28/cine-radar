import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { TmdbService } from '../../tmdb/tmdb.service';
import {
  ICinemaScraper,
  ScrapedChainResult,
} from '../interfaces/scraper.interface';
import { AtlasService } from '../atlas/atlas.service';
import { MultiplexService } from '../multiplex/multiplex.service';
import { ShowcaseService } from '../showcase/showcase.service';
import { CinemaCenterService } from '../cinemacenter/cinemacenter.service';
import { CinemarkService } from '../cinemark/cinemark.service';
import { CinepolisService } from '../cinepolis/cinepolis.service';

export interface OrchestratorChainSummary {
  chainName: string;
  locationsProcessed: number;
  moviesResolved: number;
  showtimesInserted: number;
  durationMs: number;
}

@Injectable()
export class ScraperOrchestratorService {
  private readonly logger = new Logger(ScraperOrchestratorService.name);
  private readonly strategies: ICinemaScraper[];

  constructor(
    private readonly prisma: PrismaService,
    private readonly tmdbService: TmdbService,
    private readonly atlasService: AtlasService,
    private readonly multiplexService: MultiplexService,
    private readonly showcaseService: ShowcaseService,
    private readonly cinemaCenterService: CinemaCenterService,
    private readonly cinemarkService: CinemarkService,
    private readonly cinepolisService: CinepolisService,
  ) {
    // Ordered from fastest HTTP scrapers to browser-based scrapers
    this.strategies = [
      this.atlasService,
      this.multiplexService,
      this.showcaseService,
      this.cinemarkService,
      this.cinemaCenterService,
      this.cinepolisService,
    ];
  }

  async runAll() {
    const startTime = Date.now();
    this.logger.log('Iniciando orquestación completa de cartelera...');

    const deletedOld = await this.cleanupOldShowtimes();
    const summaries: OrchestratorChainSummary[] = [];

    // Shared movie DB ID cache across all chains during a run
    const resolvedMovieDbIds = new Map<string, number | null>();

    for (const strategy of this.strategies) {
      try {
        const summary = await this.executeStrategy(
          strategy,
          resolvedMovieDbIds,
        );
        summaries.push(summary);
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        this.logger.error(
          `Fallo ejecutando estrategia ${strategy.chainName}: ${msg}`,
        );
      }
    }

    const totalShowtimes = summaries.reduce(
      (acc, s) => acc + s.showtimesInserted,
      0,
    );

    this.logger.log(
      `Orquestación finalizada en ${((Date.now() - startTime) / 1000).toFixed(1)}s. Total funciones insertadas: ${totalShowtimes}`,
    );

    return {
      deletedExpiredShowtimes: deletedOld,
      totalShowtimesInserted: totalShowtimes,
      chains: summaries,
    };
  }

  async runByChainKey(chainKey: string): Promise<OrchestratorChainSummary> {
    const strategy = this.strategies.find(
      (s) => s.chainKey.toLowerCase() === chainKey.toLowerCase(),
    );

    if (!strategy) {
      throw new NotFoundException(
        `No existe estrategia de scraping para "${chainKey}"`,
      );
    }

    const resolvedMovieDbIds = new Map<string, number | null>();
    return this.executeStrategy(strategy, resolvedMovieDbIds);
  }

  private async executeStrategy(
    strategy: ICinemaScraper,
    resolvedMovieDbIds: Map<string, number | null>,
  ): Promise<OrchestratorChainSummary> {
    const start = Date.now();
    const scrapedData = await strategy.scrape();
    return this.persistChainData(scrapedData, resolvedMovieDbIds, start);
  }

  private async persistChainData(
    chainData: ScrapedChainResult,
    resolvedMovieDbIds: Map<string, number | null>,
    startTime: number,
  ): Promise<OrchestratorChainSummary> {
    const chain = await this.prisma.cinemaChain.upsert({
      where: { name: chainData.chainName },
      update: {},
      create: { name: chainData.chainName },
    });

    const existingLocations = await this.prisma.cinemaLocation.findMany({
      where: { chainId: chain.id },
    });
    const locationIdByName = new Map<string, number>(
      existingLocations.map((loc) => [loc.name, loc.id]),
    );

    let totalShowtimesInserted = 0;
    let locationsProcessed = 0;
    const uniqueMoviesInChain = new Set<number>();

    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    for (const locData of chainData.locations) {
      let locationId = locationIdByName.get(locData.locationName);
      if (!locationId) {
        const created = await this.prisma.cinemaLocation.create({
          data: {
            name: locData.locationName,
            chainId: chain.id,
            address: 'Ver ubicación',
            lat: 0,
            lng: 0,
          },
        });
        locationId = created.id;
        locationIdByName.set(locData.locationName, locationId);
      }

      const showtimesBatch: {
        movieId: number;
        locationId: number;
        dateTime: Date;
        format: string;
        language: string;
        ticketUrl: string;
      }[] = [];

      for (const movieItem of locData.movies) {
        const dbMovieId = await this.resolveAndUpsertMovie(
          movieItem.rawTitle,
          resolvedMovieDbIds,
        );
        if (!dbMovieId) continue;

        uniqueMoviesInChain.add(dbMovieId);

        for (const st of movieItem.showtimes) {
          if (isNaN(st.dateTime.getTime())) continue;
          showtimesBatch.push({
            movieId: dbMovieId,
            locationId,
            dateTime: st.dateTime,
            format: st.format,
            language: st.language,
            ticketUrl: st.ticketUrl,
          });
        }
      }

      if (showtimesBatch.length > 0) {
        await this.prisma.showtime.deleteMany({
          where: {
            locationId,
            dateTime: { gte: startOfToday },
          },
        });

        const created = await this.prisma.showtime.createMany({
          data: showtimesBatch,
          skipDuplicates: true,
        });

        totalShowtimesInserted += created.count;
        locationsProcessed++;
      }
    }

    const durationMs = Date.now() - startTime;
    this.logger.log(
      `[${chainData.chainName}] ${locationsProcessed} sedes, ${uniqueMoviesInChain.size} películas, ${totalShowtimesInserted} horarios guardados en ${(durationMs / 1000).toFixed(1)}s`,
    );

    return {
      chainName: chainData.chainName,
      locationsProcessed,
      moviesResolved: uniqueMoviesInChain.size,
      showtimesInserted: totalShowtimesInserted,
      durationMs,
    };
  }

  private async resolveAndUpsertMovie(
    rawTitle: string,
    cache: Map<string, number | null>,
  ): Promise<number | null> {
    const key = rawTitle.trim().toLowerCase();
    if (cache.has(key)) {
      return cache.get(key) ?? null;
    }

    const tmdbInfo = await this.tmdbService.searchMovie(rawTitle);

    // Fallback: If not indexed on TMDB (indie, festival, or local film), use a deterministic synthetic ID
    const syntheticId = -Math.abs(
      key.split('').reduce((acc, char) => (acc * 31 + char.charCodeAt(0)) | 0, 0) || 1,
    );

    const resolvedTmdbId = tmdbInfo?.tmdbId ?? syntheticId;
    const resolvedTitle = tmdbInfo?.officialTitle ?? rawTitle;
    const resolvedPoster = tmdbInfo?.posterUrl ?? null;
    const resolvedBackdrop = tmdbInfo?.backdropUrl ?? null;
    const resolvedOverview = tmdbInfo?.overview ?? '';
    const resolvedReleaseDate = tmdbInfo?.releaseDate ?? null;
    const resolvedDuration = tmdbInfo?.duration ?? null;
    const resolvedRating = tmdbInfo?.rating ?? null;
    const resolvedGenres = tmdbInfo?.genres ?? [];

    const dbMovie = await this.prisma.movie.upsert({
      where: { tmdbId: resolvedTmdbId },
      update: {
        title: resolvedTitle,
        posterUrl: resolvedPoster,
        backdropUrl: resolvedBackdrop,
        overview: resolvedOverview,
        releaseDate: resolvedReleaseDate,
        duration: resolvedDuration,
        rating: resolvedRating,
        genres: resolvedGenres,
      },
      create: {
        tmdbId: resolvedTmdbId,
        title: resolvedTitle,
        posterUrl: resolvedPoster,
        backdropUrl: resolvedBackdrop,
        overview: resolvedOverview,
        releaseDate: resolvedReleaseDate,
        duration: resolvedDuration,
        rating: resolvedRating,
        genres: resolvedGenres,
      },
    });

    cache.set(key, dbMovie.id);
    return dbMovie.id;
  }

  async cleanupOldShowtimes(): Promise<number> {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);

    const result = await this.prisma.showtime.deleteMany({
      where: {
        dateTime: { lt: yesterday },
      },
    });

    this.logger.log(
      `Limpieza completada: ${result.count} funciones antiguas eliminadas.`,
    );
    return result.count;
  }
}
