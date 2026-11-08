import { ConflictException, ForbiddenException } from '@nestjs/common';
import { AtlasService } from '../atlas/atlas.service';
import { CinemarkService } from '../cinemark/cinemark.service';
import { CinemaCenterService } from '../cinemacenter/cinemacenter.service';
import { CinepolisService } from '../cinepolis/cinepolis.service';
import { MultiplexService } from '../multiplex/multiplex.service';
import { ShowcaseService } from '../showcase/showcase.service';
import { PrismaService } from '../../prisma/prisma.service';
import { CronService } from '../../cron/cron.service';
import { ScraperController } from '../scraper.controller';
import { MovieIdentityService } from './movie-identity.service';
import { ScraperLockService } from './scraper-lock.service';
import { ScraperOrchestratorService } from './scraper-orchestrator.service';

interface LockRow {
  lockKey: string;
  ownerId: string;
  acquiredAt: number;
  expiresAt: number;
}

function createInMemoryLockPrisma(nowFn: () => number): {
  locks: Map<string, LockRow>;
  prisma: PrismaService;
} {
  const locks = new Map<string, LockRow>();

  const prisma = {
    $executeRaw: jest.fn(
      (strings: TemplateStringsArray, ...values: unknown[]) => {
        const sql = strings.join('?');
        const now = nowFn();

        if (sql.includes('INSERT INTO "ScraperLock"')) {
          const lockKey = String(values[0]);
          const ownerId = String(values[1]);
          const ttlMs = Number(values[2]);
          const existing = locks.get(lockKey);

          if (!existing || existing.expiresAt < now) {
            locks.set(lockKey, {
              lockKey,
              ownerId,
              acquiredAt: now,
              expiresAt: now + ttlMs,
            });
            return Promise.resolve(1);
          }
          return Promise.resolve(0);
        }

        if (sql.includes('DELETE FROM "ScraperLock"')) {
          const lockKey = String(values[0]);
          const ownerId = String(values[1]);
          const existing = locks.get(lockKey);
          if (existing && existing.ownerId === ownerId) {
            locks.delete(lockKey);
            return Promise.resolve(1);
          }
          return Promise.resolve(0);
        }

        return Promise.resolve(0);
      },
    ),
    $queryRaw: jest.fn(
      (strings: TemplateStringsArray, ...values: unknown[]) => {
        const sql = strings.join('?');
        const now = nowFn();
        if (sql.includes('SELECT "lockKey"')) {
          const lockKey = String(values[0]);
          const existing = locks.get(lockKey);
          if (existing && existing.expiresAt >= now) {
            return Promise.resolve([{ lockKey }]);
          }
        }
        return Promise.resolve([]);
      },
    ),
    showtime: {
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    cinemaChain: {
      upsert: jest.fn().mockResolvedValue({ id: 1, name: 'Showcase' }),
    },
    cinemaLocation: {
      findMany: jest.fn().mockResolvedValue([]),
      create: jest
        .fn()
        .mockResolvedValue({ id: 99, name: 'Sede', chainId: 1 }),
    },
    $transaction: jest.fn(<T>(cb: (tx: unknown) => Promise<T>) => cb(prisma)),
  } as unknown as PrismaService;

  return { locks, prisma };
}

function stubEmptyVerifiedStrategy<T>(chainKey: string): T {
  return {
    chainKey,
    chainName: chainKey,
    scrape: jest.fn().mockResolvedValue({
      chainKey,
      chainName: chainKey,
      status: 'empty_verified',
      expectedLocations: 1,
      locations: [
        {
          locationName: `${chainKey} Sede`,
          status: 'empty_verified',
          movies: [],
        },
      ],
      errors: [],
    }),
  } as unknown as T;
}

describe('Distributed Scraper Locks, Contention & HTTP Gate (F07)', () => {
  const originalEnableHttp = process.env.ENABLE_HTTP_SCRAPER;
  const originalDisableCron = process.env.DISABLE_INTERNAL_CRON;

  afterEach(() => {
    if (originalEnableHttp === undefined) {
      delete process.env.ENABLE_HTTP_SCRAPER;
    } else {
      process.env.ENABLE_HTTP_SCRAPER = originalEnableHttp;
    }

    if (originalDisableCron === undefined) {
      delete process.env.DISABLE_INTERNAL_CRON;
    } else {
      process.env.DISABLE_INTERNAL_CRON = originalDisableCron;
    }

    jest.clearAllMocks();
  });

  it('rejects concurrent runByChainKey for the same chain with ConflictException and releases lock after completion', async () => {
    const now = 1_700_000_000_000;
    const { locks, prisma } = createInMemoryLockPrisma(() => now);
    const lockService = new ScraperLockService(prisma);

    let releaseFirstScrape!: () => void;
    const firstScrapeBarrier = new Promise<void>((resolve) => {
      releaseFirstScrape = resolve;
    });

    const slowShowcase = {
      chainKey: 'showcase',
      chainName: 'Showcase',
      scrape: jest.fn(async () => {
        await firstScrapeBarrier;
        return {
          chainKey: 'showcase',
          chainName: 'Showcase',
          status: 'failed' as const,
          expectedLocations: 1,
          locations: [
            { locationName: 'Showcase Belgrano', status: 'failed' as const, movies: [] },
          ],
          errors: ['test'],
        };
      }),
    };

    const orchestrator = new ScraperOrchestratorService(
      prisma,
      {} as unknown as MovieIdentityService,
      stubEmptyVerifiedStrategy<AtlasService>('atlas'),
      stubEmptyVerifiedStrategy<MultiplexService>('multiplex'),
      slowShowcase as unknown as ShowcaseService,
      stubEmptyVerifiedStrategy<CinemaCenterService>('cinemacenter'),
      stubEmptyVerifiedStrategy<CinemarkService>('cinemark'),
      stubEmptyVerifiedStrategy<CinepolisService>('cinepolis'),
      lockService,
    );

    const run1Promise = orchestrator.runByChainKey('showcase');
    // Allow run1 to acquire the lock and reach firstScrapeBarrier
    await Promise.resolve();
    await Promise.resolve();

    expect(locks.has('scraper:chain:showcase')).toBe(true);

    // Concurrent second run must fail immediately with 409 ConflictException
    await expect(orchestrator.runByChainKey('showcase')).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(slowShowcase.scrape).toHaveBeenCalledTimes(1);

    // Finish first run -> lock must be released
    releaseFirstScrape();
    await run1Promise;
    expect(locks.has('scraper:chain:showcase')).toBe(false);
  });

  it('blocks overlapping runAll and single-chain runs while global lock is held, and CronService handles ConflictException safely', async () => {
    const now = 1_700_000_000_000;
    const { prisma } = createInMemoryLockPrisma(() => now);
    const lockService = new ScraperLockService(prisma);

    let releaseAtlas!: () => void;
    const atlasBarrier = new Promise<void>((resolve) => {
      releaseAtlas = resolve;
    });

    const slowAtlas = {
      chainKey: 'atlas',
      chainName: 'Atlas Cines',
      scrape: jest.fn(async () => {
        await atlasBarrier;
        return {
          chainKey: 'atlas',
          chainName: 'Atlas Cines',
          status: 'failed' as const,
          expectedLocations: 1,
          locations: [{ locationName: 'Atlas', status: 'failed' as const, movies: [] }],
          errors: ['test'],
        };
      }),
    };

    const orchestrator = new ScraperOrchestratorService(
      prisma,
      {} as unknown as MovieIdentityService,
      slowAtlas as unknown as AtlasService,
      stubEmptyVerifiedStrategy<MultiplexService>('multiplex'),
      stubEmptyVerifiedStrategy<ShowcaseService>('showcase'),
      stubEmptyVerifiedStrategy<CinemaCenterService>('cinemacenter'),
      stubEmptyVerifiedStrategy<CinemarkService>('cinemark'),
      stubEmptyVerifiedStrategy<CinepolisService>('cinepolis'),
      lockService,
    );

    const globalRun = orchestrator.runAll();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    // Second runAll is rejected with ConflictException
    await expect(orchestrator.runAll()).rejects.toBeInstanceOf(
      ConflictException,
    );
    // Single chain run while global run is active is also rejected
    await expect(orchestrator.runByChainKey('cinemark')).rejects.toBeInstanceOf(
      ConflictException,
    );

    // CronService swallows ConflictException without crashing the process
    process.env.DISABLE_INTERNAL_CRON = 'false';
    const cron = new CronService(orchestrator);
    await expect(cron.handleDailyScraping()).resolves.toBeUndefined();

    releaseAtlas();
    await globalRun;
  });

  it('reclaims expired leases from crashed workers and prevents stale owners from releasing reclaimed locks', async () => {
    let simulatedNow = 1_700_000_000_000;
    const { prisma } = createInMemoryLockPrisma(() => simulatedNow);
    const lockService = new ScraperLockService(prisma);

    const crashedOwner = await lockService.acquire('scraper:chain:cinepolis', 5000);
    expect(crashedOwner).toBeTruthy();

    // Before TTL expires, another worker cannot acquire it
    simulatedNow += 4000;
    expect(await lockService.acquire('scraper:chain:cinepolis', 5000)).toBeNull();

    // Once TTL expires (`expiresAt < now`), new worker atomically reclaims it
    simulatedNow += 2000;
    const newOwner = await lockService.acquire('scraper:chain:cinepolis', 5000);
    expect(newOwner).toBeTruthy();
    expect(newOwner).not.toBe(crashedOwner);

    // Stale owner waking up late CANNOT delete the new owner's active lease
    expect(
      await lockService.release('scraper:chain:cinepolis', crashedOwner!),
    ).toBe(false);
    expect(await lockService.isLocked('scraper:chain:cinepolis')).toBe(true);

    // Legitimate owner releases cleanly
    expect(
      await lockService.release('scraper:chain:cinepolis', newOwner!),
    ).toBe(true);
    expect(await lockService.isLocked('scraper:chain:cinepolis')).toBe(false);
  });

  it('disables HTTP scraping endpoints by default unless ENABLE_HTTP_SCRAPER=true', async () => {
    const runAllSpy = jest.fn().mockResolvedValue({ status: 'ok' });
    const runByChainKeySpy = jest
      .fn()
      .mockResolvedValue({ status: 'complete' });
    const orchestratorMock = {
      runAll: runAllSpy,
      runByChainKey: runByChainKeySpy,
    } as unknown as ScraperOrchestratorService;

    const controller = new ScraperController(orchestratorMock);

    delete process.env.ENABLE_HTTP_SCRAPER;
    await expect(controller.runAll()).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    await expect(controller.runByChain('cinemark')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(runAllSpy).not.toHaveBeenCalled();

    process.env.ENABLE_HTTP_SCRAPER = 'false';
    await expect(controller.runAll()).rejects.toBeInstanceOf(
      ForbiddenException,
    );

    process.env.ENABLE_HTTP_SCRAPER = 'true';
    await expect(controller.runAll()).resolves.toEqual({ status: 'ok' });
    await expect(controller.runByChain('cinemark')).resolves.toEqual({
      status: 'complete',
    });
  });
});
