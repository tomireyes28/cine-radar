import axios from 'axios';
import { MoviesService } from '../../movies/movies.service';
import { PrismaService } from '../../prisma/prisma.service';
import { AtlasService } from '../../scraper/atlas/atlas.service';
import { CinemaCenterService } from '../../scraper/cinemacenter/cinemacenter.service';
import { CinemarkService } from '../../scraper/cinemark/cinemark.service';
import { CinepolisService } from '../../scraper/cinepolis/cinepolis.service';
import { buildArgentinaDate } from '../../scraper/interfaces/scraper.interface';
import { MultiplexService } from '../../scraper/multiplex/multiplex.service';
import { MovieIdentityService } from '../../scraper/services/movie-identity.service';
import { ScraperOrchestratorService } from '../../scraper/services/scraper-orchestrator.service';
import { ShowcaseService } from '../../scraper/showcase/showcase.service';
import { TmdbService } from '../../tmdb/tmdb.service';
import { BoundedTtlCache } from './bounded-ttl-cache.util';
import { withHttpRetry } from './http-retry.util';

describe('Performance, Bounded Caches, Differential Sync & Retry Suite (M1/M2/M3/M5)', () => {
  const originalApiKey = process.env.TMDB_API_KEY;

  beforeEach(() => {
    process.env.TMDB_API_KEY = 'test-tmdb-key';
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
    if (originalApiKey === undefined) {
      delete process.env.TMDB_API_KEY;
    } else {
      process.env.TMDB_API_KEY = originalApiKey;
    }
  });

  it('evicts least-recently-used keys when BoundedTtlCache reaches maxEntries and expires stale TTL entries', () => {
    const cache = new BoundedTtlCache<string, number>(2);
    cache.set('a', 1, 1000, 0);
    cache.set('b', 2, 1000, 10);

    // Touch 'a' so 'b' becomes LRU
    expect(cache.get('a', 20)).toEqual({ hit: true, value: 1 });

    // Inserting 'c' evicts 'b'
    cache.set('c', 3, 1000, 30);
    expect(cache.get('b', 40)).toEqual({ hit: false });
    expect(cache.get('a', 40)).toEqual({ hit: true, value: 1 });

    // After TTL expires, 'a' misses automatically
    expect(cache.get('a', 1001)).toEqual({ hit: false });
    expect(cache.size).toBe(1);
  });

  it('retries 429 (honoring Retry-After) and 503/ECONNRESET with backoff, while failing immediately on 404/contract errors', async () => {
    const recordedSleeps: number[] = [];
    const sleepFn = (ms: number): Promise<void> => {
      recordedSleeps.push(ms);
      return Promise.resolve();
    };

    let attempts = 0;
    const recovered = await withHttpRetry(
      () => {
        attempts++;
        if (attempts === 1) {
          return Promise.reject(
            Object.assign(new Error('Too Many Requests'), {
              response: { status: 429, headers: { 'retry-after': '2' } },
            }),
          );
        }
        if (attempts === 2) {
          return Promise.reject(
            Object.assign(new Error('Socket hang up'), { code: 'ECONNRESET' }),
          );
        }
        return Promise.resolve('ok-payload');
      },
      {
        maxRetries: 3,
        baseDelayMs: 300,
        maxDelayMs: 5000,
        sleepFn,
        randomFn: () => 0.5, // jitter multiplier = 1.0
      },
    );

    expect(recovered).toBe('ok-payload');
    expect(attempts).toBe(3);
    expect(recordedSleeps).toEqual([2000, 600]);

    // Non-retryable 404 fails on 1st attempt with 0 sleeps
    let clientErrAttempts = 0;
    await expect(
      withHttpRetry(
        () => {
          clientErrAttempts++;
          return Promise.reject(
            Object.assign(new Error('Not Found'), {
              response: { status: 404 },
            }),
          );
        },
        { maxRetries: 3, sleepFn },
      ),
    ).rejects.toThrow('Not Found');
    expect(clientErrAttempts).toBe(1);
  });

  it('deduplicates concurrent in-flight TMDB lookups so 10 simultaneous calls trigger only 1 search + 1 detail request', async () => {
    let searchCalls = 0;
    let detailCalls = 0;

    jest.spyOn(axios, 'get').mockImplementation((url: string) => {
      if (url.endsWith('/search/movie')) {
        searchCalls++;
        return new Promise((resolve) =>
          setTimeout(
            () =>
              resolve({
                data: {
                  results: [
                    {
                      id: 558449,
                      title: 'Gladiador II',
                      release_date: '2024-11-14',
                      poster_path: '/g2.jpg',
                    },
                  ],
                },
              }),
            15,
          ),
        );
      }
      detailCalls++;
      return Promise.resolve({
        data: {
          id: 558449,
          title: 'Gladiador II',
          poster_path: '/g2.jpg',
          backdrop_path: null,
          release_date: '2024-11-14',
          overview: 'Épica.',
          runtime: 148,
          vote_average: 7.4,
          genres: [{ id: 28, name: 'Acción' }],
        },
      });
    });

    const tmdb = new TmdbService({ maxCacheEntries: 50 });
    const concurrent = await Promise.all(
      Array.from({ length: 10 }, () => tmdb.lookupMovie('GLADIADOR II 2D SUB')),
    );

    expect(searchCalls).toBe(1);
    expect(detailCalls).toBe(1);
    expect(concurrent.every((r) => r.status === 'matched')).toBe(true);
  });

  it('partitions getNowPlaying and getUpcomingMovies caches by Argentina calendar day across midnight (23:55 -> 00:05 ART)', async () => {
    jest.useFakeTimers();

    const findManyMoviesSpy = jest.fn().mockResolvedValue([]);
    const getUpcomingSpy = jest.fn().mockResolvedValue([
      {
        id: 1,
        title: 'Estreno de Hoy',
        poster_path: null,
        release_date: '2026-11-08',
        overview: '',
      },
    ]);

    const moviesService = new MoviesService(
      { movie: { findMany: findManyMoviesSpy } } as unknown as PrismaService,
      { getUpcomingMovies: getUpcomingSpy } as unknown as TmdbService,
    );

    // 2026-11-07 23:55:00 ART = 2026-11-08T02:55:00.000Z
    jest.setSystemTime(new Date('2026-11-08T02:55:00.000Z'));
    await moviesService.getNowPlaying({});
    const beforeMidnight = await moviesService.getUpcomingMovies();
    expect(beforeMidnight[0].isReRelease).toBe(false);
    expect(findManyMoviesSpy).toHaveBeenCalledTimes(1);
    expect(getUpcomingSpy).toHaveBeenCalledTimes(1);

    // 10 minutes later: 2026-11-08 00:05:00 ART = 2026-11-08T03:05:00.000Z
    // Even though 180s/1800s TTL has NOT elapsed, the Argentina date rolled over so fresh queries execute!
    jest.setSystemTime(new Date('2026-11-08T03:05:00.000Z'));
    await moviesService.getNowPlaying({});
    await moviesService.getUpcomingMovies();
    expect(findManyMoviesSpy).toHaveBeenCalledTimes(2);
    expect(getUpcomingSpy).toHaveBeenCalledTimes(2);
  });

  it('skips deleteMany and createMany completely when differential showtime snapshot is unchanged (M2)', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-11-08T12:00:00.000Z'));

    const existingRow = {
      id: 777,
      movieId: 50,
      locationId: 10,
      dateTime: buildArgentinaDate('2026-11-08', '20:30'),
      format: 'IMAX',
      language: 'SUBTITULADA',
      ticketUrl: 'https://cine.example/777',
    };

    const deleteManySpy = jest.fn().mockResolvedValue({ count: 0 });
    const createManySpy = jest.fn().mockResolvedValue({ count: 0 });
    const findManyShowtimesSpy = jest.fn().mockResolvedValue([existingRow]);

    const txShowtime = {
      findMany: findManyShowtimesSpy,
      deleteMany: deleteManySpy,
      createMany: createManySpy,
    };

    const prismaMock = {
      cinemaChain: {
        upsert: jest.fn().mockResolvedValue({ id: 1, name: 'Showcase' }),
      },
      cinemaLocation: {
        findMany: jest
          .fn()
          .mockResolvedValue([{ id: 10, name: 'Showcase Norcenter', chainId: 1 }]),
      },
      showtime: txShowtime,
      $transaction: jest.fn(
        <T>(cb: (tx: { showtime: typeof txShowtime }) => Promise<T>) =>
          cb({ showtime: txShowtime }),
      ),
    } as unknown as PrismaService;

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
            locationName: 'Showcase Norcenter',
              coveredFrom: new Date('2026-11-08T00:00:00-03:00'),
              coveredUntil: new Date('2026-11-08T23:59:59.999-03:00'),
            status: 'complete',
            movies: [
              {
                rawTitle: 'Gladiador 2',
                showtimes: [
                  {
                    dateTime: buildArgentinaDate('2026-11-08', '20:30'),
                    format: 'IMAX',
                    language: 'SUBTITULADA',
                    ticketUrl: 'https://cine.example/777',
                  },
                ],
              },
            ],
          },
        ],
        errors: [],
      }),
    } as unknown as ShowcaseService;

    const stub = <T>(key: string): T =>
      ({ chainKey: key, chainName: key, scrape: jest.fn() }) as unknown as T;

    const orchestrator = new ScraperOrchestratorService(
      prismaMock,
      {
        resolveAndUpsertMovie: jest.fn().mockResolvedValue(50),
      } as unknown as MovieIdentityService,
      stub<AtlasService>('atlas'),
      stub<MultiplexService>('multiplex'),
      showcaseStrategy,
      stub<CinemaCenterService>('cinemacenter'),
      stub<CinemarkService>('cinemark'),
      stub<CinepolisService>('cinepolis'),
    );

    const summary = await orchestrator.runByChainKey('showcase');

    expect(summary.status).toBe('complete');
    expect(summary.showtimesInserted).toBe(0);
    expect(summary.showtimesUnchanged).toBe(1);
    expect(deleteManySpy).not.toHaveBeenCalled();
    expect(createManySpy).not.toHaveBeenCalled();
  });
});
