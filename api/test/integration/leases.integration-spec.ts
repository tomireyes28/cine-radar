import { Logger } from '@nestjs/common';
import { PrismaService } from '../../src/prisma/prisma.service';
import {
  ICinemaScraper,
  ScrapedChainResult,
} from '../../src/scraper/interfaces/scraper.interface';
import { MovieIdentityService } from '../../src/scraper/services/movie-identity.service';
import { TitleNormalizerService } from '../../src/scraper/services/title-normalizer.service';
import {
  ScraperLockService,
  GLOBAL_SCRAPER_LOCK_KEY,
  buildChainLockKey,
} from '../../src/scraper/services/scraper-lock.service';
import { fencedTransaction } from '../../src/scraper/services/scraper-lease';
import { TmdbLookupResult, TmdbService } from '../../src/tmdb/tmdb.service';
import { client, globalOrchestrator, orchestrator, reset } from './helpers';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
const sleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));
const empty: ScrapedChainResult = {
  chainName: 'Test chain',
  status: 'partial',
  expectedLocations: 1,
  errors: [],
  locations: [{ locationName: 'Test venue', status: 'partial', movies: [] }],
};

describe('R05 PostgreSQL lease renewal, deadlines and stale writer fencing', () => {
  let first: PrismaService;
  let second: PrismaService;
  beforeAll(() => {
    Logger.overrideLogger(false);
    first = client();
    second = client();
  });
  beforeEach(async () => reset(first));
  afterAll(async () => {
    await Promise.all([first.$disconnect(), second.$disconnect()]);
  });

  it('renews a live lease beyond its original expiration', async () => {
    const locks = new ScraperLockService(first, {
      heartbeatMs: 80,
      chainRunTimeoutMs: 5000,
    });
    const key = buildChainLockKey('heartbeat');
    const owner = (await locks.acquire(key, 800))!;
    const lease = locks.watch(key, owner, 800);
    try {
      await lease.run(async () => {
        await sleep(1700);
      });
      expect(await new ScraperLockService(second).acquire(key, 800)).toBeNull();
      expect(await locks.renew(key, owner, 800)).toBe(true);
    } finally {
      await lease.close();
      await locks.release(key, owner);
    }
    expect(() => lease.assertActive()).toThrow();
  });
  it('rejects a stale owner and prevents its release from deleting a successor lease', async () => {
    const locks = new ScraperLockService(first, { heartbeatMs: 60000 });
    const successor = new ScraperLockService(second);
    const key = buildChainLockKey('expired');
    const old = (await locks.acquire(key, 5000))!;
    const stale = locks.watch(key, old, 5000);
    await second.scraperLock.update({
      where: { lockKey: key },
      data: { expiresAt: new Date(0) },
    });
    const current = (await successor.acquire(key, 5000))!;
    const live = successor.watch(key, current, 5000);
    try {
      await expect(
        fencedTransaction(first, stale.guard, (tx) =>
          tx.movie.create({ data: { normalizedKey: 'stale', title: 'Stale' } }),
        ),
      ).rejects.toThrow();
      expect(await locks.renew(key, old, 5000)).toBe(false);
      expect(await locks.release(key, old)).toBe(false);
      await fencedTransaction(second, live.guard, (tx) =>
        tx.movie.create({ data: { normalizedKey: 'live', title: 'Live' } }),
      );
      expect(
        (await first.movie.findMany()).map((movie) => movie.title),
      ).toEqual(['Live']);
      expect(
        (await first.scraperLock.findUnique({ where: { lockKey: key } }))
          ?.ownerId,
      ).toBe(current);
    } finally {
      await stale.close();
      await live.close();
      await successor.release(key, current);
    }
  });
  it('rolls back a transaction that outlives its lease before admitting the next owner', async () => {
    const locks = new ScraperLockService(first, { heartbeatMs: 60000 });
    const key = buildChainLockKey('transaction');
    const owner = (await locks.acquire(key, 800))!;
    const lease = locks.watch(key, owner, 800);
    const entered = deferred<void>();
    const finish = deferred<void>();
    const writing = fencedTransaction(first, lease.guard, async (tx) => {
      entered.resolve();
      await finish.promise;
      return tx.movie.create({
        data: { normalizedKey: 'must-rollback', title: 'Stale' },
      });
    });
    // Attach rejection handling immediately; the failure is expected after the barrier.
    const failed = expect(writing).rejects.toThrow();
    try {
      await entered.promise;
      await sleep(900);
      const acquiring = new ScraperLockService(second).acquire(key, 5000);
      finish.resolve();
      await failed;
      const next = await acquiring;
      expect(next).toBeTruthy();
      expect(next).not.toBe(owner);
      expect(await first.movie.count()).toBe(0);
      await locks.release(key, next!);
    } finally {
      finish.resolve();
      await lease.close();
    }
  });
  it('atomically excludes global and individual admissions in both directions', async () => {
    const a = new ScraperLockService(first);
    const b = new ScraperLockService(second);
    const key = buildChainLockKey('atlas');
    const owners = await Promise.all([
      a.acquire(GLOBAL_SCRAPER_LOCK_KEY),
      b.acquire(key),
    ]);
    expect(owners.filter(Boolean)).toHaveLength(1);
    if (owners[0]) await a.release(GLOBAL_SCRAPER_LOCK_KEY, owners[0]);
    if (owners[1]) await b.release(key, owners[1]);
    const chain = (await a.acquire(key))!;
    expect(await b.acquire(GLOBAL_SCRAPER_LOCK_KEY)).toBeNull();
    await a.release(key, chain);
    const global = (await b.acquire(GLOBAL_SCRAPER_LOCK_KEY))!;
    expect(await a.acquire(key)).toBeNull();
    const child = await a.acquire(key, 5000, global);
    expect(child).toBeTruthy();
    await a.release(key, child!);
    await b.release(GLOBAL_SCRAPER_LOCK_KEY, global);
  });
  it('renews a global lease and its authorized child without blocking its own work', async () => {
    const locks = new ScraperLockService(first, {
      heartbeatMs: 80,
      chainRunTimeoutMs: 5000,
      globalRunTimeoutMs: 5000,
    });
    const globalOwner = (await locks.acquire(GLOBAL_SCRAPER_LOCK_KEY, 800))!;
    const global = locks.watch(GLOBAL_SCRAPER_LOCK_KEY, globalOwner, 800);
    const key = buildChainLockKey('child');
    const childOwner = (await locks.acquire(key, 800, globalOwner))!;
    const child = locks.watch(key, childOwner, 800, global);
    try {
      await child.run(async () => {
        await sleep(1700);
      });
      await fencedTransaction(first, child.guard, (tx) =>
        tx.movie.create({ data: { normalizedKey: 'child', title: 'Child' } }),
      );
      expect(
        await new ScraperLockService(second).acquire(GLOBAL_SCRAPER_LOCK_KEY),
      ).toBeNull();
      expect(await first.movie.count()).toBe(1);
    } finally {
      await child.close();
      await locks.release(key, childOwner);
      await global.close();
      await locks.release(GLOBAL_SCRAPER_LOCK_KEY, globalOwner);
    }
  });
  it('runs all six strategies under a global lease and releases every child', async () => {
    const locks = new ScraperLockService(first, {
      heartbeatMs: 20,
      globalRunTimeoutMs: 10000,
    });
    const providers = [
      'atlas',
      'multiplex',
      'showcase',
      'cinemacenter',
      'cinemark',
      'cinepolis',
    ].map((key) => ({
      chainKey: key,
      chainName: key,
      scrape: (): Promise<ScrapedChainResult> =>
        Promise.resolve({
          chainName: key,
          status: 'empty_verified',
          expectedLocations: 1,
          errors: [],
          locations: [
            {
              locationName: `${key} venue`,
              status: 'empty_verified',
              movies: [],
              coveredFrom: new Date('2028-01-01T00:00:00Z'),
              coveredUntil: new Date('2028-01-02T00:00:00Z'),
            },
          ],
        }),
    }));
    const summary = await globalOrchestrator(
      first,
      {} as MovieIdentityService,
      providers,
      locks,
    ).runAll();
    expect(summary.status).toBe('ok');
    expect(summary.chains).toHaveLength(6);
    expect(await first.cinemaChain.count()).toBe(6);
    expect(await first.scraperLock.count()).toBe(0);
    expect(await first.scrapeRun.count()).toBe(1);
    expect(await first.chainScrapeState.count()).toBe(6);
    expect(
      await first.chainScrapeState.count({
        where: { status: 'empty_verified', lastSuccessAt: { not: null } },
      }),
    ).toBe(6);
  });
  it('does not let a suspended orchestrator overwrite a successor snapshot', async () => {
    const locks = new ScraperLockService(first, { heartbeatMs: 60000 });
    const entered = deferred<void>();
    const finish = deferred<ScrapedChainResult>();
    const provider: ICinemaScraper = {
      chainKey: 'atlas',
      chainName: 'Test chain',
      scrape: () => {
        entered.resolve();
        return finish.promise;
      },
    };
    const oldRun = orchestrator(
      first,
      {} as MovieIdentityService,
      provider,
      locks,
    ).runByChainKey('atlas');
    await entered.promise;
    const key = buildChainLockKey('atlas');
    await second.scraperLock.update({
      where: { lockKey: key },
      data: { expiresAt: new Date(0) },
    });
    const successor = new ScraperLockService(second);
    const current = (await successor.acquire(key))!;
    const lease = successor.watch(key, current);
    try {
      await fencedTransaction(second, lease.guard, (tx) =>
        tx.cinemaChain.create({ data: { name: 'Successor snapshot' } }),
      );
      finish.resolve(empty);
      const result = await oldRun;
      expect(result.status).toBe('failed');
      expect(
        (await first.cinemaChain.findMany()).map((chain) => chain.name),
      ).toEqual(['Successor snapshot']);
      expect(
        (await first.scraperLock.findUnique({ where: { lockKey: key } }))
          ?.ownerId,
      ).toBe(current);
    } finally {
      finish.resolve(empty);
      await lease.close();
      await successor.release(key, current);
    }
  });
  it('ends a stalled provider at the deadline and discards its late result', async () => {
    const locks = new ScraperLockService(first, {
      heartbeatMs: 20,
      chainRunTimeoutMs: 150,
    });
    const entered = deferred<void>();
    const finish = deferred<ScrapedChainResult>();
    let signal: AbortSignal | undefined;
    const provider: ICinemaScraper = {
      chainKey: 'atlas',
      chainName: 'Test chain',
      scrape: (value) => {
        signal = value;
        entered.resolve();
        return finish.promise;
      },
    };
    const running = orchestrator(
      first,
      {} as MovieIdentityService,
      provider,
      locks,
    ).runByChainKey('atlas');
    await entered.promise;
    expect((await running).status).toBe('failed');
    expect(signal?.aborted).toBe(true);
    finish.resolve(empty);
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(await first.cinemaChain.count()).toBe(0);
    expect(await first.scraperLock.count()).toBe(0);
  });
  it('fences movie metadata writes when an uncancellable lookup finishes after the deadline', async () => {
    const locks = new ScraperLockService(first, {
      heartbeatMs: 30,
      chainRunTimeoutMs: 1500,
    });
    const entered = deferred<void>();
    const finish = deferred<TmdbLookupResult>();
    const identity = new MovieIdentityService(
      first,
      {
        lookupMovie: () => {
          entered.resolve();
          return finish.promise;
        },
      } as unknown as TmdbService,
      new TitleNormalizerService(),
    );
    const data: ScrapedChainResult = {
      ...empty,
      locations: [
        {
          ...empty.locations[0],
          movies: [
            {
              rawTitle: 'Late Film',
              showtimes: [
                {
                  dateTime: new Date('2028-01-01T18:00:00Z'),
                  format: '2D',
                  language: 'SUB',
                  ticketUrl: 'https://test/late',
                },
              ],
            },
          ],
        },
      ],
    };
    const provider: ICinemaScraper = {
      chainKey: 'atlas',
      chainName: 'Test chain',
      scrape: () => Promise.resolve(data),
    };
    const running = orchestrator(
      first,
      identity,
      provider,
      locks,
    ).runByChainKey('atlas');
    await entered.promise;
    expect((await running).status).toBe('failed');
    finish.resolve({ status: 'not_found' });
    // Await a DB round-trip behind the late resolver and then yield its continuation.
    await first.$queryRaw`SELECT 1`;
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(await first.movie.count()).toBe(0);
    expect(await first.movieAlias.count()).toBe(0);
    expect(await first.showtime.count()).toBe(0);
  });
});
