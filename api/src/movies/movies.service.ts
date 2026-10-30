import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CinemaChain } from '@prisma/client';
import {
  MovieFilters,
  GroupedShowtimes,
  MovieDetailResponse,
  NowPlayingMovieItem,
} from './movies.interface';
import { TmdbService } from '../tmdb/tmdb.service';

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

@Injectable()
export class MoviesService {
  private readonly logger = new Logger(MoviesService.name);
  private readonly cache = new Map<string, CacheEntry<unknown>>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly tmdbService: TmdbService,
  ) {}

  private getFromCache<T>(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return null;
    }
    return entry.data as T;
  }

  private setInCache<T>(key: string, data: T, ttlSeconds: number): void {
    // Limit cache size to 500 keys to prevent unbounded memory growth
    if (this.cache.size > 500) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey) this.cache.delete(oldestKey);
    }
    this.cache.set(key, {
      data,
      expiresAt: Date.now() + ttlSeconds * 1000,
    });
  }

  private getArgentinaDayRange(dateStr?: string): { start: Date; end: Date } {
    const cleanDate =
      dateStr && /^\d{4}-\d{2}-\d{2}/.test(dateStr)
        ? dateStr.slice(0, 10)
        : new Intl.DateTimeFormat('en-CA', {
            timeZone: 'America/Argentina/Buenos_Aires',
          }).format(new Date());

    const start = new Date(`${cleanDate}T00:00:00.000-03:00`);
    const end = new Date(`${cleanDate}T23:59:59.999-03:00`);
    return { start, end };
  }

  async getNowPlaying(filters: MovieFilters): Promise<NowPlayingMovieItem[]> {
    const cacheKey = `now-playing:${filters.date || 'today'}:${filters.city || ''}:${filters.zone || ''}:${filters.chainId || ''}:${filters.cinemaId || ''}`;
    const cached = this.getFromCache<NowPlayingMovieItem[]>(cacheKey);
    if (cached) return cached;

    const { date, city, zone, chainId, cinemaId } = filters;
    const { start, end } = this.getArgentinaDayRange(date);

    const parsedChainId = chainId ? parseInt(chainId, 10) : undefined;
    const parsedCinemaId = cinemaId ? parseInt(cinemaId, 10) : undefined;

    const locationWhere = {
      name: city ? { contains: city, mode: 'insensitive' as const } : undefined,
      zone: zone ? { equals: zone, mode: 'insensitive' as const } : undefined,
      chainId: parsedChainId,
      id: parsedCinemaId,
    };

    const movies = await this.prisma.movie.findMany({
      where: {
        showtimes: {
          some: {
            dateTime: {
              gte: start,
              lte: end,
            },
            location: locationWhere,
          },
        },
      },
      include: {
        showtimes: {
          where: {
            dateTime: {
              gte: start,
              lte: end,
            },
            location: locationWhere,
          },
          orderBy: { dateTime: 'asc' },
          include: {
            location: {
              select: {
                id: true,
                zone: true,
                chain: {
                  select: { name: true },
                },
              },
            },
          },
        },
      },
    });

    const enriched: NowPlayingMovieItem[] = movies.map((movie) => {
      const locationIds = new Set<number>();
      const chainNames = new Set<string>();
      const zones = new Set<string>();
      const formats = new Set<string>();

      for (const st of movie.showtimes) {
        locationIds.add(st.locationId);
        if (st.location?.chain?.name) chainNames.add(st.location.chain.name);
        if (st.location?.zone) zones.add(st.location.zone);
        if (st.format) formats.add(st.format);
      }

      const now = new Date();
      const nextShowtime =
        movie.showtimes.find((st) => st.dateTime >= now) || movie.showtimes[0];

      const { showtimes: _, ...movieFields } = movie;

      return {
        ...movieFields,
        cinemaCount: locationIds.size,
        chainNames: Array.from(chainNames),
        zones: Array.from(zones),
        formats: Array.from(formats),
        showtimes: nextShowtime
          ? [
              {
                id: nextShowtime.id,
                dateTime: nextShowtime.dateTime,
                format: nextShowtime.format,
                language: nextShowtime.language,
                ticketUrl: nextShowtime.ticketUrl,
              },
            ]
          : [],
      };
    });

    // Sort by availability (movies playing in more cinemas appear first)
    const result = enriched.sort((a, b) => b.cinemaCount - a.cinemaCount);

    // Cache for 3 minutes (180s)
    this.setInCache(cacheKey, result, 180);
    return result;
  }

  async getMovieDetail(
    id: number,
    filters: MovieFilters,
  ): Promise<MovieDetailResponse | null> {
    const { date, city, zone, chainId, cinemaId } = filters;
    const { start, end } = this.getArgentinaDayRange(date);

    const movie = await this.prisma.movie.findUnique({
      where: { id },
    });

    if (!movie) return null;

    const parsedChainId = chainId ? parseInt(chainId, 10) : undefined;
    const parsedCinemaId = cinemaId ? parseInt(cinemaId, 10) : undefined;

    const showtimes = await this.prisma.showtime.findMany({
      where: {
        movieId: id,
        dateTime: {
          gte: start,
          lte: end,
        },
        location: {
          name: city ? { contains: city, mode: 'insensitive' } : undefined,
          zone: zone ? { equals: zone, mode: 'insensitive' } : undefined,
          chainId: parsedChainId,
          id: parsedCinemaId,
        },
      },
      include: {
        location: {
          include: { chain: true },
        },
      },
      orderBy: {
        dateTime: 'asc',
      },
    });

    const showtimesByCinema = showtimes.reduce<GroupedShowtimes>(
      (acc, show) => {
        const cinemaName = show.location.name;

        if (!acc[cinemaName]) {
          acc[cinemaName] = {
            cinema: show.location,
            functions: [],
          };
        }

        acc[cinemaName].functions.push({
          id: show.id,
          time: show.dateTime,
          format: show.format,
          language: show.language,
          url: show.ticketUrl,
        });

        return acc;
      },
      {},
    );

    return {
      ...movie,
      cinemas: Object.values(showtimesByCinema),
    };
  }

  async getFiltersData(): Promise<CinemaChain[]> {
    const cacheKey = 'cinemas:filters';
    const cached = this.getFromCache<CinemaChain[]>(cacheKey);
    if (cached) return cached;

    const chains = await this.prisma.cinemaChain.findMany({
      include: {
        locations: {
          orderBy: { name: 'asc' },
        },
      },
      orderBy: { name: 'asc' },
    });

    // Cache for 10 minutes (600s)
    this.setInCache(cacheKey, chains, 600);
    return chains;
  }

  async getUpcomingMovies() {
    const cacheKey = 'movies:upcoming';
    const cached = this.getFromCache<any[]>(cacheKey);
    if (cached) return cached;

    const rawMovies = await this.tmdbService.getUpcomingMovies();
    const today = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Argentina/Buenos_Aires',
    }).format(new Date());

    const cleanedMovies = rawMovies.map((movie) => {
      const isReRelease = Boolean(
        movie.release_date && movie.release_date < today,
      );

      return {
        id: movie.id,
        title: movie.title,
        posterUrl: movie.poster_path
          ? `https://image.tmdb.org/t/p/w500${movie.poster_path}`
          : null,
        releaseDate: movie.release_date,
        overview: movie.overview || '',
        isReRelease,
      };
    });

    const result = cleanedMovies.sort((a, b) => {
      if (a.isReRelease === b.isReRelease) {
        return (
          new Date(a.releaseDate).getTime() - new Date(b.releaseDate).getTime()
        );
      }
      return a.isReRelease ? 1 : -1;
    });

    // Cache for 30 minutes (1800s)
    this.setInCache(cacheKey, result, 1800);
    return result;
  }
}
