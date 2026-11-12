import axios from 'axios';
import { AtlasService } from '../atlas/atlas.service';
import { CinemarkService } from '../cinemark/cinemark.service';
import { CinemaCenterService } from '../cinemacenter/cinemacenter.service';
import { CinepolisService } from '../cinepolis/cinepolis.service';
import { MultiplexService } from '../multiplex/multiplex.service';
import { ShowcaseService } from '../showcase/showcase.service';
import { PrismaService } from '../../prisma/prisma.service';
import { buildArgentinaDate } from '../interfaces/scraper.interface';
import { MovieIdentityService } from './movie-identity.service';
import { ScraperOrchestratorService } from './scraper-orchestrator.service';
import { TitleNormalizerService } from './title-normalizer.service';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

interface StoredShowtime {
  id: number;
  movieId: number;
  locationId: number;
  dateTime: Date;
  format: string;
  language: string;
  ticketUrl: string;
}

interface ShowtimeStoreMock {
  rows: StoredShowtime[];
  cinemaChain: { upsert: jest.Mock };
  cinemaLocation: { findMany: jest.Mock; create: jest.Mock };
  showtime: { deleteMany: jest.Mock; createMany: jest.Mock };
  $transaction: jest.Mock;
}

function stubStrategy<T>(chainKey: string): T {
  return {
    chainKey,
    chainName: chainKey,
    scrape: jest.fn(),
  } as unknown as T;
}

function createShowtimeStore(initial: StoredShowtime[]): ShowtimeStoreMock {
  let nextId = 100;
  const rows: StoredShowtime[] = [...initial];

  const prisma: ShowtimeStoreMock = {
    rows,
    cinemaChain: {
      upsert: jest.fn(({ create }: { create: { name: string } }) =>
        Promise.resolve({ id: 1, name: create.name }),
      ),
    },
    cinemaLocation: {
      findMany: jest.fn(() =>
        Promise.resolve([{ id: 10, name: 'Showcase Belgrano', chainId: 1 }]),
      ),
      create: jest.fn(({ data }: { data: { name: string; chainId: number } }) =>
        Promise.resolve({ id: 11, name: data.name, chainId: data.chainId }),
      ),
    },
    showtime: {
      deleteMany: jest.fn(
        ({
          where,
        }: {
          where: {
            locationId?: number;
            dateTime?: { lt?: Date; gte?: Date; lte?: Date };
          };
        }) => {
          let count = 0;
          for (let i = rows.length - 1; i >= 0; i--) {
            const r = rows[i];
            if (
              where.locationId !== undefined &&
              r.locationId !== where.locationId
            ) {
              continue;
            }
            const t = r.dateTime.getTime();
            if (where.dateTime?.lt && !(t < where.dateTime.lt.getTime())) {
              continue;
            }
            if (where.dateTime?.gte && !(t >= where.dateTime.gte.getTime())) {
              continue;
            }
            if (where.dateTime?.lte && !(t <= where.dateTime.lte.getTime())) {
              continue;
            }
            rows.splice(i, 1);
            count++;
          }
          return Promise.resolve({ count });
        },
      ),
      createMany: jest.fn(
        ({
          data,
          skipDuplicates,
        }: {
          data: Omit<StoredShowtime, 'id'>[];
          skipDuplicates?: boolean;
        }) => {
          let count = 0;
          for (const d of data) {
            const dup = rows.some(
              (r) =>
                r.movieId === d.movieId &&
                r.locationId === d.locationId &&
                r.dateTime.getTime() === d.dateTime.getTime() &&
                r.format === d.format &&
                r.language === d.language,
            );
            if (dup && skipDuplicates) continue;
            rows.push({ id: nextId++, ...d });
            count++;
          }
          return Promise.resolve({ count });
        },
      ),
    },
    $transaction: jest.fn(<T>(cb: (tx: ShowtimeStoreMock) => Promise<T>) =>
      cb(prisma),
    ),
  };

  return prisma;
}

describe('Partial Scrape Protection, Empty Venues & Horizon Scoping (F02)', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-11-08T12:00:00.000Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  it('preserves existing showtimes of a failed film when Showcase returns a partial scrape', async () => {
    const existingFilm1Showtime: StoredShowtime = {
      id: 1,
      movieId: 101, // Film 1 (will fail during scrape)
      locationId: 10, // Showcase Belgrano
      dateTime: buildArgentinaDate('2026-11-08', '20:00'),
      format: '2D',
      language: 'SUBTITULADA',
      ticketUrl:
        'https://entradas.todoshowcase.com/showcase/pelicula.aspx?filmid=1',
    };

    const store = createShowtimeStore([existingFilm1Showtime]);
    const showcase = new ShowcaseService(new TitleNormalizerService());

    mockedAxios.get.mockImplementation((url: string) => {
      if (url === 'https://entradas.todoshowcase.com/') {
        return Promise.resolve({
          data: '<a href="pelicula.aspx?filmid=1">1</a><a href="pelicula.aspx?filmid=2">2</a>',
        });
      }
      if (url.includes('/films/1/')) {
        return Promise.reject(new Error('HTTP 502 Bad Gateway'));
      }
      return Promise.resolve({
        data: {
          id: 2,
          name: 'Gladiador II',
          days: {
            '2026-11-08': [
              {
                id: 5,
                name: 'Showcase Belgrano',
                formats: [
                  {
                    formatDescription: '2D-Subtitulado',
                    performances: [{ showTime: '22:15' }],
                  },
                ],
              },
            ],
          },
        },
      });
    });

    const movieIdentityMock = {
      resolveAndUpsertMovie: jest.fn().mockResolvedValue(202),
    } as unknown as MovieIdentityService;

    const orchestrator = new ScraperOrchestratorService(
      store as unknown as PrismaService,
      movieIdentityMock,
      stubStrategy<AtlasService>('atlas'),
      stubStrategy<MultiplexService>('multiplex'),
      showcase,
      stubStrategy<CinemaCenterService>('cinemacenter'),
      stubStrategy<CinemarkService>('cinemark'),
      stubStrategy<CinepolisService>('cinepolis'),
    );

    const summary = await orchestrator.runByChainKey('showcase');

    expect(summary.status).toBe('partial');
    // Film 1's existing showtime MUST still be present (not wiped out!)
    expect(store.rows.some((r) => r.movieId === 101)).toBe(true);
    // Film 2's newly extracted showtime was added
    expect(store.rows.some((r) => r.movieId === 202)).toBe(true);
  });

  it('clears stale showtimes on empty_verified venues, but preserves them on unverified HTTP 200 HTML', async () => {
    const staleShowtime: StoredShowtime = {
      id: 2,
      movieId: 101,
      locationId: 10,
      dateTime: buildArgentinaDate('2026-11-09', '18:00'),
      format: '2D',
      language: 'CASTELLANO',
      ticketUrl: 'https://cine/old',
    };

    // Case A: Multiplex returns HTTP 200 with an empty/maintenance HTML page (not verified empty)
    const storeUnverified = createShowtimeStore([staleShowtime]);
    const multiplex = new MultiplexService(new TitleNormalizerService());
    mockedAxios.get.mockResolvedValueOnce({
      data: '<html><body>Maintenance</body></html>',
    });

    const orchestratorUnverified = new ScraperOrchestratorService(
      storeUnverified as unknown as PrismaService,
      { resolveAndUpsertMovie: jest.fn() } as unknown as MovieIdentityService,
      stubStrategy<AtlasService>('atlas'),
      multiplex,
      stubStrategy<ShowcaseService>('showcase'),
      stubStrategy<CinemaCenterService>('cinemacenter'),
      stubStrategy<CinemarkService>('cinemark'),
      stubStrategy<CinepolisService>('cinepolis'),
    );

    const failedSummary =
      await orchestratorUnverified.runByChainKey('multiplex');
    expect(failedSummary.status).toBe('failed');
    expect(storeUnverified.rows).toHaveLength(1);

    // Case B: Venue explicitly reports empty_verified -> clears cancelled future showtimes
    const storeVerifiedEmpty = createShowtimeStore([staleShowtime]);
    const verifiedEmptyStrategy = {
      chainKey: 'showcase',
      chainName: 'Showcase',
      scrape: jest.fn().mockResolvedValue({
        chainKey: 'showcase',
        chainName: 'Showcase',
        status: 'empty_verified',
        expectedLocations: 1,
        locations: [
          {
            locationName: 'Showcase Belgrano',
            coveredFrom: new Date('2026-11-08T00:00:00-03:00'),
            coveredUntil: new Date('2026-11-10T23:59:59.999-03:00'),
            status: 'empty_verified',
            movies: [],
          },
        ],
        errors: [],
      }),
    };

    const orchestratorEmpty = new ScraperOrchestratorService(
      storeVerifiedEmpty as unknown as PrismaService,
      { resolveAndUpsertMovie: jest.fn() } as unknown as MovieIdentityService,
      stubStrategy<AtlasService>('atlas'),
      stubStrategy<MultiplexService>('multiplex'),
      verifiedEmptyStrategy as unknown as ShowcaseService,
      stubStrategy<CinemaCenterService>('cinemacenter'),
      stubStrategy<CinemarkService>('cinemark'),
      stubStrategy<CinepolisService>('cinepolis'),
    );

    const emptySummary = await orchestratorEmpty.runByChainKey('showcase');
    expect(emptySummary.status).toBe('empty_verified');
    expect(storeVerifiedEmpty.rows).toHaveLength(0);
  });

  it('replaces only the covered date horizon on complete runs, preserving distant presale showtimes', async () => {
    const todayStale: StoredShowtime = {
      id: 10,
      movieId: 101,
      locationId: 10,
      dateTime: buildArgentinaDate('2026-11-08', '16:00'),
      format: '2D',
      language: 'CASTELLANO',
      ticketUrl: 'https://cine/today-old',
    };
    const distantPresale: StoredShowtime = {
      id: 11,
      movieId: 303,
      locationId: 10,
      dateTime: buildArgentinaDate('2026-11-22', '21:00'),
      format: 'IMAX',
      language: 'SUBTITULADA',
      ticketUrl: 'https://cine/presale',
    };

    const store = createShowtimeStore([todayStale, distantPresale]);
    const shorterHorizonStrategy = {
      chainKey: 'showcase',
      chainName: 'Showcase',
      scrape: jest.fn().mockResolvedValue({
        chainKey: 'showcase',
        chainName: 'Showcase',
        status: 'complete',
        expectedLocations: 1,
        locations: [
          {
            locationName: 'Showcase Belgrano',
            coveredFrom: new Date('2026-11-08T00:00:00-03:00'),
            coveredUntil: new Date('2026-11-10T23:59:59.999-03:00'),
            status: 'complete',
            movies: [
              {
                rawTitle: 'Nueva Cartelera',
                showtimes: [
                  {
                    dateTime: buildArgentinaDate('2026-11-09', '19:30'),
                    format: '2D',
                    language: 'SUBTITULADA',
                    ticketUrl: 'https://cine/new',
                  },
                ],
              },
            ],
          },
        ],
        errors: [],
      }),
    };

    const orchestrator = new ScraperOrchestratorService(
      store as unknown as PrismaService,
      {
        resolveAndUpsertMovie: jest.fn().mockResolvedValue(404),
      } as unknown as MovieIdentityService,
      stubStrategy<AtlasService>('atlas'),
      stubStrategy<MultiplexService>('multiplex'),
      shorterHorizonStrategy as unknown as ShowcaseService,
      stubStrategy<CinemaCenterService>('cinemacenter'),
      stubStrategy<CinemarkService>('cinemark'),
      stubStrategy<CinepolisService>('cinepolis'),
    );

    await orchestrator.runByChainKey('showcase');

    // Today's stale showtime (within Nov 8 - Nov 9 window) was replaced
    expect(store.rows.some((r) => r.id === 10)).toBe(false);
    // New Nov 9 showtime was inserted
    expect(store.rows.some((r) => r.movieId === 404)).toBe(true);
    // Distant Nov 22 presale (beyond Nov 9 horizon) was preserved!
    expect(store.rows.some((r) => r.id === 11)).toBe(true);
  });
});
