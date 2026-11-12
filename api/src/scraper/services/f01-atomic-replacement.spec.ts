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

interface StoredShowtime {
  id: number;
  movieId: number;
  locationId: number;
  dateTime: Date;
  format: string;
  language: string;
  ticketUrl: string;
}

interface TransactionalPrismaMock {
  rows: StoredShowtime[];
  inTransaction: boolean;
  cinemaChain: { upsert: jest.Mock };
  cinemaLocation: { findMany: jest.Mock; create: jest.Mock };
  showtime: {
    findMany: jest.Mock;
    deleteMany: jest.Mock;
    createMany: jest.Mock;
  };
  $transaction: jest.Mock;
}

function stubStrategy<T>(chainKey: string): T {
  return {
    chainKey,
    chainName: chainKey,
    scrape: jest.fn(),
  } as unknown as T;
}

function createTransactionalStore(
  initial: StoredShowtime[],
  options?: { failCreateManyForLocationId?: number },
): TransactionalPrismaMock {
  let nextId = 500;
  const committedRows: StoredShowtime[] = [...initial];

  const store: TransactionalPrismaMock = {
    rows: committedRows,
    inTransaction: false,
    cinemaChain: {
      upsert: jest.fn(({ create }: { create: { name: string } }) =>
        Promise.resolve({ id: 1, name: create.name }),
      ),
    },
    cinemaLocation: {
      findMany: jest.fn(() =>
        Promise.resolve([
          { id: 10, name: 'Showcase Belgrano', chainId: 1 },
          { id: 20, name: 'Showcase Norcenter', chainId: 1 },
        ]),
      ),
      create: jest.fn(({ data }: { data: { name: string; chainId: number } }) =>
        Promise.resolve({ id: 30, name: data.name, chainId: data.chainId }),
      ),
    },
    showtime: {
      findMany: jest.fn(),
      deleteMany: jest.fn(),
      createMany: jest.fn(),
    },
    $transaction: jest.fn(
      async <T>(
        cb: (tx: {
          showtime: {
            findMany: jest.Mock;
            deleteMany: jest.Mock;
            createMany: jest.Mock;
          };
        }) => Promise<T>,
      ): Promise<T> => {
        const workingCopy: StoredShowtime[] = committedRows.map((r) => ({
          ...r,
        }));
        store.inTransaction = true;

        const txClient = {
          showtime: {
            findMany: jest.fn(
              ({
                where,
              }: {
                where: {
                  locationId: number;
                  dateTime: { gte: Date; lte: Date };
                };
              }) =>
                Promise.resolve(
                  workingCopy.filter(
                    (row) =>
                      row.locationId === where.locationId &&
                      row.dateTime >= where.dateTime.gte &&
                      row.dateTime <= where.dateTime.lte,
                  ),
                ),
            ),
            deleteMany: jest.fn(
              ({
                where,
              }: {
                where: {
                  id?: { in: number[] };
                  locationId?: number;
                  dateTime?: { lt?: Date; gte?: Date; lte?: Date };
                };
              }) => {
                let count = 0;
                for (let i = workingCopy.length - 1; i >= 0; i--) {
                  const r = workingCopy[i];
                  if (where.id && !where.id.in.includes(r.id)) continue;
                  if (
                    where.locationId !== undefined &&
                    r.locationId !== where.locationId
                  ) {
                    continue;
                  }
                  const t = r.dateTime.getTime();
                  if (
                    where.dateTime?.lt &&
                    !(t < where.dateTime.lt.getTime())
                  ) {
                    continue;
                  }
                  if (
                    where.dateTime?.gte &&
                    !(t >= where.dateTime.gte.getTime())
                  ) {
                    continue;
                  }
                  if (
                    where.dateTime?.lte &&
                    !(t <= where.dateTime.lte.getTime())
                  ) {
                    continue;
                  }
                  workingCopy.splice(i, 1);
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
                if (
                  options?.failCreateManyForLocationId !== undefined &&
                  data.some(
                    (d) => d.locationId === options.failCreateManyForLocationId,
                  )
                ) {
                  return Promise.reject(
                    new Error('Simulated PgBouncer connection drop on INSERT'),
                  );
                }

                let count = 0;
                for (const d of data) {
                  const dup = workingCopy.some(
                    (r) =>
                      r.movieId === d.movieId &&
                      r.locationId === d.locationId &&
                      r.dateTime.getTime() === d.dateTime.getTime() &&
                      r.format === d.format &&
                      r.language === d.language,
                  );
                  if (dup && skipDuplicates) continue;
                  workingCopy.push({ id: nextId++, ...d });
                  count++;
                }
                return Promise.resolve({ count });
              },
            ),
          },
        };

        try {
          const result = await cb(txClient);
          // Commit working copy
          committedRows.splice(0, committedRows.length, ...workingCopy);
          return result;
        } finally {
          store.inTransaction = false;
        }
      },
    ),
  };

  return store;
}

describe('Atomic Venue Showtime Replacement (F01)', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-11-08T12:00:00.000Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  it('rolls back deleteMany and preserves existing showtimes when createMany fails mid-replacement, keeping TMDB calls outside the transaction', async () => {
    const preExistingShowtimes: StoredShowtime[] = [
      {
        id: 1,
        movieId: 101,
        locationId: 10,
        dateTime: buildArgentinaDate('2026-11-08', '19:00'),
        format: '2D',
        language: 'SUBTITULADA',
        ticketUrl: 'https://cine/existing-1',
      },
      {
        id: 2,
        movieId: 102,
        locationId: 10,
        dateTime: buildArgentinaDate('2026-11-08', '22:00'),
        format: 'IMAX',
        language: 'SUBTITULADA',
        ticketUrl: 'https://cine/existing-2',
      },
    ];

    const store = createTransactionalStore(preExistingShowtimes, {
      failCreateManyForLocationId: 10,
    });

    const resolveCalledInsideTx: boolean[] = [];
    const movieIdentityMock = {
      resolveAndUpsertMovie: jest.fn(() => {
        resolveCalledInsideTx.push(store.inTransaction);
        return Promise.resolve(205);
      }),
    } as unknown as MovieIdentityService;

    const showcaseStrategy = {
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
                rawTitle: 'Estreno Nuevo',
                showtimes: [
                  {
                    dateTime: buildArgentinaDate('2026-11-08', '20:30'),
                    format: '2D',
                    language: 'CASTELLANO',
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
      movieIdentityMock,
      stubStrategy<AtlasService>('atlas'),
      stubStrategy<MultiplexService>('multiplex'),
      showcaseStrategy as unknown as ShowcaseService,
      stubStrategy<CinemaCenterService>('cinemacenter'),
      stubStrategy<CinemarkService>('cinemark'),
      stubStrategy<CinepolisService>('cinepolis'),
    );

    const summary = await orchestrator.runByChainKey('showcase');

    // External TMDB / movie identity resolution NEVER ran inside an open DB transaction
    expect(resolveCalledInsideTx).toEqual([false]);
    expect(store.$transaction).toHaveBeenCalledTimes(1);

    // Pre-existing showtimes remain 100% intact thanks to transaction rollback
    expect(store.rows).toHaveLength(2);
    expect(store.rows.map((r) => r.id)).toEqual([1, 2]);

    // Chain status accurately reflects the persistence failure
    expect(summary.status).toBe('failed');
    expect(summary.locationsFailed).toBe(1);
    expect(summary.locationsComplete).toBe(0);
    expect(summary.showtimesInserted).toBe(0);
    expect(summary.errors[0]).toContain(
      'Simulated PgBouncer connection drop on INSERT',
    );
  });

  it('isolates per-venue transactions so a rollback in one venue does not block or corrupt healthy venues', async () => {
    const belgranoExisting: StoredShowtime = {
      id: 10,
      movieId: 101,
      locationId: 10,
      dateTime: buildArgentinaDate('2026-11-08', '18:00'),
      format: '2D',
      language: 'CASTELLANO',
      ticketUrl: 'https://cine/belgrano-old',
    };
    const norcenterExisting: StoredShowtime = {
      id: 20,
      movieId: 101,
      locationId: 20,
      dateTime: buildArgentinaDate('2026-11-08', '18:30'),
      format: '2D',
      language: 'CASTELLANO',
      ticketUrl: 'https://cine/norcenter-old',
    };

    // Fail createMany ONLY for Belgrano (locationId=10); Norcenter (locationId=20) succeeds
    const store = createTransactionalStore(
      [belgranoExisting, norcenterExisting],
      { failCreateManyForLocationId: 10 },
    );

    const showcaseStrategy = {
      chainKey: 'showcase',
      chainName: 'Showcase',
      scrape: jest.fn().mockResolvedValue({
        chainKey: 'showcase',
        chainName: 'Showcase',
        status: 'complete',
        expectedLocations: 2,
        locations: [
          {
            locationName: 'Showcase Belgrano',
            coveredFrom: new Date('2026-11-08T00:00:00-03:00'),
            coveredUntil: new Date('2026-11-10T23:59:59.999-03:00'),
            status: 'complete',
            movies: [
              {
                rawTitle: 'Película Nueva',
                showtimes: [
                  {
                    dateTime: buildArgentinaDate('2026-11-08', '21:00'),
                    format: '2D',
                    language: 'SUBTITULADA',
                    ticketUrl: 'https://cine/belgrano-new',
                  },
                ],
              },
            ],
          },
          {
            locationName: 'Showcase Norcenter',
            coveredFrom: new Date('2026-11-08T00:00:00-03:00'),
            coveredUntil: new Date('2026-11-10T23:59:59.999-03:00'),
            status: 'complete',
            movies: [
              {
                rawTitle: 'Película Nueva',
                showtimes: [
                  {
                    dateTime: buildArgentinaDate('2026-11-08', '21:30'),
                    format: 'IMAX',
                    language: 'SUBTITULADA',
                    ticketUrl: 'https://cine/norcenter-new',
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
        resolveAndUpsertMovie: jest.fn().mockResolvedValue(303),
      } as unknown as MovieIdentityService,
      stubStrategy<AtlasService>('atlas'),
      stubStrategy<MultiplexService>('multiplex'),
      showcaseStrategy as unknown as ShowcaseService,
      stubStrategy<CinemaCenterService>('cinemacenter'),
      stubStrategy<CinemarkService>('cinemark'),
      stubStrategy<CinepolisService>('cinepolis'),
    );

    const summary = await orchestrator.runByChainKey('showcase');

    expect(summary.status).toBe('partial');
    expect(summary.locationsComplete).toBe(1);
    expect(summary.locationsFailed).toBe(1);
    expect(summary.locationsProcessed).toBe(1);
    expect(summary.showtimesInserted).toBe(1);

    // Belgrano rolled back -> kept old showtime id=10
    expect(store.rows.filter((r) => r.locationId === 10)).toEqual([
      belgranoExisting,
    ]);
    // Norcenter committed -> replaced id=20 with movieId=303
    const norcenterRows = store.rows.filter((r) => r.locationId === 20);
    expect(norcenterRows).toHaveLength(1);
    expect(norcenterRows[0].movieId).toBe(303);
  });
});
