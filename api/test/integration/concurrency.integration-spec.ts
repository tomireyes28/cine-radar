import { PrismaService } from '../../src/prisma/prisma.service';
import { MovieIdentityService } from '../../src/scraper/services/movie-identity.service';
import { TitleNormalizerService } from '../../src/scraper/services/title-normalizer.service';
import { TmdbLookupResult, TmdbService } from '../../src/tmdb/tmdb.service';
import { barrier, client, reset } from './helpers';

const matched: TmdbLookupResult = {
  status: 'matched',
  movie: {
    tmdbId: 9001,
    officialTitle: 'Concurrent Film',
    posterUrl: null,
    backdropUrl: null,
    overview: '',
    releaseDate: '2026-01-01',
    duration: null,
    rating: null,
    genres: [],
  },
};

describe('R04 concurrent movie identity across independent Prisma clients', () => {
  let first: PrismaService;
  let second: PrismaService;
  beforeAll(() => {
    first = client();
    second = client();
  });
  beforeEach(async () => reset(first));
  afterEach(async () => {
    await first.$executeRawUnsafe(
      'DROP TRIGGER IF EXISTS fail_alias ON "MovieAlias"',
    );
    await first.$executeRawUnsafe('DROP FUNCTION IF EXISTS fail_alias()');
  });
  afterAll(async () => {
    await Promise.all([first.$disconnect(), second.$disconnect()]);
  });

  function resolver(
    db: PrismaService,
    lookup: () => Promise<TmdbLookupResult>,
  ): MovieIdentityService {
    return new MovieIdentityService(
      db,
      { lookupMovie: lookup } as TmdbService,
      new TitleNormalizerService(),
    );
  }
  it('resolves simultaneous discoveries of the same source to one fallback movie', async () => {
    const sync = barrier(2);
    const lookup = async (): Promise<TmdbLookupResult> => {
      await sync();
      return { status: 'not_found' };
    };
    const ids = await Promise.all(
      [first, second].map((db) =>
        resolver(db, lookup).resolveAndUpsertMovie('Film', new Map(), {
          provider: 'atlas',
          sourceMovieId: 'one',
        }),
      ),
    );
    expect(new Set(ids).size).toBe(1);
    expect(await first.movie.count()).toBe(1);
    expect(await first.movieAlias.count()).toBe(1);
  });
  it('resolves discoveries by different chains to one canonical movie with both aliases', async () => {
    const sync = barrier(2);
    const lookup = async (): Promise<TmdbLookupResult> => {
      await sync();
      return matched;
    };
    const ids = await Promise.all(
      [first, second].map((db, index) =>
        resolver(db, lookup).resolveAndUpsertMovie('Film', new Map(), {
          provider: `chain-${index}`,
          sourceMovieId: 'one',
        }),
      ),
    );
    expect(new Set(ids).size).toBe(1);
    expect(await first.movie.count()).toBe(1);
    expect(await first.movieAlias.count()).toBe(2);
  });
  it('merges two temporary identities concurrently without losing aliases or functions', async () => {
    const offline = (): Promise<TmdbLookupResult> =>
      Promise.resolve({ status: 'transient_error', reason: 'offline' });
    const contexts = [
      { provider: 'atlas', sourceMovieId: 'a' },
      { provider: 'cinemark', sourceMovieId: 'b' },
    ];
    const tempIds = await Promise.all(
      [first, second].map((db, index) =>
        resolver(db, offline).resolveAndUpsertMovie(
          'Variant',
          new Map(),
          contexts[index],
        ),
      ),
    );
    const canonical = await first.movie.create({
      data: { normalizedKey: 'canonical', title: 'Film', tmdbId: 9001 },
    });
    const chain = await first.cinemaChain.create({ data: { name: 'Test' } });
    const venue = await first.cinemaLocation.create({
      data: {
        name: 'Venue',
        chainId: chain.id,
        address: 'test',
        lat: 1,
        lng: 1,
      },
    });
    await first.showtime.createMany({
      data: [canonical.id, ...(tempIds as number[])].map((movieId) => ({
        movieId,
        locationId: venue.id,
        dateTime: new Date('2028-01-01T18:00:00Z'),
        format: '2D',
        language: 'SUB',
        ticketUrl: 'https://test/ticket',
      })),
    });
    const sync = barrier(2);
    const lookup = async (): Promise<TmdbLookupResult> => {
      await sync();
      return matched;
    };
    const ids = await Promise.all(
      [first, second].map((db, index) =>
        resolver(db, lookup).resolveAndUpsertMovie(
          'Variant',
          new Map(),
          contexts[index],
        ),
      ),
    );
    expect(ids).toEqual([canonical.id, canonical.id]);
    expect(await first.movie.count()).toBe(1);
    expect(await first.showtime.count()).toBe(1);
    expect(
      (await first.movieAlias.findMany()).every(
        (alias) => alias.movieId === canonical.id,
      ),
    ).toBe(true);
    expect(await first.movieAlias.count()).toBe(2);
  });
  it('rolls back movie creation if the alias INSERT fails', async () => {
    await first.$executeRawUnsafe(
      "CREATE FUNCTION fail_alias() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected alias failure'; END $$",
    );
    await first.$executeRawUnsafe(
      'CREATE TRIGGER fail_alias BEFORE INSERT ON "MovieAlias" FOR EACH ROW EXECUTE FUNCTION fail_alias()',
    );
    const offline = (): Promise<TmdbLookupResult> =>
      Promise.resolve({ status: 'not_found' });
    await expect(
      resolver(first, offline).resolveAndUpsertMovie('Film', new Map(), {
        provider: 'test',
        sourceMovieId: 'x',
      }),
    ).rejects.toThrow();
    expect(await first.movie.count()).toBe(0);
    expect(await first.movieAlias.count()).toBe(0);
  });
});
