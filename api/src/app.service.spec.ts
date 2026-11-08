import { ServiceUnavailableException } from '@nestjs/common';
import { AppService } from './app.service';
import { resolveTrustProxySetting } from './common/config/app-setup';
import { PrismaService } from './prisma/prisma.service';
import { AtlasService } from './scraper/atlas/atlas.service';
import { CinemaCenterService } from './scraper/cinemacenter/cinemacenter.service';
import { CinemarkService } from './scraper/cinemark/cinemark.service';
import { CinepolisService } from './scraper/cinepolis/cinepolis.service';
import { MultiplexService } from './scraper/multiplex/multiplex.service';
import { MovieIdentityService } from './scraper/services/movie-identity.service';
import { ScraperOrchestratorService } from './scraper/services/scraper-orchestrator.service';
import { ShowcaseService } from './scraper/showcase/showcase.service';

describe('Observability, Health Readiness & Proxy Trust (M6)', () => {
  describe('resolveTrustProxySetting', () => {
    it('defaults to 1 hop in production and false in non-production when unset', () => {
      expect(resolveTrustProxySetting(undefined, 'production')).toBe(1);
      expect(resolveTrustProxySetting('', 'production')).toBe(1);
      expect(resolveTrustProxySetting(undefined, 'development')).toBe(false);
      expect(resolveTrustProxySetting(undefined, 'test')).toBe(false);
    });

    it('parses explicit boolean, integer hop count, and subnet strings', () => {
      expect(resolveTrustProxySetting('true', 'development')).toBe(true);
      expect(resolveTrustProxySetting('false', 'production')).toBe(false);
      expect(resolveTrustProxySetting('0', 'production')).toBe(false);
      expect(resolveTrustProxySetting('2', 'production')).toBe(2);
      expect(resolveTrustProxySetting('loopback', 'production')).toBe(
        'loopback',
      );
    });
  });

  describe('AppService.getHealthStatus', () => {
    it('returns database readiness, billboard freshness, and latest ScrapeRun snapshot', async () => {
      const horizonDate = new Date('2026-11-12T23:30:00.000Z');
      const runCompletedAt = new Date('2026-11-08T07:05:00.000Z');

      const prismaMock = {
        $queryRaw: jest.fn().mockResolvedValue([{ '?column?': 1 }]),
        showtime: {
          count: jest.fn().mockResolvedValue(420),
          aggregate: jest.fn().mockResolvedValue({
            _max: { dateTime: horizonDate },
          }),
        },
        scrapeRun: {
          findFirst: jest.fn().mockResolvedValue({
            id: 7,
            trigger: 'cli',
            scope: 'all',
            status: 'ok',
            completedAt: runCompletedAt,
            durationMs: 38400,
            locationsSucceeded: 68,
            locationsFailed: 0,
            showtimesInserted: 180,
            showtimesUnchanged: 240,
            failedChains: [],
          }),
        },
      } as unknown as PrismaService;

      const service = new AppService(prismaMock);
      const health = await service.getHealthStatus();

      expect(health.status).toBe('ok');
      expect(health.database).toBe('connected');
      expect(health.billboard).toEqual({
        activeFutureShowtimes: 420,
        horizonUntil: horizonDate.toISOString(),
        isStale: false,
      });
      expect(health.lastScrapeRun).toEqual({
        id: 7,
        trigger: 'cli',
        scope: 'all',
        status: 'ok',
        completedAt: runCompletedAt.toISOString(),
        durationMs: 38400,
        locationsSucceeded: 68,
        locationsFailed: 0,
        showtimesInserted: 180,
        showtimesUnchanged: 240,
        failedChains: [],
      });
    });

    it('throws 503 ServiceUnavailableException when PostgreSQL ping fails', async () => {
      const prismaMock = {
        $queryRaw: jest
          .fn()
          .mockRejectedValue(new Error('Connection refused :5432')),
      } as unknown as PrismaService;

      const service = new AppService(prismaMock);
      await expect(service.getHealthStatus()).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
    });
  });

  describe('ScraperOrchestratorService ScrapeRun telemetry persistence', () => {
    it('persists ScrapeRun metrics on chain execution and tolerates telemetry write errors', async () => {
      const createScrapeRunSpy = jest.fn().mockResolvedValue({ id: 1 });
      const prismaMock: Record<string, unknown> = {
        cinemaChain: {
          upsert: jest.fn().mockResolvedValue({ id: 1, name: 'Atlas Cines' }),
        },
        cinemaLocation: {
          findMany: jest.fn().mockResolvedValue([
            {
              id: 10,
              name: 'Atlas Caballito',
              address: 'Av. Rivadavia 5071',
              zone: 'CABA',
              city: 'CABA',
              lat: -34.618,
              lng: -58.437,
              externalId: 'caballito',
              url: 'https://atlascines.com',
              chainId: 1,
            },
          ]),
        },
        showtime: {
          deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
        },
        scrapeRun: {
          create: createScrapeRunSpy,
        },
      };
      prismaMock.$transaction = jest.fn(
        (cb: (tx: Record<string, unknown>) => Promise<unknown>) =>
          cb(prismaMock),
      );

      const atlasScraper = {
        chainKey: 'atlas',
        chainName: 'Atlas Cines',
        scrape: jest.fn().mockResolvedValue({
          chainName: 'Atlas Cines',
          status: 'empty_verified',
          expectedLocations: 1,
          errors: [],
          locations: [
            {
              locationName: 'Atlas Caballito',
              status: 'empty_verified',
              movies: [],
            },
          ],
        }),
      } as unknown as AtlasService;

      const noopScraper = (key: string, name: string) =>
        ({
          chainKey: key,
          chainName: name,
          scrape: jest.fn(),
        }) as unknown;

      const orchestrator = new ScraperOrchestratorService(
        prismaMock as unknown as PrismaService,
        { resolveMovieId: jest.fn() } as unknown as MovieIdentityService,
        atlasScraper,
        noopScraper('multiplex', 'Multiplex') as MultiplexService,
        noopScraper('showcase', 'Showcase') as ShowcaseService,
        noopScraper('cinemacenter', 'Cinema Center') as CinemaCenterService,
        noopScraper('cinemark', 'Cinemark Hoyts') as CinemarkService,
        noopScraper('cinepolis', 'Cinépolis') as CinepolisService,
      );

      const summary = await orchestrator.runByChainKey('atlas', 'cli');
      expect(summary.status).toBe('empty_verified');
      expect(createScrapeRunSpy).toHaveBeenCalledTimes(1);
      expect(createScrapeRunSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            trigger: 'cli',
            scope: 'atlas',
            status: 'ok',
            expectedLocations: 1,
            locationsSucceeded: 1,
            locationsFailed: 0,
            failedChains: [],
          }) as unknown,
        }),
      );

      // Even if scrapeRun.create throws, orchestrator still returns the summary cleanly
      createScrapeRunSpy.mockRejectedValueOnce(new Error('Disk full'));
      await expect(
        orchestrator.runByChainKey('atlas', 'cli'),
      ).resolves.toMatchObject({
        status: 'empty_verified',
      });
    });
  });
});
