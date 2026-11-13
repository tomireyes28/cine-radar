import { Logger } from '@nestjs/common';
import { PrismaService } from '../../src/prisma/prisma.service';
import {
  getArgentinaDayRange,
  getArgentinaTodayDateString,
  shiftCalendarDate,
} from '../../src/common/utils/argentina-time.util';
import {
  ScrapedChainResult,
  ScrapedShowtimeItem,
} from '../../src/scraper/interfaces/scraper.interface';
import { MovieIdentityService } from '../../src/scraper/services/movie-identity.service';
import { TitleNormalizerService } from '../../src/scraper/services/title-normalizer.service';
import { ScraperLockService } from '../../src/scraper/services/scraper-lock.service';
import { TmdbLookupResult, TmdbService } from '../../src/tmdb/tmdb.service';
import { barrier, client, orchestrator, reset, strategy } from './helpers';

describe('R06 PostgreSQL persistence through the production Prisma path', () => {
  let db: PrismaService;
  let other: PrismaService;
  let movieId: number;
  let locationId: number;
  let identity: MovieIdentityService;
  const day = getArgentinaDayRange(
    shiftCalendarDate(getArgentinaTodayDateString(), 14),
  );
  const time = new Date(day.start.getTime() + 18 * 3600000);
  const show = (
    format = '2D',
    ticketUrl = 'https://test/original',
  ): ScrapedShowtimeItem => ({
    dateTime: time,
    format,
    language: 'SUB',
    ticketUrl,
  });
  const snapshot = (
    shows: ScrapedShowtimeItem[],
    status: 'complete' | 'partial' | 'empty_verified' = 'complete',
  ): ScrapedChainResult => ({
    chainName: 'Test chain',
    status,
    expectedLocations: 1,
    errors: [],
    locations: [
      {
        locationName: 'Test venue',
        status,
        coveredFrom: day.start,
        coveredUntil: day.end,
        movies: shows.length ? [{ rawTitle: 'Film', showtimes: shows }] : [],
      },
    ],
  });
  beforeAll(() => {
    Logger.overrideLogger(false);
    db = client();
    other = client();
  });
  beforeEach(async () => {
    await reset(db);
    const movie = await db.movie.create({
      data: { normalizedKey: 'film', title: 'Film', tmdbId: 100 },
    });
    movieId = movie.id;
    const chain = await db.cinemaChain.create({ data: { name: 'Test chain' } });
    const venue = await db.cinemaLocation.create({
      data: {
        chainId: chain.id,
        name: 'Test venue',
        address: 'Test',
        lat: 1,
        lng: 1,
      },
    });
    locationId = venue.id;
    // Only metadata/provider IO is stubbed; all identity queries and writes use real Prisma.
    identity = new MovieIdentityService(
      db,
      {
        lookupMovie: () =>
          Promise.resolve({
            status: 'matched',
            movie: {
              tmdbId: 100,
              officialTitle: 'Film',
              posterUrl: null,
              backdropUrl: null,
              overview: '',
              releaseDate: null,
              duration: null,
              rating: null,
              genres: [],
            },
          } satisfies TmdbLookupResult),
      } as unknown as TmdbService,
      new TitleNormalizerService(),
    );
  });
  afterEach(async () => {
    await db.$executeRawUnsafe(
      'DROP TRIGGER IF EXISTS reject_test_insert ON "Showtime"',
    );
    await db.$executeRawUnsafe('DROP FUNCTION IF EXISTS reject_test_insert()');
  });
  afterAll(async () => {
    await Promise.all([db.$disconnect(), other.$disconnect()]);
  });

  it('uses PostgreSQL 15+ and two independent sessions', async () => {
    const sync = barrier(2);
    const pids = await Promise.all(
      [db, other].map((connection) =>
        connection.$transaction(async (tx) => {
          const [row] = await tx.$queryRaw<
            { pid: number; version: number }[]
          >`SELECT pg_backend_pid() AS pid, current_setting('server_version_num')::int AS version`;
          await sync();
          expect(row.version).toBeGreaterThanOrEqual(150000);
          return row.pid;
        }),
      ),
    );
    expect(new Set(pids).size).toBe(2);
  });
  it('preserves IDs and avoids duplicate incoming functions for an unchanged snapshot', async () => {
    const original = await db.showtime.create({
      data: { movieId, locationId, ...show() },
    });
    const result = await orchestrator(
      db,
      identity,
      strategy(snapshot([show(), show()])),
    ).runByChainKey('atlas');
    expect(result.status).toBe('complete');
    expect(result.showtimesUnchanged).toBe(1);
    expect(result.showtimesInserted).toBe(0);
    expect(await db.showtime.findMany()).toEqual([original]);
  });
  it('updates changed URLs, removes cancellations and preserves dates outside coverage', async () => {
    await db.showtime.create({ data: { movieId, locationId, ...show() } });
    await db.showtime.create({
      data: { movieId, locationId, ...show('IMAX') },
    });
    const outside = await db.showtime.create({
      data: {
        movieId,
        locationId,
        ...show(),
        dateTime: new Date(day.end.getTime() + 3600000),
      },
    });
    await orchestrator(
      db,
      identity,
      strategy(snapshot([show('2D', 'https://test/new')])),
    ).runByChainKey('atlas');
    const rows = await db.showtime.findMany({ orderBy: { dateTime: 'asc' } });
    expect(rows).toHaveLength(2);
    expect(rows[0].ticketUrl).toBe('https://test/new');
    expect(rows[1]).toEqual(outside);
  });
  it('rolls back differential deletions if PostgreSQL rejects the subsequent INSERT', async () => {
    const original = await db.showtime.create({
      data: { movieId, locationId, ...show() },
    });
    await db.$executeRawUnsafe(
      `CREATE FUNCTION reject_test_insert() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.format = 'FAIL' THEN RAISE EXCEPTION 'injected INSERT failure'; END IF; RETURN NEW; END $$`,
    );
    await db.$executeRawUnsafe(
      'CREATE TRIGGER reject_test_insert BEFORE INSERT ON "Showtime" FOR EACH ROW EXECUTE FUNCTION reject_test_insert()',
    );
    const result = await orchestrator(
      db,
      identity,
      strategy(snapshot([show('FAIL')])),
    ).runByChainKey('atlas');
    expect(result.status).toBe('failed');
    expect(await other.showtime.findMany()).toEqual([original]);
  });
  it('keeps absent rows on partial extraction and bounds an explicitly empty snapshot', async () => {
    const original = await db.showtime.create({
      data: { movieId, locationId, ...show() },
    });
    const outside = await db.showtime.create({
      data: {
        movieId,
        locationId,
        ...show(),
        dateTime: new Date(day.end.getTime() + 3600000),
      },
    });
    await orchestrator(
      db,
      identity,
      strategy(snapshot([show('IMAX')], 'partial')),
    ).runByChainKey('atlas');
    expect(
      await db.showtime.findUnique({ where: { id: original.id } }),
    ).toEqual(original);
    await orchestrator(
      db,
      identity,
      strategy(snapshot([], 'empty_verified')),
    ).runByChainKey('atlas');
    expect(await db.showtime.findMany()).toEqual([outside]);
  });
  it('allows exactly one lease owner across two clients', async () => {
    const locks = [new ScraperLockService(db), new ScraperLockService(other)];
    const owners = await Promise.all(
      locks.map((lock) => lock.acquire('test:lease', 5000)),
    );
    expect(owners.filter(Boolean)).toHaveLength(1);
    const winner = owners.find((owner) => owner !== null)!;
    expect(await locks[0].release('test:lease', 'wrong-owner')).toBe(false);
    expect(await locks[1].release('test:lease', winner)).toBe(true);
  });
  it('merges temporary movies, aliases and duplicate showtimes atomically', async () => {
    const lookup = jest
      .fn<Promise<TmdbLookupResult>, [string]>()
      .mockResolvedValue({ status: 'transient_error', reason: 'offline' });
    const resolver = new MovieIdentityService(
      db,
      { lookupMovie: lookup } as unknown as TmdbService,
      new TitleNormalizerService(),
    );
    const context = { provider: 'test', sourceMovieId: 'variant' };
    const temporary = (await resolver.resolveAndUpsertMovie(
      'Variant',
      new Map(),
      context,
    ))!;
    await db.showtime.createMany({
      data: [movieId, temporary].map((id) => ({
        movieId: id,
        locationId,
        ...show(),
      })),
    });
    lookup.mockResolvedValue({
      status: 'matched',
      movie: {
        tmdbId: 100,
        officialTitle: 'Film',
        posterUrl: null,
        backdropUrl: null,
        overview: '',
        releaseDate: null,
        duration: null,
        rating: null,
        genres: [],
      },
    });
    expect(
      await resolver.resolveAndUpsertMovie('Variant', new Map(), context),
    ).toBe(movieId);
    expect(await db.movie.findUnique({ where: { id: temporary } })).toBeNull();
    expect(await db.movieAlias.findMany()).toEqual([
      expect.objectContaining({ movieId }),
    ]);
    expect(await db.showtime.count()).toBe(1);
    lookup.mockClear();
    expect(
      await resolver.resolveAndUpsertMovie('Renamed', new Map(), context),
    ).toBe(movieId);
    expect(lookup).not.toHaveBeenCalled();
  });
});
