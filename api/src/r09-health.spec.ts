import { AppService } from './app.service';
import { PrismaService } from './prisma/prisma.service';
import { HEALTH_CHAIN_KEYS, SCRAPE_FRESHNESS_MS } from './common/health-policy';

describe('R09: freshness independent from readiness and future inventory', () => {
  const now = new Date('2026-11-13T16:00:00Z');
  const state = (chainKey: string, status = 'complete') => ({
    chainKey,
    lastAttemptAt: now,
    lastSuccessAt: now,
    status,
    expectedLocations: 2,
    verifiedLocations: 2,
    emptyVerifiedLocations: status === 'empty_verified' ? 2 : 0,
  });
  const setup = (states = HEALTH_CHAIN_KEYS.map((key) => state(key))) => {
    const db = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      showtime: {
        aggregate: jest.fn().mockResolvedValue({
          _count: { _all: 50 },
          _max: { dateTime: new Date('2027-01-01Z') },
        }),
      },
      chainScrapeState: { findMany: jest.fn().mockResolvedValue(states) },
      scrapeRun: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    return { db, service: new AppService(db as unknown as PrismaService) };
  };
  beforeEach(() => jest.useFakeTimers({ now }));
  afterEach(() => jest.useRealTimers());

  it('reports a failed chain alongside fresh chains despite future inventory', async () => {
    const states = HEALTH_CHAIN_KEYS.map((key) => state(key));
    states[0].status = 'failed';
    const { service } = setup(states);
    const health = await service.getHealthStatus();
    expect(health.status).toBe('ok');
    expect(health.billboard).toMatchObject({
      activeFutureShowtimes: 50,
      isStale: true,
      freshness: 'partial',
    });
    expect(health.billboard.chains[0]).toMatchObject({
      freshness: 'partial',
      lastAttemptStatus: 'failed',
      lastSuccessAt: now.toISOString(),
    });
  });

  it('expires old successful extractions even with distant future showtimes', async () => {
    const states = HEALTH_CHAIN_KEYS.map((key) => ({
      ...state(key),
      lastSuccessAt: new Date(now.getTime() - SCRAPE_FRESHNESS_MS),
    }));
    const { service } = setup(states);
    expect((await service.getHealthStatus()).billboard.freshness).toBe('stale');
  });

  it('accepts verified empty coverage without claiming the API is unavailable', async () => {
    const { db, service } = setup(
      HEALTH_CHAIN_KEYS.map((key) => state(key, 'empty_verified')),
    );
    db.showtime.aggregate.mockResolvedValue({
      _count: { _all: 0 },
      _max: { dateTime: null as unknown as Date },
    });
    const health = await service.getHealthStatus();
    expect(health.billboard).toMatchObject({
      activeFutureShowtimes: 0,
      isStale: false,
      freshness: 'fresh',
    });
  });

  it('reports missing historical evidence as unknown', async () => {
    const { service } = setup([]);
    const health = await service.getHealthStatus();
    expect(health.billboard.freshness).toBe('unknown');
    expect(health.billboard.chains).toHaveLength(6);
    expect(health.status).toBe('ok');
  });

  it('coalesces concurrent metrics queries, caches 15s, but always pings', async () => {
    const { db, service } = setup();
    await Promise.all(
      Array.from({ length: 100 }, () => service.getHealthStatus()),
    );
    expect(db.$queryRaw).toHaveBeenCalledTimes(100);
    expect(db.showtime.aggregate).toHaveBeenCalledTimes(1);
    expect(db.chainScrapeState.findMany).toHaveBeenCalledTimes(1);
    expect(db.scrapeRun.findFirst).toHaveBeenCalledTimes(1);
    jest.advanceTimersByTime(15_000);
    await service.getHealthStatus();
    expect(db.showtime.aggregate).toHaveBeenCalledTimes(2);
  });

  it('does not cache DB connectivity or conceal an outage with cached metrics', async () => {
    const { db, service } = setup();
    await service.getHealthStatus();
    db.$queryRaw.mockRejectedValueOnce(new Error('offline'));
    await expect(service.getHealthStatus()).rejects.toMatchObject({
      status: 503,
    });
    expect((await service.getHealthStatus()).database).toBe('connected');
  });

  it('degrades metrics failures without rejecting readiness or retrying each probe', async () => {
    const { db, service } = setup();
    db.chainScrapeState.findMany.mockRejectedValue(
      new Error('missing migration'),
    );
    for (let i = 0; i < 10; i++) {
      const health = await service.getHealthStatus();
      expect(health).toMatchObject({
        status: 'ok',
        metricsStatus: 'unavailable',
        metricsAsOf: null,
        billboard: { freshness: 'unknown' },
      });
    }
    expect(db.chainScrapeState.findMany).toHaveBeenCalledTimes(1);
    db.chainScrapeState.findMany.mockResolvedValue([]);
    jest.advanceTimersByTime(15_000);
    expect((await service.getHealthStatus()).metricsStatus).toBe('ok');
  });

  it('never reports connected readiness without a database client', async () => {
    await expect(new AppService().getHealthStatus()).rejects.toMatchObject({
      status: 503,
    });
  });

  it('recomputes age while metrics are cached and marks a never-successful chain stale', async () => {
    const states = HEALTH_CHAIN_KEYS.map((key) => ({
      ...state(key),
      lastSuccessAt: new Date(now.getTime() - SCRAPE_FRESHNESS_MS + 1000),
    }));
    const { db, service } = setup(states);
    expect((await service.getHealthStatus()).billboard.freshness).toBe('fresh');
    jest.advanceTimersByTime(1000);
    expect((await service.getHealthStatus()).billboard.freshness).toBe('stale');
    expect(db.showtime.aggregate).toHaveBeenCalledTimes(1);
    const failed = setup([
      { ...state('atlas', 'failed'), lastSuccessAt: null as unknown as Date },
    ]);
    expect(
      (await failed.service.getHealthStatus()).billboard.chains[0],
    ).toMatchObject({ freshness: 'stale', ageMs: null });
  });
});
