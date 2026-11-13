import { PrismaService } from '../../src/prisma/prisma.service';
import {
  ScraperLockService,
  GLOBAL_SCRAPER_LOCK_KEY,
  buildChainLockKey,
} from '../../src/scraper/services/scraper-lock.service';
import { fencedTransaction } from '../../src/scraper/services/scraper-lease';
import { client, reset } from './helpers';

describe('Worker heartbeat during its own fenced writes', () => {
  let db: PrismaService;
  beforeAll(() => {
    db = client();
  });
  beforeEach(() => reset(db));
  afterAll(() => db.$disconnect());

  it('commits a valid write that holds its lease row past the heartbeat lock timeout', async () => {
    const locks = new ScraperLockService(db, { heartbeatMs: 20 });
    const key = buildChainLockKey('atlas');
    const owner = (await locks.acquire(key))!;
    const lease = locks.watch(key, owner);
    try {
      await lease.run(() =>
        fencedTransaction(db, lease.guard, async (tx) => {
          await tx.$executeRaw`SELECT pg_sleep(2.5)`;
          await tx.cinemaChain.create({ data: { name: 'Long valid write' } });
        }),
      );
      expect(lease.signal.aborted).toBe(false);
      expect(await db.cinemaChain.count()).toBe(1);
      expect(await locks.renew(key, owner, 1200000)).toBe(true);
    } finally {
      await lease.close();
      await locks.release(key, owner);
    }
  });

  it('also tolerates contention between global/child heartbeats and a child write', async () => {
    const locks = new ScraperLockService(db, { heartbeatMs: 20 });
    const globalOwner = (await locks.acquire(GLOBAL_SCRAPER_LOCK_KEY))!;
    const global = locks.watch(GLOBAL_SCRAPER_LOCK_KEY, globalOwner);
    const key = buildChainLockKey('atlas');
    const owner = (await locks.acquire(key, 1200000, globalOwner))!;
    const child = locks.watch(key, owner, 1200000, global);
    try {
      await child.run(() =>
        fencedTransaction(db, child.guard, async (tx) => {
          await tx.$executeRaw`SELECT pg_sleep(2.5)`;
          await tx.cinemaChain.create({ data: { name: 'Long child write' } });
        }),
      );
      expect(global.signal.aborted).toBe(false);
      expect(child.signal.aborted).toBe(false);
      expect(await db.cinemaChain.count()).toBe(1);
    } finally {
      await child.close();
      await locks.release(key, owner);
      await global.close();
      await locks.release(GLOBAL_SCRAPER_LOCK_KEY, globalOwner);
    }
  });

  it('still rolls back if a deferred renewal lets the lease actually expire', async () => {
    const locks = new ScraperLockService(db, { heartbeatMs: 20 });
    const key = buildChainLockKey('atlas');
    const owner = (await locks.acquire(key, 1200))!;
    const lease = locks.watch(key, owner, 1200);
    try {
      await expect(
        lease.run(() =>
          fencedTransaction(db, lease.guard, async (tx) => {
            await tx.cinemaChain.create({ data: { name: 'Must roll back' } });
            await tx.$executeRaw`SELECT pg_sleep(2.5)`;
          }),
        ),
      ).rejects.toThrow();
      // lease.run may reject before the transaction finishes unwinding.
      await db.$queryRaw`SELECT 1`;
    } finally {
      await lease.close();
      await locks.release(key, owner);
    }
    expect(await db.cinemaChain.count()).toBe(0);
  });
});
