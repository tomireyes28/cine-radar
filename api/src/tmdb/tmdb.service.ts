import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import {
  extractReleaseYearHint,
  normalizeCinemaTitle,
  toComparableTitleKey,
} from '../common/utils/title-normalizer.util';
import { getArgentinaTodayDateString } from '../common/utils/argentina-time.util';

export interface TmdbMovieSearchItem {
  id: number;
  title: string;
  original_title?: string;
  poster_path: string | null;
  backdrop_path?: string | null;
  release_date: string;
  overview?: string;
  vote_average?: number;
  popularity?: number;
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

/**
 * Ranks TMDB search candidates using exact normalized title matching, optional
 * explicit release-year hints, active theatrical window preference, and metadata completeness,
 * instead of blindly trusting `results[0]`.
 */
export function selectBestTmdbCandidate(
  results: readonly TmdbMovieSearchItem[],
  cleanedQuery: string,
  yearHint?: number,
  currentYear: number = Number(getArgentinaTodayDateString().slice(0, 4)),
): TmdbMovieSearchItem {
  const queryKey = toComparableTitleKey(cleanedQuery);

  let bestCandidate = results[0];
  let bestScore = Number.NEGATIVE_INFINITY;

  for (let index = 0; index < results.length; index++) {
    const candidate = results[index];
    let score = -index * 2; // Gentle tiebreaker preserving upstream relevance order

    const titleKey = toComparableTitleKey(candidate.title || '');
    const originalKey = toComparableTitleKey(candidate.original_title || '');

    if (queryKey && (titleKey === queryKey || originalKey === queryKey)) {
      score += 100;
    } else if (
      queryKey &&
      (titleKey.startsWith(`${queryKey} `) ||
        originalKey.startsWith(`${queryKey} `))
    ) {
      score += 30;
    }

    const releaseYear = candidate.release_date
      ? Number(candidate.release_date.slice(0, 4))
      : NaN;

    if (!Number.isNaN(releaseYear)) {
      if (yearHint !== undefined) {
        const diff = Math.abs(releaseYear - yearHint);
        if (diff === 0) {
          score += 120;
        } else if (diff === 1) {
          score += 60;
        }
      } else {
        // Without an explicit year hint, favor active theatrical releases over old homonyms/silent-era films
        if (releaseYear >= currentYear - 1 && releaseYear <= currentYear + 1) {
          score += 45;
        } else if (releaseYear >= currentYear - 3 && releaseYear < currentYear - 1) {
          score += 20;
        }
      }
    }

    if (candidate.poster_path) score += 5;
    if (candidate.overview) score += 3;

    if (score > bestScore) {
      bestScore = score;
      bestCandidate = candidate;
    }
  }

  return bestCandidate;
}

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

  /**
   * Distinguishes between a confirmed match, a confirmed absence in TMDB (HTTP 200 empty),
   * and transient infrastructure/configuration errors (never cached as negative results).
   */
  async lookupMovie(rawTitle: string): Promise<TmdbLookupResult> {
    const yearHint = extractReleaseYearHint(rawTitle);
    const cleanedTitle = normalizeCinemaTitle(rawTitle);
    if (!cleanedTitle) {
      return { status: 'not_found' };
    }

    const cacheKey = yearHint
      ? `${cleanedTitle.toLowerCase()}#${yearHint}`
      : cleanedTitle.toLowerCase();
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

      const bestMatch = selectBestTmdbCandidate(
        results,
        cleanedTitle,
        yearHint,
      );
      const details = await this.fetchMovieDetails(bestMatch.id);

      const resolved: TmdbResolvedMovie = {
        tmdbId: bestMatch.id,
        officialTitle: details?.title || bestMatch.title,
        posterUrl:
          details?.poster_path || bestMatch.poster_path
            ? `https://image.tmdb.org/t/p/w500${details?.poster_path || bestMatch.poster_path}`
            : null,
        backdropUrl:
          details?.backdrop_path || bestMatch.backdrop_path
            ? `https://image.tmdb.org/t/p/w1280${details?.backdrop_path || bestMatch.backdrop_path}`
            : null,
        overview: details?.overview || bestMatch.overview || null,
        releaseDate: details?.release_date || bestMatch.release_date || null,
        duration: details?.runtime || null,
        rating:
          (details?.vote_average ?? bestMatch.vote_average)
            ? Number(details?.vote_average ?? bestMatch.vote_average).toFixed(1)
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
