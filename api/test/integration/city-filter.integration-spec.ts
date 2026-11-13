import { PrismaService } from '../../src/prisma/prisma.service';
import { MoviesService } from '../../src/movies/movies.service';
import { MovieFilters } from '../../src/movies/movies.interface';
import { TmdbService } from '../../src/tmdb/tmdb.service';
import {
  getArgentinaDayRange,
  getArgentinaTodayDateString,
  shiftCalendarDate,
} from '../../src/common/utils/argentina-time.util';
import { client, reset } from './helpers';

describe('R10 city or cinema-name filtering on PostgreSQL', () => {
  let db: PrismaService;
  let service: MoviesService;
  let commonId: number;
  let futureId: number;
  let chainA: number;
  let chainB: number;
  const venues = new Map<string, number>();
  const day = shiftCalendarDate(getArgentinaTodayDateString(), 14);
  const nextDay = shiftCalendarDate(day, 1);
  beforeAll(() => {
    db = client();
  });
  afterAll(async () => {
    await db.$disconnect();
  });
  beforeEach(async () => {
    await reset(db);
    venues.clear();
    service = new MoviesService(db, {} as TmdbService);
    chainA = (await db.cinemaChain.create({ data: { name: 'Chain A' } })).id;
    chainB = (await db.cinemaChain.create({ data: { name: 'Chain B' } })).id;
    commonId = (
      await db.movie.create({
        data: { normalizedKey: 'common', title: 'Common movie' },
      })
    ).id;
    futureId = (
      await db.movie.create({
        data: { normalizedKey: 'future', title: 'Future movie' },
      })
    ).id;
    const foreignId = (
      await db.movie.create({
        data: { normalizedKey: 'foreign', title: 'Elsewhere' },
      })
    ).id;
    const rows = [
      ['central', 'Central Plaza', 'Rosario', 'Interior', chainA],
      ['legacy', 'Rosario Center', 'Santa Fe', 'Interior', chainA],
      ['north', 'La Ribera', 'Rosario', 'GBA Norte', chainA],
      ['other-chain', 'Otro Plaza', 'Rosario', 'Interior', chainB],
      ['accent', 'Cabildo', 'Córdoba', 'Interior', chainB],
      ['literal', 'Cinema_100%\\Box', 'LiteralTown', 'Interior', chainA],
      ['cache-a', 'First cache venue', 'A:B', 'C', chainA],
      ['cache-b', 'Second cache venue', 'A', 'B:C', chainA],
      ['future', 'Tomorrow only', 'FutureCity', 'Interior', chainA],
      ['foreign', 'Unrelated venue', 'Mendoza', 'Interior', chainB],
    ] as const;
    for (const [key, name, city, zone, chainId] of rows) {
      const venue = await db.cinemaLocation.create({
        data: { name, city, zone, chainId, address: 'Test', lat: 1, lng: 1 },
      });
      venues.set(key, venue.id);
      await db.showtime.create({
        data: {
          movieId:
            key === 'future'
              ? futureId
              : key === 'foreign'
                ? foreignId
                : commonId,
          locationId: venue.id,
          dateTime: new Date(
            getArgentinaDayRange(
              key === 'future' ? nextDay : day,
            ).start.getTime() +
              18 * 3600000,
          ),
          format: '2D',
          language: 'SUB',
          ticketUrl: `https://test/${key}`,
        },
      });
    }
  });
  async function assertVenues(filters: MovieFilters, keys: string[]) {
    const query = { date: day, ...filters };
    const billboard = await service.getNowPlaying(query);
    const common = billboard.find((movie) => movie.id === commonId);
    expect(common?.cinemaCount ?? 0).toBe(keys.length);
    const detail = await service.getMovieDetail(commonId, query);
    expect(
      detail?.cinemas.map((group) => group.cinema.id).sort((a, b) => a - b),
    ).toEqual(keys.map((key) => venues.get(key)!).sort((a, b) => a - b));
    return common;
  }
  it('finds a city absent from the venue name and preserves partial cinema-name searches', async () => {
    await assertVenues({ city: '  ROSARIO  ' }, [
      'central',
      'legacy',
      'north',
      'other-chain',
    ]);
    await assertVenues({ city: 'central pla' }, ['central']);
    expect(
      (await service.getNowPlaying({ date: day, city: 'Rosario' })).map(
        (movie) => movie.id,
      ),
    ).toEqual([commonId]);
  });
  it('ANDs the city/name alternatives with zone, chain and cinema IDs', async () => {
    await assertVenues(
      { city: 'Rosario', zone: 'Interior', chainId: String(chainA) },
      ['central', 'legacy'],
    );
    await assertVenues({ city: 'Rosario', zone: 'GBA Norte' }, ['north']);
    await assertVenues(
      { city: 'Rosario', cinemaId: String(venues.get('central')) },
      ['central'],
    );
    await assertVenues(
      {
        city: 'Rosario',
        cinemaId: String(venues.get('other-chain')),
        chainId: String(chainA),
      },
      [],
    );
  });
  it('preserves accented text and does not silently remove diacritics', async () => {
    await assertVenues({ city: 'córdoba' }, ['accent']);
    await assertVenues({ city: 'Cordoba' }, []);
  });
  it.each(['%', '_', '\\'])(
    'treats %s literally rather than as SQL pattern syntax',
    async (city) => {
      await assertVenues({ city }, ['literal']);
    },
  );
  it('treats a whitespace-only city as no city restriction', async () => {
    await assertVenues({ city: '   ' }, [
      'central',
      'legacy',
      'north',
      'other-chain',
      'accent',
      'literal',
      'cache-a',
      'cache-b',
    ]);
  });
  it('does not mix cache entries when city and zone contain colons', async () => {
    const first = await assertVenues({ city: 'A:B', zone: 'C' }, ['cache-a']);
    const second = await assertVenues({ city: 'A', zone: 'B:C' }, ['cache-b']);
    expect(first?.showtimes[0].ticketUrl).toBe('https://test/cache-a');
    expect(second?.showtimes[0].ticketUrl).toBe('https://test/cache-b');
  });
  it('keeps the date restriction in both billboard and detail', async () => {
    expect(
      await service.getNowPlaying({ date: day, city: 'FutureCity' }),
    ).toEqual([]);
    expect(
      (await service.getNowPlaying({ date: nextDay, city: 'FutureCity' })).map(
        (movie) => movie.id,
      ),
    ).toEqual([futureId]);
    expect(
      (
        await service.getMovieDetail(futureId, {
          date: day,
          city: 'FutureCity',
        })
      )?.cinemas,
    ).toEqual([]);
    expect(
      (
        await service.getMovieDetail(futureId, {
          date: nextDay,
          city: 'FutureCity',
        })
      )?.cinemas,
    ).toHaveLength(1);
  });
});
