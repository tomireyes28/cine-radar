import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { MovieIdentityService } from './movie-identity.service';
import {
  buildChainLockKey,
  DEFAULT_CHAIN_LOCK_TTL_MS,
  DEFAULT_GLOBAL_LOCK_TTL_MS,
  GLOBAL_SCRAPER_LOCK_KEY,
  ScraperLockService,
} from './scraper-lock.service';
import {
  deriveChainScrapeStatus,
  ICinemaScraper,
  ScrapedChainResult,
  ScrapedLocationResult,
  ScrapeStatus,
} from '../interfaces/scraper.interface';
import { AtlasService } from '../atlas/atlas.service';
import { MultiplexService } from '../multiplex/multiplex.service';
import { ShowcaseService } from '../showcase/showcase.service';
import { CinemaCenterService } from '../cinemacenter/cinemacenter.service';
import { CinemarkService } from '../cinemark/cinemark.service';
import { CinepolisService } from '../cinepolis/cinepolis.service';
import {
  getArgentinaDayRange,
  getArgentinaStartOfToday,
  getArgentinaStartOfYesterday,
  getArgentinaTodayDateString,
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
  showtimesUnchanged?: number;
  discardedShowtimes: number;
  durationMs: number;
  errors: string[];
}

interface PendingShowtimeRow {
  movieId: number;
  locationId: number;
  dateTime: Date;
  format: string;
  language: string;
  ticketUrl: string;
}

function buildShowtimeCompositeKey(row: {
  movieId: number;
  dateTime: Date;
  format: string;
  language: string;
}): string {
  return `${row.movieId}|${row.dateTime.getTime()}|${row.format}|${row.language}`;
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
    @Optional() private readonly scraperLock?: ScraperLockService,
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
    let globalOwner: string | null = null;

    if (this.scraperLock) {
      globalOwner = await this.scraperLock.acquire(
        GLOBAL_SCRAPER_LOCK_KEY,
        DEFAULT_GLOBAL_LOCK_TTL_MS,
      );
      if (!globalOwner) {
        throw new ConflictException(
          'Ya existe una ejecución global de scraping en curso.',
        );
      }
    }

    try {
      this.logger.log('Iniciando orquestación completa de cartelera...');

      const deletedOld = await this.cleanupOldShowtimes();
      const summaries: OrchestratorChainSummary[] = [];

      // Shared movie DB ID cache across all chains during a run
      const resolvedMovieDbIds = new Map<string, number | null>();

      for (const strategy of this.strategies) {
        const chainStart = Date.now();
        const chainLockKey = buildChainLockKey(strategy.chainKey);
        let chainOwner: string | null = null;

        if (this.scraperLock) {
          chainOwner = await this.scraperLock.acquire(
            chainLockKey,
            DEFAULT_CHAIN_LOCK_TTL_MS,
          );
          if (!chainOwner) {
            const lockMsg = `Ejecución omitida: bloqueo activo en ${chainLockKey}`;
            this.logger.warn(`[${strategy.chainName}] ${lockMsg}`);
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
              errors: [lockMsg],
            });
            continue;
          }
        }

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
        } finally {
          if (this.scraperLock && chainOwner) {
            await this.scraperLock.release(chainLockKey, chainOwner);
          }
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
    } finally {
      if (this.scraperLock && globalOwner) {
        await this.scraperLock.release(GLOBAL_SCRAPER_LOCK_KEY, globalOwner);
      }
    }
  }

  async runByChainKey(chainKey: string): Promise<OrchestratorChainSummary> {
    const strategy = this.strategies.find(
      (s) => s.chainKey?.toLowerCase() === chainKey.toLowerCase(),
    );

    if (!strategy) {
      throw new NotFoundException(
        `No existe estrategia de scraping para "${chainKey}"`,
      );
    }

    const chainLockKey = buildChainLockKey(strategy.chainKey);
    let chainOwner: string | null = null;

    if (this.scraperLock) {
      if (await this.scraperLock.isLocked(GLOBAL_SCRAPER_LOCK_KEY)) {
        throw new ConflictException(
          `No se puede ejecutar "${strategy.chainKey}" mientras hay una orquestación global en curso.`,
        );
      }

      chainOwner = await this.scraperLock.acquire(
        chainLockKey,
        DEFAULT_CHAIN_LOCK_TTL_MS,
      );
      if (!chainOwner) {
        throw new ConflictException(
          `Ya existe una ejecución activa de scraping para "${strategy.chainKey}".`,
        );
      }
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
    } finally {
      if (this.scraperLock && chainOwner) {
        await this.scraperLock.release(chainLockKey, chainOwner);
      }
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
    let totalShowtimesUnchanged = 0;
    let discardedShowtimes = 0;
    let locationsProcessed = 0;
    const uniqueMoviesInChain = new Set<number>();

    const startOfToday = getArgentinaStartOfToday();
    const effectiveLocations: ScrapedLocationResult[] = chainData.locations.map(
      (loc) => ({ ...loc }),
    );
    const effectiveErrors: string[] = [...chainData.errors];
    let hadPersistenceFailure = false;

    for (let i = 0; i < effectiveLocations.length; i++) {
      const locData = effectiveLocations[i];
      if (locData.status === 'failed') {
        continue;
      }

      try {
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

        // Resolve movie identities (and any TMDB HTTP calls) outside the DB transaction
        const showtimesBatch: {
          movieId: number;
          locationId: number;
          dateTime: Date;
          format: string;
          language: string;
          ticketUrl: string;
        }[] = [];
        const venueMovieIds = new Set<number>();
        let venueDiscarded = 0;

        for (const movieItem of locData.movies) {
          const dbMovieId = await this.movieIdentity.resolveAndUpsertMovie(
            movieItem.rawTitle,
            resolvedMovieDbIds,
          );
          if (!dbMovieId) {
            venueDiscarded += movieItem.showtimes.length;
            continue;
          }

          venueMovieIds.add(dbMovieId);

          for (const st of movieItem.showtimes) {
            if (
              isNaN(st.dateTime.getTime()) ||
              st.dateTime.getTime() < startOfToday.getTime()
            ) {
              venueDiscarded++;
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

        const windowStart = locData.coveredFrom ?? startOfToday;
        const resolvedLocationId = locationId;

        if (locData.status === 'empty_verified') {
          await this.prisma.$transaction(
            async (tx) => {
              await tx.showtime.deleteMany({
                where: {
                  locationId: resolvedLocationId,
                  dateTime: {
                    gte: windowStart,
                    ...(locData.coveredUntil
                      ? { lte: locData.coveredUntil }
                      : {}),
                  },
                },
              });
            },
            { maxWait: 5000, timeout: 15000 },
          );
          discardedShowtimes += venueDiscarded;
          locationsProcessed++;
          continue;
        }

        if (locData.status === 'partial') {
          discardedShowtimes += venueDiscarded;
          if (showtimesBatch.length > 0) {
            const created = await this.prisma.$transaction(
              async (tx) =>
                tx.showtime.createMany({
                  data: showtimesBatch,
                  skipDuplicates: true,
                }),
              { maxWait: 5000, timeout: 15000 },
            );
            totalShowtimesInserted += created.count;
            for (const id of venueMovieIds) {
              uniqueMoviesInChain.add(id);
            }
            locationsProcessed++;
          }
          continue;
        }

        if (locData.status === 'complete') {
          discardedShowtimes += venueDiscarded;
          if (showtimesBatch.length > 0) {
            const incomingByKey = new Map<string, PendingShowtimeRow>();
            for (const row of showtimesBatch) {
              incomingByKey.set(buildShowtimeCompositeKey(row), row);
            }
            const dedupedBatch = Array.from(incomingByKey.values());

            const maxDateMs = dedupedBatch.reduce(
              (max, item) => Math.max(max, item.dateTime.getTime()),
              dedupedBatch[0].dateTime.getTime(),
            );
            const maxDateKey = getArgentinaTodayDateString(new Date(maxDateMs));
            const windowEnd =
              locData.coveredUntil ?? getArgentinaDayRange(maxDateKey).end;

            const syncResult = await this.prisma.$transaction(
              async (tx) => {
                const maybeFindMany = (tx.showtime as { findMany?: unknown })
                  .findMany;

                if (typeof maybeFindMany === 'function') {
                  const existing = await tx.showtime.findMany({
                    where: {
                      locationId: resolvedLocationId,
                      dateTime: {
                        gte: windowStart,
                        lte: windowEnd,
                      },
                    },
                    select: {
                      id: true,
                      movieId: true,
                      dateTime: true,
                      format: true,
                      language: true,
                      ticketUrl: true,
                    },
                  });

                  const obsoleteIds: number[] = [];
                  const unchangedKeys = new Set<string>();

                  for (const row of existing) {
                    const key = buildShowtimeCompositeKey(row);
                    const incoming = incomingByKey.get(key);
                    if (
                      !incoming ||
                      incoming.ticketUrl !== row.ticketUrl ||
                      unchangedKeys.has(key)
                    ) {
                      obsoleteIds.push(row.id);
                    } else {
                      unchangedKeys.add(key);
                    }
                  }

                  const toInsert = dedupedBatch.filter(
                    (row) => !unchangedKeys.has(buildShowtimeCompositeKey(row)),
                  );

                  if (obsoleteIds.length > 0) {
                    await tx.showtime.deleteMany({
                      where: { id: { in: obsoleteIds } },
                    });
                  }

                  let insertedCount = 0;
                  if (toInsert.length > 0) {
                    const created = await tx.showtime.createMany({
                      data: toInsert,
                      skipDuplicates: true,
                    });
                    insertedCount = created.count;
                  }

                  return {
                    insertedCount,
                    unchangedCount: unchangedKeys.size,
                  };
                }

                await tx.showtime.deleteMany({
                  where: {
                    locationId: resolvedLocationId,
                    dateTime: {
                      gte: windowStart,
                      lte: windowEnd,
                    },
                  },
                });

                const created = await tx.showtime.createMany({
                  data: dedupedBatch,
                  skipDuplicates: true,
                });

                return { insertedCount: created.count, unchangedCount: 0 };
              },
              { maxWait: 5000, timeout: 15000 },
            );

            totalShowtimesInserted += syncResult.insertedCount;
            totalShowtimesUnchanged += syncResult.unchangedCount;
            for (const id of venueMovieIds) {
              uniqueMoviesInChain.add(id);
            }
            locationsProcessed++;
          }
        }
      } catch (error: unknown) {
        hadPersistenceFailure = true;
        const msg = error instanceof Error ? error.message : String(error);
        const venueError = `[${locData.locationName}] Fallo transaccional al persistir cartelera: ${msg}`;
        this.logger.error(`[${chainData.chainName}] ${venueError}`);
        effectiveLocations[i] = {
          ...locData,
          status: 'failed',
          errors: [...(locData.errors ?? []), venueError],
        };
        effectiveErrors.push(venueError);
      }
    }

    if (hadPersistenceFailure) {
      locationsComplete = 0;
      locationsEmptyVerified = 0;
      locationsPartial = 0;
      locationsFailed = 0;
      for (const loc of effectiveLocations) {
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
    }

    const finalStatus = hadPersistenceFailure
      ? deriveChainScrapeStatus(
          effectiveLocations,
          chainData.expectedLocations,
          effectiveErrors,
        )
      : chainData.status;

    const durationMs = Date.now() - startTime;
    this.logger.log(
      `[${chainData.chainName}] estado=${finalStatus}, sedesProcesadas=${locationsProcessed}/${chainData.expectedLocations}, películas=${uniqueMoviesInChain.size}, horarios=${totalShowtimesInserted}, descartados=${discardedShowtimes} en ${(durationMs / 1000).toFixed(1)}s`,
    );

    return {
      chainKey,
      chainName: chainData.chainName,
      status: finalStatus,
      expectedLocations: chainData.expectedLocations,
      locationsComplete,
      locationsEmptyVerified,
      locationsPartial,
      locationsFailed,
      locationsProcessed,
      moviesResolved: uniqueMoviesInChain.size,
      showtimesInserted: totalShowtimesInserted,
      showtimesUnchanged: totalShowtimesUnchanged,
      discardedShowtimes,
      durationMs,
      errors: effectiveErrors,
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
