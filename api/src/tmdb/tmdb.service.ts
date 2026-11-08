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

export type TmdbLookupResult =
  | { status: 'matched'; movie: TmdbResolvedMovie }
  | { status: 'not_found' }
  | { status: 'transient_error'; reason: string };

@Injectable()
export class TmdbService {
  private readonly logger = new Logger(TmdbService.name);
  private readonly baseUrl = 'https://api.themoviedb.org/3';

  private readonly searchCache = new Map<string, TmdbResolvedMovie | null>();
  private readonly detailCache = new Map<number, TmdbMovieDetailApiResponse>();
  private upcomingCache: {
    expiresAt: number;
    data: TmdbMovieSearchItem[];
  } | null = null;

  private get apiKey(): string | undefined {
    return process.env.TMDB_API_KEY;
  }

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

  /**
   * Distinguishes between a confirmed match, a confirmed absence in TMDB (HTTP 200 empty),
   * and transient infrastructure/configuration errors (never cached as negative results).
   */
  async lookupMovie(rawTitle: string): Promise<TmdbLookupResult> {
    const cleanedTitle = this.cleanTitle(rawTitle);
    if (!cleanedTitle) {
      return { status: 'not_found' };
    }

    const cacheKey = cleanedTitle.toLowerCase();
    if (this.searchCache.has(cacheKey)) {
      const cached = this.searchCache.get(cacheKey) ?? null;
      return cached
        ? { status: 'matched', movie: cached }
        : { status: 'not_found' };
    }

    if (!this.apiKey) {
      this.logger.warn(
        `TMDB_API_KEY ausente al consultar "${cleanedTitle}"; marcando como falla transitoria.`,
      );
      return { status: 'transient_error', reason: 'Missing TMDB_API_KEY' };
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

      const results = response.data?.results;
      if (!Array.isArray(results)) {
        return {
          status: 'transient_error',
          reason: 'Invalid TMDB response structure',
        };
      }

      if (results.length === 0) {
        this.logger.warn(
          `No se encontró película en TMDB para: "${cleanedTitle}"`,
        );
        this.searchCache.set(cacheKey, null);
        return { status: 'not_found' };
      }

      const topMatch = results[0];
      const details = await this.fetchMovieDetails(topMatch.id);

      const resolved: TmdbResolvedMovie = {
        tmdbId: topMatch.id,
        officialTitle: details?.title || topMatch.title,
        posterUrl:
          details?.poster_path || topMatch.poster_path
            ? `https://image.tmdb.org/t/p/w500${details?.poster_path || topMatch.poster_path}`
            : null,
        backdropUrl:
          details?.backdrop_path || topMatch.backdrop_path
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
      return { status: 'matched', movie: resolved };
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Error consultando TMDB para "${cleanedTitle}": ${msg}`,
      );
      return { status: 'transient_error', reason: msg };
    }
  }

  async searchMovie(rawTitle: string): Promise<TmdbResolvedMovie | null> {
    const result = await this.lookupMovie(rawTitle);
    return result.status === 'matched' ? result.movie : null;
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

    if (!this.apiKey) {
      return [];
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
