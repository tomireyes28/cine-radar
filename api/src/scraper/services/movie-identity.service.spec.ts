import { Movie } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { TmdbLookupResult, TmdbService } from '../../tmdb/tmdb.service';
import { MovieIdentityService } from './movie-identity.service';
import { TitleNormalizerService } from './title-normalizer.service';

interface InMemoryShowtime {
  id: number;
  movieId: number;
  locationId: number;
  dateTime: Date;
  format: string;
  language: string;
  ticketUrl: string;
}

interface InMemoryPrisma {
  movies: Movie[];
  showtimes: InMemoryShowtime[];
  movie: {
    findUnique: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
    delete: jest.Mock;
  };
  showtime: {
    findMany: jest.Mock;
    createMany: jest.Mock;
  };
  $transaction: jest.Mock;
}

function createInMemoryPrisma(): InMemoryPrisma {
  let nextMovieId = 1;
  let nextShowtimeId = 1;
  const movies: Movie[] = [];
  const showtimes: InMemoryShowtime[] = [];

  const api: InMemoryPrisma = {
    movies,
    showtimes,
    movie: {
      findUnique: jest.fn(
        ({
          where,
        }: {
          where: { id?: number; normalizedKey?: string; tmdbId?: number };
        }) => {
          const found = movies.find(
            (m) =>
              (where.id !== undefined && m.id === where.id) ||
              (where.normalizedKey !== undefined &&
                m.normalizedKey === where.normalizedKey) ||
              (where.tmdbId !== undefined && m.tmdbId === where.tmdbId),
          );
          return Promise.resolve(found ?? null);
        },
      ),
      create: jest.fn(
        ({
          data,
        }: {
          data: Omit<Movie, 'id' | 'createdAt' | 'updatedAt'>;
        }) => {
          const now = new Date();
          const created: Movie = {
            id: nextMovieId++,
            tmdbId: data.tmdbId ?? null,
            normalizedKey: data.normalizedKey,
            tmdbStatus: data.tmdbStatus ?? 'pending',
            title: data.title,
            posterUrl: data.posterUrl ?? null,
            backdropUrl: data.backdropUrl ?? null,
            overview: data.overview ?? null,
            releaseDate: data.releaseDate ?? null,
            duration: data.duration ?? null,
            rating: data.rating ?? null,
            genres: data.genres ?? [],
            createdAt: now,
            updatedAt: now,
          };
          movies.push(created);
          return Promise.resolve(created);
        },
      ),
      update: jest.fn(
        ({
          where,
          data,
        }: {
          where: { id: number };
          data: Partial<Movie>;
        }) => {
          const idx = movies.findIndex((m) => m.id === where.id);
          if (idx === -1) throw new Error('Movie not found');
          movies[idx] = {
            ...movies[idx],
            ...data,
            updatedAt: new Date(),
          };
          return Promise.resolve(movies[idx]);
        },
      ),
      delete: jest.fn(({ where }: { where: { id: number } }) => {
        const idx = movies.findIndex((m) => m.id === where.id);
        if (idx === -1) throw new Error('Movie not found');
        const [removed] = movies.splice(idx, 1);
        for (let i = showtimes.length - 1; i >= 0; i--) {
          if (showtimes[i].movieId === where.id) showtimes.splice(i, 1);
        }
        return Promise.resolve(removed);
      }),
    },
    showtime: {
      findMany: jest.fn(({ where }: { where: { movieId: number } }) =>
        Promise.resolve(showtimes.filter((s) => s.movieId === where.movieId)),
      ),
      createMany: jest.fn(
        ({
          data,
          skipDuplicates,
        }: {
          data: Omit<InMemoryShowtime, 'id'>[];
          skipDuplicates?: boolean;
        }) => {
          let count = 0;
          for (const item of data) {
            const exists = showtimes.some(
              (s) =>
                s.movieId === item.movieId &&
                s.locationId === item.locationId &&
                s.dateTime.getTime() === item.dateTime.getTime() &&
                s.format === item.format &&
                s.language === item.language,
            );
            if (exists && skipDuplicates) continue;
            showtimes.push({ id: nextShowtimeId++, ...item });
            count++;
          }
          return Promise.resolve({ count });
        },
      ),
    },
    $transaction: jest.fn(async <T>(cb: (tx: unknown) => Promise<T>) =>
      cb(api),
    ),
  };

  return api;
}

describe('MovieIdentityService (F08)', () => {
  it('prevents 32-bit hash collisions ("an" vs "c0") when movies are absent in TMDB', async () => {
    const db = createInMemoryPrisma();
    const lookupMock = jest
      .fn<Promise<TmdbLookupResult>, [string]>()
      .mockResolvedValue({ status: 'not_found' });

    const service = new MovieIdentityService(
      db as unknown as PrismaService,
      { lookupMovie: lookupMock } as unknown as TmdbService,
      new TitleNormalizerService(),
    );

    const cache = new Map<string, number | null>();
    const idAn = await service.resolveAndUpsertMovie('an', cache);
    const idC0 = await service.resolveAndUpsertMovie('c0', cache);

    expect(idAn).not.toBeNull();
    expect(idC0).not.toBeNull();
    expect(idAn).not.toBe(idC0);
    expect(db.movies).toHaveLength(2);
    expect(db.movies[0]).toMatchObject({
      normalizedKey: 'an',
      tmdbId: null,
      tmdbStatus: 'not_found',
    });
    expect(db.movies[1]).toMatchObject({
      normalizedKey: 'c0',
      tmdbId: null,
      tmdbStatus: 'not_found',
    });
  });

  it('enriches a fallback movie in-place without duplication when TMDB recovers from a transient error', async () => {
    const db = createInMemoryPrisma();
    const lookupMock = jest.fn<Promise<TmdbLookupResult>, [string]>();

    const service = new MovieIdentityService(
      db as unknown as PrismaService,
      { lookupMovie: lookupMock } as unknown as TmdbService,
      new TitleNormalizerService(),
    );

    // Run 1: TMDB suffers transient timeout/503
    lookupMock.mockResolvedValueOnce({
      status: 'transient_error',
      reason: 'timeout of 8000ms exceeded',
    });

    const firstRunId = await service.resolveAndUpsertMovie(
      'El Eternauta',
      new Map(),
    );
    expect(firstRunId).toBe(1);
    expect(db.movies).toHaveLength(1);
    expect(db.movies[0].tmdbId).toBeNull();
    expect(db.movies[0].tmdbStatus).toBe('transient_error');

    // Attach a showtime to movie #1
    await db.showtime.createMany({
      data: [
        {
          movieId: firstRunId!,
          locationId: 10,
          dateTime: new Date('2026-11-08T22:00:00.000Z'),
          format: '2D',
          language: 'CASTELLANO',
          ticketUrl: 'https://cine/1',
        },
      ],
    });

    // Run 2: TMDB recovers and returns official metadata
    lookupMock.mockResolvedValueOnce({
      status: 'matched',
      movie: {
        tmdbId: 987654,
        officialTitle: 'El Eternauta',
        posterUrl: 'https://image.tmdb.org/t/p/w500/eternauta.jpg',
        backdropUrl: null,
        overview: 'Invasión en Buenos Aires.',
        releaseDate: '2026-05-01',
        duration: 128,
        rating: '8.4',
        genres: ['Ciencia ficción', 'Drama'],
      },
    });

    const secondRunId = await service.resolveAndUpsertMovie(
      'El Eternauta',
      new Map(),
    );

    expect(secondRunId).toBe(firstRunId);
    expect(db.movies).toHaveLength(1);
    expect(db.movies[0]).toMatchObject({
      id: 1,
      tmdbId: 987654,
      tmdbStatus: 'matched',
      posterUrl: 'https://image.tmdb.org/t/p/w500/eternauta.jpg',
    });
    expect(db.showtimes).toHaveLength(1);
    expect(db.showtimes[0].movieId).toBe(1);
  });

  it('reconciles and merges showtimes if an offline variant resolves to an already existing TMDB movie', async () => {
    const db = createInMemoryPrisma();
    const lookupMock = jest.fn<Promise<TmdbLookupResult>, [string]>();

    const service = new MovieIdentityService(
      db as unknown as PrismaService,
      { lookupMovie: lookupMock } as unknown as TmdbService,
      new TitleNormalizerService(),
    );

    // Canonical movie already indexed with tmdbId 555
    lookupMock.mockResolvedValueOnce({
      status: 'matched',
      movie: {
        tmdbId: 555,
        officialTitle: 'Duna: Parte Dos',
        posterUrl: null,
        backdropUrl: null,
        overview: 'Arrakis',
        releaseDate: '2024-02-29',
        duration: 166,
        rating: '8.3',
        genres: ['Ciencia ficción'],
      },
    });
    const canonicalId = await service.resolveAndUpsertMovie(
      'Duna: Parte Dos',
      new Map(),
    );
    expect(canonicalId).toBe(1);

    // Variant title arrives while TMDB is down -> temporary movie #2
    lookupMock.mockResolvedValueOnce({
      status: 'transient_error',
      reason: 'HTTP 429',
    });
    const tempVariantId = await service.resolveAndUpsertMovie(
      'Duna Parte 2 Funcion Especial',
      new Map(),
    );
    expect(tempVariantId).toBe(2);

    await db.showtime.createMany({
      data: [
        {
          movieId: tempVariantId!,
          locationId: 7,
          dateTime: new Date('2026-11-09T21:00:00.000Z'),
          format: 'IMAX',
          language: 'SUBTITULADA',
          ticketUrl: 'https://cine/imax',
        },
      ],
    });

    // Next run: TMDB recovers and maps the variant to tmdbId 555
    lookupMock.mockResolvedValueOnce({
      status: 'matched',
      movie: {
        tmdbId: 555,
        officialTitle: 'Duna: Parte Dos',
        posterUrl: 'https://image.tmdb.org/t/p/w500/dune2.jpg',
        backdropUrl: null,
        overview: 'Arrakis',
        releaseDate: '2024-02-29',
        duration: 166,
        rating: '8.3',
        genres: ['Ciencia ficción'],
      },
    });

    const reconciledId = await service.resolveAndUpsertMovie(
      'Duna Parte 2 Funcion Especial',
      new Map(),
    );

    expect(reconciledId).toBe(canonicalId);
    expect(db.movies).toHaveLength(1);
    expect(db.movies[0].id).toBe(canonicalId);
    expect(db.showtimes).toHaveLength(1);
    expect(db.showtimes[0].movieId).toBe(canonicalId);
  });
});
