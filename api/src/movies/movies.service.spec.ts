import { ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TmdbService } from '../tmdb/tmdb.service';
import { MoviesService } from './movies.service';

describe('MoviesService Unit Suite (F17)', () => {
  const findManyMoviesSpy = jest.fn();
  const findUniqueMovieSpy = jest.fn();
  const findManyShowtimesSpy = jest.fn();
  const findManyChainsSpy = jest.fn();
  const getUpcomingTmdbSpy = jest.fn();

  let service: MoviesService;

  beforeEach(() => {
    jest.clearAllMocks();

    const prismaMock = {
      movie: {
        findMany: findManyMoviesSpy,
        findUnique: findUniqueMovieSpy,
      },
      showtime: {
        findMany: findManyShowtimesSpy,
      },
      cinemaChain: {
        findMany: findManyChainsSpy,
      },
    } as unknown as PrismaService;

    const tmdbMock = {
      getUpcomingMovies: getUpcomingTmdbSpy,
    } as unknown as TmdbService;

    service = new MoviesService(prismaMock, tmdbMock);
  });

  it('aggregates cinemaCount, chains, zones, formats, sorts by availability, and caches getNowPlaying', async () => {
    const futureTime = new Date(Date.now() + 3_600_000);
    const pastTime = new Date(Date.now() - 3_600_000);

    findManyMoviesSpy.mockResolvedValue([
      {
        id: 10,
        tmdbId: 100,
        title: 'Película Indie',
        posterUrl: '/indie.jpg',
        backdropUrl: null,
        overview: 'Sinopsis indie',
        releaseDate: '2026-10-01',
        duration: 95,
        rating: 7.4,
        genres: ['Drama'],
        createdAt: new Date('2026-10-01T00:00:00Z'),
        updatedAt: new Date('2026-10-01T00:00:00Z'),
        showtimes: [
          {
            id: 1,
            locationId: 101,
            dateTime: futureTime,
            format: '2D',
            language: 'Subtitulado',
            ticketUrl: 'https://tickets.example/1',
            location: {
              id: 101,
              zone: 'CABA',
              chain: { name: 'Atlas Cines' },
            },
          },
        ],
      },
      {
        id: 20,
        tmdbId: 200,
        title: 'Blockbuster',
        posterUrl: '/blockbuster.jpg',
        backdropUrl: '/bg.jpg',
        overview: 'Sinopsis épica',
        releaseDate: '2026-11-05',
        duration: 148,
        rating: 8.2,
        genres: ['Acción'],
        createdAt: new Date('2026-11-05T00:00:00Z'),
        updatedAt: new Date('2026-11-05T00:00:00Z'),
        showtimes: [
          {
            id: 2,
            locationId: 201,
            dateTime: pastTime,
            format: '2D',
            language: 'Castellano',
            ticketUrl: 'https://tickets.example/past',
            location: {
              id: 201,
              zone: 'CABA',
              chain: { name: 'Cinemark' },
            },
          },
          {
            id: 3,
            locationId: 202,
            dateTime: futureTime,
            format: 'IMAX',
            language: 'Subtitulado',
            ticketUrl: 'https://tickets.example/next',
            location: {
              id: 202,
              zone: 'GBA Norte',
              chain: { name: 'Showcase' },
            },
          },
        ],
      },
    ]);

    const firstCall = await service.getNowPlaying({ date: '2026-11-08' });
    const cachedCall = await service.getNowPlaying({ date: '2026-11-08' });

    expect(findManyMoviesSpy).toHaveBeenCalledTimes(1);
    expect(cachedCall).toEqual(firstCall);

    // Blockbuster (2 venues) comes before Indie (1 venue)
    expect(firstCall.map((m) => m.title)).toEqual([
      'Blockbuster',
      'Película Indie',
    ]);
    expect(firstCall[0].cinemaCount).toBe(2);
    expect(firstCall[0].chainNames).toEqual(['Cinemark', 'Showcase']);
    expect(firstCall[0].zones).toEqual(['CABA', 'GBA Norte']);
    expect(firstCall[0].formats).toEqual(['2D', 'IMAX']);
    // Picks the next future showtime rather than the past one
    expect(firstCall[0].showtimes[0].id).toBe(3);
  });

  it('returns null from getMovieDetail when movie is absent and groups showtimes by cinema when present', async () => {
    findUniqueMovieSpy.mockResolvedValueOnce(null);
    const missing = await service.getMovieDetail(9999, {});
    expect(missing).toBeNull();

    findUniqueMovieSpy.mockResolvedValueOnce({
      id: 20,
      tmdbId: 200,
      title: 'Blockbuster',
      posterUrl: '/blockbuster.jpg',
      backdropUrl: null,
      overview: 'Sinopsis',
      releaseDate: '2026-11-05',
      duration: 148,
      rating: 8.2,
      genres: ['Acción'],
      createdAt: new Date('2026-11-05T00:00:00Z'),
      updatedAt: new Date('2026-11-05T00:00:00Z'),
    });

    const cinemaObj = {
      id: 201,
      name: 'Cinemark Palermo',
      address: 'Beruti 3399',
      city: 'CABA',
      zone: 'CABA',
      lat: -34.5886,
      lng: -58.4113,
      chainId: 1,
      chain: { id: 1, name: 'Cinemark', websiteUrl: null },
    };

    findManyShowtimesSpy.mockResolvedValueOnce([
      {
        id: 11,
        dateTime: new Date('2026-11-08T21:00:00.000Z'),
        format: '2D',
        language: 'Subtitulado',
        ticketUrl: 'https://tickets.example/11',
        location: cinemaObj,
      },
      {
        id: 12,
        dateTime: new Date('2026-11-08T23:30:00.000Z'),
        format: 'XD',
        language: 'Subtitulado',
        ticketUrl: 'https://tickets.example/12',
        location: cinemaObj,
      },
    ]);

    const detail = await service.getMovieDetail(20, {
      date: '2026-11-08',
      cinemaId: '201',
    });

    expect(detail?.cinemas).toHaveLength(1);
    expect(detail?.cinemas[0].cinema.name).toBe('Cinemark Palermo');
    expect(detail?.cinemas[0].functions).toHaveLength(2);
  });

  it('sorts upcoming premieres ahead of re-releases and never caches TMDB 503 outages', async () => {
    getUpcomingTmdbSpy.mockRejectedValueOnce(
      new ServiceUnavailableException('TMDB unavailable'),
    );

    await expect(service.getUpcomingMovies()).rejects.toThrow(
      ServiceUnavailableException,
    );

    getUpcomingTmdbSpy.mockResolvedValueOnce([
      {
        id: 1,
        title: 'Interstellar (Reestreno)',
        poster_path: '/interstellar.jpg',
        release_date: '2014-11-06',
        overview: 'Clásico espacial',
      },
      {
        id: 2,
        title: 'Estreno Diciembre',
        poster_path: '/dic.jpg',
        release_date: '2099-12-10',
        overview: 'Futuro lejano',
      },
      {
        id: 3,
        title: 'Estreno Noviembre',
        poster_path: null,
        release_date: '2099-11-20',
        overview: '',
      },
    ]);

    const upcoming = await service.getUpcomingMovies();

    expect(upcoming.map((m) => m.title)).toEqual([
      'Estreno Noviembre',
      'Estreno Diciembre',
      'Interstellar (Reestreno)',
    ]);
    expect(upcoming[0]).toMatchObject({
      isReRelease: false,
      posterUrl: null,
    });
    expect(upcoming[1].posterUrl).toBe(
      'https://image.tmdb.org/t/p/w500/dic.jpg',
    );
    expect(upcoming[2].isReRelease).toBe(true);
  });
});
