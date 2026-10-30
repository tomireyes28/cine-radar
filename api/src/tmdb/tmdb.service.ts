import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';

export interface TmdbMovieSearchItem {
  id: number;
  title: string;
  poster_path: string | null;
  backdrop_path?: string | null;
  release_date: string;
  overview?: string;
  vote_average?: number;
}

interface TmdbSearchResponse {
  results: TmdbMovieSearchItem[];
}

interface TmdbMovieDetailApiResponse {
  id: number;
  title: string;
  poster_path: string | null;
  backdrop_path: string | null;
  release_date: string;
  overview: string;
  runtime: number | null;
  vote_average: number;
  genres: { id: number; name: string }[];
}

export interface TmdbResolvedMovie {
  tmdbId: number;
  officialTitle: string;
  posterUrl: string | null;
  backdropUrl: string | null;
  overview: string | null;
  releaseDate: string | null;
  duration: number | null;
  rating: string | null;
  genres: string[];
}

@Injectable()
export class TmdbService {
  private readonly logger = new Logger(TmdbService.name);
  private readonly apiKey = process.env.TMDB_API_KEY;
  private readonly baseUrl = 'https://api.themoviedb.org/3';

  private readonly searchCache = new Map<string, TmdbResolvedMovie | null>();
  private readonly detailCache = new Map<number, TmdbMovieDetailApiResponse>();
  private upcomingCache: { expiresAt: number; data: TmdbMovieSearchItem[] } | null = null;

  private cleanTitle(rawTitle: string): string {
    let cleaned = rawTitle
      .split('|')[0]
      .split(' - ')[0]
      .replace(/\(.*?\)/g, ' ')
      .replace(/:([^\s])/g, ': $1')
      .replace(/[-_]/g, ' ');
    const regex =
      /\b(3D|2D|XD|4D|IMAX|ATMOS|D-BOX|DBOX|DOBLADA|DOBLADO|SUBTITULADA|SUBTITULADO|CASTELLANO|CAST|SUBT|SUB|LATINO|MACROXE|COMFORT|PLATINUM|VIP|48FPS)\b/gi;
    cleaned = cleaned.replace(regex, ' ');
    return cleaned.replace(/\s+/g, ' ').trim();
  }

  async searchMovie(rawTitle: string): Promise<TmdbResolvedMovie | null> {
    const cleanedTitle = this.cleanTitle(rawTitle);
    if (!cleanedTitle) return null;

    const cacheKey = cleanedTitle.toLowerCase();
    if (this.searchCache.has(cacheKey)) {
      return this.searchCache.get(cacheKey) ?? null;
    }

    try {
      const response = await axios.get<TmdbSearchResponse>(
        `${this.baseUrl}/search/movie`,
        {
          params: {
            api_key: this.apiKey,
            query: cleanedTitle,
            language: 'es-MX',
            region: 'AR',
            include_adult: false,
          },
          timeout: 8000,
        },
      );

      const results = response.data.results;
      if (!results || results.length === 0) {
        this.logger.warn(`No se encontró película en TMDB para: "${cleanedTitle}"`);
        this.searchCache.set(cacheKey, null);
        return null;
      }

      const topMatch = results[0];
      const details = await this.fetchMovieDetails(topMatch.id);

      const resolved: TmdbResolvedMovie = {
        tmdbId: topMatch.id,
        officialTitle: details?.title || topMatch.title,
        posterUrl: (details?.poster_path || topMatch.poster_path)
          ? `https://image.tmdb.org/t/p/w500${details?.poster_path || topMatch.poster_path}`
          : null,
        backdropUrl: (details?.backdrop_path || topMatch.backdrop_path)
          ? `https://image.tmdb.org/t/p/w1280${details?.backdrop_path || topMatch.backdrop_path}`
          : null,
        overview: details?.overview || topMatch.overview || null,
        releaseDate: details?.release_date || topMatch.release_date || null,
        duration: details?.runtime || null,
        rating:
          (details?.vote_average ?? topMatch.vote_average)
            ? Number(details?.vote_average ?? topMatch.vote_average).toFixed(1)
            : null,
        genres: details?.genres?.map((g) => g.name) ?? [],
      };

      this.searchCache.set(cacheKey, resolved);
      return resolved;
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.error(`Error consultando TMDB para "${cleanedTitle}": ${msg}`);
      return null;
    }
  }

  private async fetchMovieDetails(
    tmdbId: number,
  ): Promise<TmdbMovieDetailApiResponse | null> {
    if (this.detailCache.has(tmdbId)) {
      return this.detailCache.get(tmdbId) ?? null;
    }

    try {
      const response = await axios.get<TmdbMovieDetailApiResponse>(
        `${this.baseUrl}/movie/${tmdbId}`,
        {
          params: {
            api_key: this.apiKey,
            language: 'es-MX',
          },
          timeout: 8000,
        },
      );
      this.detailCache.set(tmdbId, response.data);
      return response.data;
    } catch {
      return null;
    }
  }

  async getUpcomingMovies(): Promise<TmdbMovieSearchItem[]> {
    const now = Date.now();
    if (this.upcomingCache && this.upcomingCache.expiresAt > now) {
      return this.upcomingCache.data;
    }

    try {
      const response = await axios.get<TmdbSearchResponse>(
        `${this.baseUrl}/movie/upcoming`,
        {
          params: {
            api_key: this.apiKey,
            language: 'es-MX',
            region: 'AR',
            page: 1,
          },
          timeout: 8000,
        },
      );

      const results = response.data.results ?? [];
      this.upcomingCache = {
        expiresAt: now + 60 * 60 * 1000, // 1 hour cache
        data: results,
      };
      return results;
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.error(`Error consultando próximos estrenos: ${msg}`);
      return [];
    }
  }
}
