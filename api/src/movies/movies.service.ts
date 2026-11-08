import { Injectable } from '@nestjs/common';
import { CinemaChain } from '@prisma/client';
import {
  getArgentinaDayRange,
  getArgentinaTodayDateString,
  isValidPositiveInt4String,
} from '../common/utils/argentina-time.util';
import { BoundedTtlCache } from '../common/utils/bounded-ttl-cache.util';
import { PrismaService } from '../prisma/prisma.service';
import { TmdbService } from '../tmdb/tmdb.service';
import {
  GroupedShowtimes,
  MovieDetailResponse,
  MovieFilters,
  NowPlayingMovieItem,
  UpcomingMovieItem,
} from './movies.interface';

@Injectable()
export class MoviesService {
  private readonly cache = new BoundedTtlCache<string, unknown>(500);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tmdbService: TmdbService,
  ) {}

  invalidateCache(): void {
    this.cache.clear();
  }

  private getFromCache<T>(key: string): T | null {
    const entry = this.cache.get(key);
    return entry.hit ? (entry.value as T) : null;
  }

  private setInCache<T>(key: string, data: T, ttlSeconds: number): void {
    this.cache.set(key, data, ttlSeconds * 1000);
  }

  async getNowPlaying(filters: MovieFilters): Promise<NowPlayingMovieItem[]> {
    const { date, city, zone, chainId, cinemaId } = filters;
    const { dateKey, start, end } = getArgentinaDayRange(date);
    const cacheKey = `now-playing:${dateKey}:${city || ''}:${zone || ''}:${chainId || ''}:${cinemaId || ''}`;
    const cached = this.getFromCache<NowPlayingMovieItem[]>(cacheKey);
    if (cached) return cached;

    const parsedChainId = isValidPositiveInt4String(chainId)
      ? Number(chainId)
      : undefined;
    const parsedCinemaId = isValidPositiveInt4String(cinemaId)
      ? Number(cinemaId)
      : undefined;

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
      select: {
        id: true,
        tmdbId: true,
        title: true,
        posterUrl: true,
        backdropUrl: true,
        overview: true,
        releaseDate: true,
        duration: true,
        rating: true,
        genres: true,
        createdAt: true,
        updatedAt: true,
        showtimes: {
          where: {
            dateTime: {
              gte: start,
              lte: end,
            },
            location: locationWhere,
          },
          orderBy: { dateTime: 'asc' },
          select: {
            id: true,
            locationId: true,
            dateTime: true,
            format: true,
            language: true,
            ticketUrl: true,
            location: {
              select: {
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

    const now = new Date();
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

      const nextShowtime =
        movie.showtimes.find((st) => st.dateTime >= now) || movie.showtimes[0];

      return {
        id: movie.id,
        tmdbId: movie.tmdbId,
        title: movie.title,
        posterUrl: movie.posterUrl,
        backdropUrl: movie.backdropUrl,
        overview: movie.overview,
        releaseDate: movie.releaseDate,
        duration: movie.duration,
        rating: movie.rating,
        genres: movie.genres,
        createdAt: movie.createdAt,
        updatedAt: movie.updatedAt,
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
    const { start, end } = getArgentinaDayRange(date);

    const movie = await this.prisma.movie.findUnique({
      where: { id },
    });

    if (!movie) return null;

    const parsedChainId = isValidPositiveInt4String(chainId)
      ? Number(chainId)
      : undefined;
    const parsedCinemaId = isValidPositiveInt4String(cinemaId)
      ? Number(cinemaId)
      : undefined;

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

  async getUpcomingMovies(): Promise<UpcomingMovieItem[]> {
    const today = getArgentinaTodayDateString();
    const cacheKey = `movies:upcoming:${today}`;
    const cached = this.getFromCache<UpcomingMovieItem[]>(cacheKey);
    if (cached) return cached;

    const rawMovies = await this.tmdbService.getUpcomingMovies();

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

    // Cache for 30 minutes (1800s), partitioned by Argentina calendar day
    this.setInCache(cacheKey, result, 1800);
    return result;
  }
}
