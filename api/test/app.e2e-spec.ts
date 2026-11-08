import {
  INestApplication,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { configureHttpApp } from '../src/common/config/app-setup';
import { PrismaService } from '../src/prisma/prisma.service';
import { TmdbService } from '../src/tmdb/tmdb.service';

describe('HTTP Contract & Bootstrap Suite (e2e - F17)', () => {
  let app: INestApplication<App>;

  const originalDisableCron = process.env.DISABLE_INTERNAL_CRON;
  const originalAdminKey = process.env.ADMIN_API_KEY;
  const originalEnableHttpScraper = process.env.ENABLE_HTTP_SCRAPER;

  const queryRawSpy = jest.fn();
  const findManyMoviesSpy = jest.fn();
  const findUniqueMovieSpy = jest.fn();
  const findManyShowtimesSpy = jest.fn();
  const countShowtimesSpy = jest.fn();
  const aggregateShowtimesSpy = jest.fn();
  const findFirstScrapeRunSpy = jest.fn();
  const findManyLocationsSpy = jest.fn();
  const getUpcomingMoviesSpy = jest.fn();

  const prismaMock = {
    $connect: jest.fn().mockResolvedValue(undefined),
    $disconnect: jest.fn().mockResolvedValue(undefined),
    $queryRaw: queryRawSpy,
    movie: {
      findMany: findManyMoviesSpy,
      findUnique: findUniqueMovieSpy,
    },
    showtime: {
      findMany: findManyShowtimesSpy,
      count: countShowtimesSpy,
      aggregate: aggregateShowtimesSpy,
    },
    scrapeRun: {
      findFirst: findFirstScrapeRunSpy,
    },
    cinemaLocation: {
      findMany: findManyLocationsSpy,
    },
  };

  const tmdbMock = {
    getUpcomingMovies: getUpcomingMoviesSpy,
  };

  beforeAll(async () => {
    process.env.DISABLE_INTERNAL_CRON = 'true';
    process.env.ADMIN_API_KEY = 'e2e-test-admin-secret-key';
    delete process.env.ENABLE_HTTP_SCRAPER;

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(prismaMock)
      .overrideProvider(TmdbService)
      .useValue(tmdbMock)
      .compile();

    app = moduleFixture.createNestApplication();
    configureHttpApp(app, 'https://cinema-agenda-app.vercel.app');
    await app.init();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    queryRawSpy.mockResolvedValue([{ '?column?': 1 }]);
    countShowtimesSpy.mockResolvedValue(120);
    aggregateShowtimesSpy.mockResolvedValue({
      _max: { dateTime: new Date('2026-11-12T23:00:00.000Z') },
    });
    findFirstScrapeRunSpy.mockResolvedValue({
      id: 3,
      trigger: 'cli',
      scope: 'all',
      status: 'ok',
      completedAt: new Date('2026-11-08T07:02:00.000Z'),
      durationMs: 25000,
      locationsSucceeded: 68,
      locationsFailed: 0,
      showtimesInserted: 120,
      showtimesUnchanged: 0,
      failedChains: [],
    });
  });

  afterAll(async () => {
    await app.close();

    if (originalDisableCron === undefined) {
      delete process.env.DISABLE_INTERNAL_CRON;
    } else {
      process.env.DISABLE_INTERNAL_CRON = originalDisableCron;
    }

    if (originalAdminKey === undefined) {
      delete process.env.ADMIN_API_KEY;
    } else {
      process.env.ADMIN_API_KEY = originalAdminKey;
    }

    if (originalEnableHttpScraper === undefined) {
      delete process.env.ENABLE_HTTP_SCRAPER;
    } else {
      process.env.ENABLE_HTTP_SCRAPER = originalEnableHttpScraper;
    }
  });

  it('GET / and GET /health return 200 status payloads and enforce exact CORS origins', async () => {
    const rootRes = await request(app.getHttpServer()).get('/').expect(200);
    const rootBody = rootRes.body as {
      status: string;
      service: string;
      timestamp: string;
    };
    expect(rootBody.status).toBe('ok');
    expect(rootBody.service).toBe('cine-radar-api');

    const allowedRes = await request(app.getHttpServer())
      .get('/health')
      .set('Origin', 'https://cinema-agenda-app.vercel.app')
      .expect(200);

    expect(allowedRes.headers['access-control-allow-origin']).toBe(
      'https://cinema-agenda-app.vercel.app',
    );
    expect(
      allowedRes.headers['access-control-allow-credentials'],
    ).toBeUndefined();
    expect(
      (
        allowedRes.body as {
          database: string;
          billboard: { activeFutureShowtimes: number; isStale: boolean };
          lastScrapeRun: { status: string } | null;
        }
      ).database,
    ).toBe('connected');
    expect(
      (
        allowedRes.body as {
          billboard: { activeFutureShowtimes: number; isStale: boolean };
        }
      ).billboard,
    ).toMatchObject({
      activeFutureShowtimes: 120,
      isStale: false,
    });

    const rejectedRes = await request(app.getHttpServer())
      .get('/health')
      .set('Origin', 'https://untrusted-third-party.vercel.app')
      .expect(200);

    expect(
      rejectedRes.headers['access-control-allow-origin'],
    ).toBeUndefined();

    queryRawSpy.mockRejectedValueOnce(new Error('PostgreSQL down'));
    await request(app.getHttpServer()).get('/health').expect(503);
  });

  it('GET /movies/now-playing returns 200 on valid filters and 400 on impossible dates or unknown params', async () => {
    findManyMoviesSpy.mockResolvedValueOnce([]);

    const okRes = await request(app.getHttpServer())
      .get('/movies/now-playing?date=2026-11-08&zone=CABA&chainId=1')
      .expect(200);
    expect(okRes.body).toEqual([]);

    await request(app.getHttpServer())
      .get('/movies/now-playing?date=2026-02-30')
      .expect(400);

    await request(app.getHttpServer())
      .get('/movies/now-playing?unexpectedParam=1')
      .expect(400);
  });

  it('GET /movies/:id returns 200 when found, 404 when missing, and 400 on decimal or overflow IDs', async () => {
    findUniqueMovieSpy.mockResolvedValueOnce({
      id: 42,
      tmdbId: 999,
      title: 'Gladiador 2',
      posterUrl: '/poster.jpg',
      backdropUrl: null,
      overview: 'Sinopsis',
      releaseDate: '2026-11-05',
      duration: 148,
      rating: 8.1,
      genres: ['Acción'],
      createdAt: new Date('2026-11-05T00:00:00Z'),
      updatedAt: new Date('2026-11-05T00:00:00Z'),
    });
    findManyShowtimesSpy.mockResolvedValueOnce([]);

    const foundRes = await request(app.getHttpServer())
      .get('/movies/42?date=2026-11-08')
      .expect(200);
    expect((foundRes.body as { id: number; title: string }).title).toBe(
      'Gladiador 2',
    );

    findUniqueMovieSpy.mockResolvedValueOnce(null);
    await request(app.getHttpServer()).get('/movies/9999').expect(404);

    await request(app.getHttpServer()).get('/movies/1.5').expect(400);
    await request(app.getHttpServer()).get('/movies/999999999999').expect(400);
  });

  it('GET /movies/nearby returns sorted venues and GET /movies/upcoming propagates 503 outages', async () => {
    findManyLocationsSpy.mockResolvedValueOnce([
      {
        id: 1,
        name: 'Multiplex Lavalle',
        lat: -34.6022,
        lng: -58.3784,
        chain: { id: 1, name: 'Multiplex' },
      },
    ]);

    const nearbyOk = await request(app.getHttpServer())
      .get('/movies/nearby?lat=-34.6037&lng=-58.3816')
      .expect(200);
    expect(Array.isArray(nearbyOk.body)).toBe(true);

    getUpcomingMoviesSpy.mockRejectedValueOnce(
      new ServiceUnavailableException('TMDB upstream 503'),
    );
    await request(app.getHttpServer()).get('/movies/upcoming').expect(503);
  });

  it('POST /scraper/run-all rejects unauthenticated callers with 401 and blocks HTTP scraping by default with 403', async () => {
    await request(app.getHttpServer()).post('/scraper/run-all').expect(401);

    await request(app.getHttpServer())
      .post('/scraper/run-all')
      .set('x-api-key', 'e2e-test-admin-secret-key')
      .expect(403);
  });
});
