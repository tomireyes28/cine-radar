import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { MovieIdentityService } from './movie-identity.service';
import {
  ICinemaScraper,
  ScrapedChainResult,
  ScrapeStatus,
} from '../interfaces/scraper.interface';
import { AtlasService } from '../atlas/atlas.service';
import { MultiplexService } from '../multiplex/multiplex.service';
import { ShowcaseService } from '../showcase/showcase.service';
import { CinemaCenterService } from '../cinemacenter/cinemacenter.service';
import { CinemarkService } from '../cinemark/cinemark.service';
import { CinepolisService } from '../cinepolis/cinepolis.service';
import {
  getArgentinaStartOfToday,
  getArgentinaStartOfYesterday,
} from '../../common/utils/argentina-time.util';

export interface OrchestratorChainSummary {
  chainKey: string;
  chainName: string;
  status: ScrapeStatus;
  expectedLocations: number;
  locationsComplete: number;
  locationsEmptyVerified: number;
  locationsPartial: number;
  locationsFailed: number;
  locationsProcessed: number;
  moviesResolved: number;
  showtimesInserted: number;
  discardedShowtimes: number;
  durationMs: number;
  errors: string[];
}

export interface OrchestratorRunSummary {
  status: 'ok' | 'degraded' | 'failed';
  completedAt: string;
  deletedExpiredShowtimes: number;
  totalShowtimesInserted: number;
  failedChains: string[];
  partialChains: string[];
  chains: OrchestratorChainSummary[];
}

@Injectable()
export class ScraperOrchestratorService {
  private readonly logger = new Logger(ScraperOrchestratorService.name);
  private readonly strategies: ICinemaScraper[];

  constructor(
    private readonly prisma: PrismaService,
    private readonly movieIdentity: MovieIdentityService,
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

  async runAll(): Promise<OrchestratorRunSummary> {
    const startTime = Date.now();
    this.logger.log('Iniciando orquestación completa de cartelera...');

    const deletedOld = await this.cleanupOldShowtimes();
    const summaries: OrchestratorChainSummary[] = [];

    // Shared movie DB ID cache across all chains during a run
    const resolvedMovieDbIds = new Map<string, number | null>();

    for (const strategy of this.strategies) {
      const chainStart = Date.now();
      try {
        const summary = await this.executeStrategy(
          strategy,
          resolvedMovieDbIds,
        );
        summaries.push(summary);
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        this.logger.error(
          `Fallo no controlado ejecutando estrategia ${strategy.chainName}: ${msg}`,
        );
        summaries.push({
          chainKey: strategy.chainKey,
          chainName: strategy.chainName,
          status: 'failed',
          expectedLocations: 0,
          locationsComplete: 0,
          locationsEmptyVerified: 0,
          locationsPartial: 0,
          locationsFailed: 0,
          locationsProcessed: 0,
          moviesResolved: 0,
          showtimesInserted: 0,
          discardedShowtimes: 0,
          durationMs: Date.now() - chainStart,
          errors: [msg],
        });
      }
    }

    const totalShowtimes = summaries.reduce(
      (acc, s) => acc + s.showtimesInserted,
      0,
    );
    const failedChains = summaries
      .filter((s) => s.status === 'failed')
      .map((s) => s.chainKey);
    const partialChains = summaries
      .filter((s) => s.status === 'partial')
      .map((s) => s.chainKey);

    let overallStatus: 'ok' | 'degraded' | 'failed' = 'ok';
    if (
      summaries.length === 0 ||
      failedChains.length === summaries.length ||
      summaries.every(
        (s) =>
          s.locationsComplete +
            s.locationsEmptyVerified +
            s.locationsPartial ===
          0,
      )
    ) {
      overallStatus = 'failed';
    } else if (failedChains.length > 0 || partialChains.length > 0) {
      overallStatus = 'degraded';
    }

    this.logger.log(
      `Orquestación finalizada (${overallStatus}) en ${((Date.now() - startTime) / 1000).toFixed(1)}s. Funciones insertadas: ${totalShowtimes}. Fallidas: [${failedChains.join(', ')}]`,
    );

    return {
      status: overallStatus,
      completedAt: new Date().toISOString(),
      deletedExpiredShowtimes: deletedOld,
      totalShowtimesInserted: totalShowtimes,
      failedChains,
      partialChains,
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
    const chainStart = Date.now();
    try {
      return await this.executeStrategy(strategy, resolvedMovieDbIds);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Fallo ejecutando cadena individual ${strategy.chainName}: ${msg}`,
      );
      return {
        chainKey: strategy.chainKey,
        chainName: strategy.chainName,
        status: 'failed',
        expectedLocations: 0,
        locationsComplete: 0,
        locationsEmptyVerified: 0,
        locationsPartial: 0,
        locationsFailed: 0,
        locationsProcessed: 0,
        moviesResolved: 0,
        showtimesInserted: 0,
        discardedShowtimes: 0,
        durationMs: Date.now() - chainStart,
        errors: [msg],
      };
    }
  }

  private async executeStrategy(
    strategy: ICinemaScraper,
    resolvedMovieDbIds: Map<string, number | null>,
  ): Promise<OrchestratorChainSummary> {
    const start = Date.now();
    const scrapedData = await strategy.scrape();
    return this.persistChainData(
      strategy.chainKey,
      scrapedData,
      resolvedMovieDbIds,
      start,
    );
  }

  private async persistChainData(
    chainKey: string,
    chainData: ScrapedChainResult,
    resolvedMovieDbIds: Map<string, number | null>,
    startTime: number,
  ): Promise<OrchestratorChainSummary> {
    let locationsComplete = 0;
    let locationsEmptyVerified = 0;
    let locationsPartial = 0;
    let locationsFailed = 0;

    for (const loc of chainData.locations) {
      switch (loc.status) {
        case 'complete':
          locationsComplete++;
          break;
        case 'empty_verified':
          locationsEmptyVerified++;
          break;
        case 'partial':
          locationsPartial++;
          break;
        case 'failed':
          locationsFailed++;
          break;
      }
    }

    if (chainData.status === 'failed') {
      const durationMs = Date.now() - startTime;
      this.logger.error(
        `[${chainData.chainName}] Extracción fallida (${locationsFailed}/${chainData.expectedLocations} sedes fallidas). Se preserva la cartelera anterior.`,
      );
      return {
        chainKey,
        chainName: chainData.chainName,
        status: 'failed',
        expectedLocations: chainData.expectedLocations,
        locationsComplete,
        locationsEmptyVerified,
        locationsPartial,
        locationsFailed,
        locationsProcessed: 0,
        moviesResolved: 0,
        showtimesInserted: 0,
        discardedShowtimes: 0,
        durationMs,
        errors: chainData.errors,
      };
    }

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
    let discardedShowtimes = 0;
    let locationsProcessed = 0;
    const uniqueMoviesInChain = new Set<number>();

    const startOfToday = getArgentinaStartOfToday();

    for (const locData of chainData.locations) {
      if (locData.status === 'failed') {
        continue;
      }

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
        const dbMovieId = await this.movieIdentity.resolveAndUpsertMovie(
          movieItem.rawTitle,
          resolvedMovieDbIds,
        );
        if (!dbMovieId) {
          discardedShowtimes += movieItem.showtimes.length;
          continue;
        }

        uniqueMoviesInChain.add(dbMovieId);

        for (const st of movieItem.showtimes) {
          if (isNaN(st.dateTime.getTime())) {
            discardedShowtimes++;
            continue;
          }
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
      `[${chainData.chainName}] estado=${chainData.status}, sedesProcesadas=${locationsProcessed}/${chainData.expectedLocations}, películas=${uniqueMoviesInChain.size}, horarios=${totalShowtimesInserted}, descartados=${discardedShowtimes} en ${(durationMs / 1000).toFixed(1)}s`,
    );

    return {
      chainKey,
      chainName: chainData.chainName,
      status: chainData.status,
      expectedLocations: chainData.expectedLocations,
      locationsComplete,
      locationsEmptyVerified,
      locationsPartial,
      locationsFailed,
      locationsProcessed,
      moviesResolved: uniqueMoviesInChain.size,
      showtimesInserted: totalShowtimesInserted,
      discardedShowtimes,
      durationMs,
      errors: chainData.errors,
    };
  }

  async cleanupOldShowtimes(): Promise<number> {
    const yesterdayCutoff = getArgentinaStartOfYesterday();

    const result = await this.prisma.showtime.deleteMany({
      where: {
        dateTime: { lt: yesterdayCutoff },
      },
    });

    this.logger.log(
      `Limpieza completada: ${result.count} funciones antiguas eliminadas.`,
    );
    return result.count;
  }
}
