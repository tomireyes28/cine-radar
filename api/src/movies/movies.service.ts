import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { startOfDay, endOfDay, parseISO } from 'date-fns';
import { Movie, CinemaChain } from '@prisma/client';
import { 
  MovieFilters, 
  GroupedShowtimes, 
  MovieDetailResponse 
} from './movies.interface'; 
import { TmdbService } from '../tmdb/tmdb.service';

@Injectable()
export class MoviesService {
  constructor(private readonly prisma: PrismaService, private readonly tmdbService: TmdbService) {}

  // 1. Obtener Cartelera
  async getNowPlaying(filters: MovieFilters): Promise<Movie[]> {
    const { date, city, chainId, cinemaId } = filters;

    const queryDate = date ? parseISO(date) : new Date();
    const start = startOfDay(queryDate);
    const end = endOfDay(queryDate);

    // Parseo seguro de números (evita pasar undefined a parseInt)
    const parsedChainId = chainId ? parseInt(chainId, 10) : undefined;
    const parsedCinemaId = cinemaId ? parseInt(cinemaId, 10) : undefined;

    return this.prisma.movie.findMany({
      where: {
        showtimes: {
          some: {
            dateTime: {
              gte: start,
              lte: end,
            },
            location: {
              name: city ? { contains: city, mode: 'insensitive' } : undefined,
              chainId: parsedChainId,
              id: parsedCinemaId,
            },
          },
        },
      },
      include: {
        showtimes: {
          take: 1,
          orderBy: { dateTime: 'asc' },
          where: { dateTime: { gte: new Date() } },
        },
      },
    });
  }

  // 2. Obtener Detalle + Funciones Agrupadas
  async getMovieDetail(id: number, filters: MovieFilters): Promise<MovieDetailResponse | null> {
    const { date, city } = filters;
    const queryDate = date ? parseISO(date) : new Date();
    const start = startOfDay(queryDate);
    const end = endOfDay(queryDate);

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

    // Reduce tipado explícitamente
    const showtimesByCinema = showtimes.reduce<GroupedShowtimes>((acc, show) => {
      const cinemaName = show.location.name;

      // Si no existe la entrada en el acumulador, la inicializamos
      if (!acc[cinemaName]) {
        acc[cinemaName] = {
          cinema: show.location,
          functions: [],
        };
      }

      // Agregamos la función al array
      acc[cinemaName].functions.push({
        id: show.id,
        time: show.dateTime,
        format: show.format,
        language: show.language,
        url: show.ticketUrl,
      });

      return acc;
    }, {});

    return {
      ...movie,
      cinemas: Object.values(showtimesByCinema),
    };
  }

  // 3. Filtros
  async getFiltersData(): Promise<CinemaChain[]> {
    return this.prisma.cinemaChain.findMany({
      include: { locations: true },
    });
  }

  // 4. Próximos Estrenos
  async getUpcomingMovies() {
    const rawMovies = await this.tmdbService.getUpcomingMovies();

    return rawMovies.map(movie => ({
      id: movie.id,
      title: movie.title,
      posterUrl: movie.poster_path ? `https://image.tmdb.org/t/p/w500${movie.poster_path}` : null,
      releaseDate: movie.release_date,
      overview: movie.overview,
    }));
  }
}