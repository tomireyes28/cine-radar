import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CinemaChain } from '@prisma/client';
import {
  MovieFilters,
  GroupedShowtimes,
  MovieDetailResponse,
  NowPlayingMovieItem,
} from './movies.interface';
import { TmdbService } from '../tmdb/tmdb.service';

@Injectable()
export class MoviesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tmdbService: TmdbService,
  ) {}

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
    return enriched.sort((a, b) => b.cinemaCount - a.cinemaCount);
  }

  async getMovieDetail(
    id: number,
    filters: MovieFilters,
  ): Promise<MovieDetailResponse | null> {
    const { date, city, zone } = filters;
    const { start, end } = this.getArgentinaDayRange(date);

    const movie = await this.prisma.movie.findUnique({
      where: { id },
    });

    if (!movie) return null;

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
    return this.prisma.cinemaChain.findMany({
      include: {
        locations: {
          orderBy: { name: 'asc' },
        },
      },
      orderBy: { name: 'asc' },
    });
  }

  async getUpcomingMovies() {
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

    return cleanedMovies.sort((a, b) => {
      if (a.isReRelease === b.isReRelease) {
        return (
          new Date(a.releaseDate).getTime() - new Date(b.releaseDate).getTime()
        );
      }
      return a.isReRelease ? 1 : -1;
    });
  }
}
