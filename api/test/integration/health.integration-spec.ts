import { AppService } from '../../src/app.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import {
  checkpointChains,
  pruneScrapeRuns,
} from '../../src/scraper/services/scrape-telemetry';
import { OrchestratorChainSummary } from '../../src/scraper/services/scraper-orchestrator.service';
import { client, reset } from './helpers';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('R09 checkpoints, retention and readiness on PostgreSQL', () => {
  let db: PrismaService;
  const now = new Date();
  const summary = (
    status: OrchestratorChainSummary['status'] = 'complete',
  ): OrchestratorChainSummary => ({
    chainKey: 'atlas',
    chainName: 'Atlas Cines',
    status,
    expectedLocations: 2,
    locationsComplete: status === 'complete' ? 2 : 0,
    locationsEmptyVerified: status === 'empty_verified' ? 2 : 0,
    locationsPartial: status === 'partial' ? 1 : 0,
    locationsFailed: status === 'failed' ? 2 : 0,
    locationsProcessed: 2,
    moviesResolved: 0,
    showtimesInserted: 0,
    discardedShowtimes: 0,
    durationMs: 10,
    errors: [],
  });
  beforeAll(async () => {
    db = client();
    await db.$connect();
  });
  beforeEach(() => reset(db));
  afterAll(() => db.$disconnect());

  it('applies the additive migration to a populated pre-stage-4 schema', async () => {
    await db.$transaction(async (tx) => {
      const movie = await tx.movie.create({
        data: { title: 'Existing movie', normalizedKey: 'existing' },
      });
      await tx.scrapeRun.create({
        data: {
          trigger: 'test',
          scope: 'all',
          status: 'ok',
          startedAt: now,
          completedAt: now,
          durationMs: 1,
        },
      });
      await tx.$executeRawUnsafe('DROP TABLE "ChainScrapeState"');
      const migration = readFileSync(
        resolve(
          __dirname,
          '../../prisma/migrations/20261113170000_chain_scrape_state/migration.sql',
        ),
        'utf8',
      );
      await tx.$executeRawUnsafe(migration);
      expect(
        await tx.movie.findUnique({ where: { id: movie.id } }),
      ).toMatchObject({ title: 'Existing movie' });
      expect(await tx.scrapeRun.count()).toBe(1);
      expect(await tx.chainScrapeState.count()).toBe(0);
    });
  });

  it('keeps last success through partial/failing attempts and reports partial freshness', async () => {
    await db.$transaction((tx) => checkpointChains(tx, [summary()], now));
    for (const status of ['partial', 'failed'] as const) {
      await db.$transaction((tx) =>
        checkpointChains(tx, [summary(status)], new Date(now.getTime() + 1000)),
      );
      const state = await db.chainScrapeState.findUniqueOrThrow({
        where: { chainKey: 'atlas' },
      });
      expect(state.lastSuccessAt).toEqual(now);
      expect(state.status).toBe(status);
    }
    const health = await new AppService(db).getHealthStatus();
    expect(health).toMatchObject({ status: 'ok', metricsStatus: 'ok' });
    expect(health.billboard.freshness).toBe('partial');
    expect(health.billboard.chains[0].lastAttemptStatus).toBe('failed');
  });

  it('records bounded verified emptiness as success even without showtimes', async () => {
    await db.$transaction((tx) =>
      checkpointChains(tx, [summary('empty_verified')], now),
    );
    const health = await new AppService(db).getHealthStatus();
    expect(health.billboard.activeFutureShowtimes).toBe(0);
    expect(health.billboard.chains[0]).toMatchObject({
      freshness: 'fresh',
      emptyVerifiedLocations: 2,
    });
  });

  it('does not promote a complete label with missing venue evidence to last success', async () => {
    await db.$transaction((tx) =>
      checkpointChains(tx, [{ ...summary(), locationsComplete: 1 }], now),
    );
    expect(
      (
        await db.chainScrapeState.findUniqueOrThrow({
          where: { chainKey: 'atlas' },
        })
      ).lastSuccessAt,
    ).toBeNull();
  });

  it('ignores out-of-order telemetry instead of replacing a newer checkpoint', async () => {
    await db.$transaction((tx) =>
      checkpointChains(tx, [summary('empty_verified')], now),
    );
    await db.$transaction((tx) =>
      checkpointChains(tx, [summary('failed')], new Date(now.getTime() - 1000)),
    );
    expect(
      (
        await db.chainScrapeState.findUniqueOrThrow({
          where: { chainKey: 'atlas' },
        })
      ).status,
    ).toBe('empty_verified');
  });

  it('rolls checkpoints back with a telemetry transaction failure', async () => {
    await expect(
      db.$transaction(async (tx) => {
        await checkpointChains(tx, [summary()], now);
        throw new Error('injected rollback');
      }),
    ).rejects.toThrow('injected rollback');
    expect(await db.chainScrapeState.count()).toBe(0);
  });

  it('prunes at most 500 older-than-30-day runs without losing checkpoints', async () => {
    const old = new Date(now.getTime() - 31 * 86400000);
    const boundary = new Date(now.getTime() - 30 * 86400000);
    const run = {
      trigger: 'test',
      scope: 'atlas',
      status: 'ok',
      startedAt: old,
      completedAt: old,
      durationMs: 1,
    };
    await db.scrapeRun.createMany({
      data: Array.from({ length: 502 }, () => run),
    });
    await db.scrapeRun.create({ data: { ...run, completedAt: boundary } });
    await db.$transaction((tx) => checkpointChains(tx, [summary()], old));
    await db.$transaction((tx) => pruneScrapeRuns(tx, now));
    expect(await db.scrapeRun.count()).toBe(3);
    await db.$transaction((tx) => pruneScrapeRuns(tx, now));
    expect(await db.scrapeRun.count()).toBe(1);
    expect(await db.chainScrapeState.count()).toBe(1);
    expect(
      (await new AppService(db).getHealthStatus()).billboard.chains[0]
        .freshness,
    ).toBe('stale');
  });
});
