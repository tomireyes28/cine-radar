import {
  Inject,
  Injectable,
  Logger,
  Optional,
  ServiceUnavailableException,
} from '@nestjs/common';
import axios from 'axios';
import { getArgentinaTodayDateString } from '../common/utils/argentina-time.util';
import { BoundedTtlCache } from '../common/utils/bounded-ttl-cache.util';
import {
  HttpRetryOptions,
  withHttpRetry,
} from '../common/utils/http-retry.util';
import {
  extractReleaseYearHint,
  normalizeCinemaTitle,
  toComparableTitleKey,
} from '../common/utils/title-normalizer.util';

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

export const TMDB_SERVICE_OPTIONS = 'TMDB_SERVICE_OPTIONS';

export interface TmdbServiceOptions {
  maxCacheEntries?: number;
  positiveTtlMs?: number;
  negativeTtlMs?: number;
  upcomingTtlMs?: number;
  retryOptions?: HttpRetryOptions;
}

const DEFAULT_MAX_CACHE_ENTRIES = 1_000;
const DEFAULT_POSITIVE_TTL_MS = 24 * 60 * 60 * 1_000; // 24 hours
const DEFAULT_NEGATIVE_TTL_MS = 30 * 60 * 1_000; // 30 minutes for confirmed misses
const DEFAULT_UPCOMING_TTL_MS = 60 * 60 * 1_000; // 1 hour

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
        } else if (
          releaseYear >= currentYear - 3 &&
          releaseYear < currentYear - 1
        ) {
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

  private readonly searchCache: BoundedTtlCache<
    string,
    TmdbResolvedMovie | null
  >;
  private readonly detailCache: BoundedTtlCache<
    number,
    TmdbMovieDetailApiResponse
  >;
  private readonly upcomingCache = new BoundedTtlCache<
    string,
    TmdbMovieSearchItem[]
  >(4);

  private readonly inFlightLookups = new Map<
    string,
    Promise<TmdbLookupResult>
  >();
  private readonly inFlightDetails = new Map<
    number,
    Promise<TmdbMovieDetailApiResponse | null>
  >();
  private inFlightUpcoming: Promise<TmdbMovieSearchItem[]> | null = null;

  private readonly positiveTtlMs: number;
  private readonly negativeTtlMs: number;
  private readonly upcomingTtlMs: number;
  private readonly retryOptions: HttpRetryOptions;

  constructor(
    @Optional() @Inject(TMDB_SERVICE_OPTIONS) options?: TmdbServiceOptions,
  ) {
    const maxEntries = options?.maxCacheEntries ?? DEFAULT_MAX_CACHE_ENTRIES;
    this.searchCache = new BoundedTtlCache(maxEntries);
    this.detailCache = new BoundedTtlCache(maxEntries);
    this.positiveTtlMs = options?.positiveTtlMs ?? DEFAULT_POSITIVE_TTL_MS;
    this.negativeTtlMs = options?.negativeTtlMs ?? DEFAULT_NEGATIVE_TTL_MS;
    this.upcomingTtlMs = options?.upcomingTtlMs ?? DEFAULT_UPCOMING_TTL_MS;
    this.retryOptions = options?.retryOptions ?? {};
  }

  private get apiKey(): string | undefined {
    return process.env.TMDB_API_KEY;
  }

  /**
   * Distinguishes between a confirmed match, a confirmed absence in TMDB (HTTP 200 empty),
   * and transient infrastructure/configuration errors (never cached as negative results).
   * Deduplicates concurrent lookups for the same normalized key.
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

    const cachedEntry = this.searchCache.get(cacheKey);
    if (cachedEntry.hit) {
      return cachedEntry.value
        ? { status: 'matched', movie: cachedEntry.value }
        : { status: 'not_found' };
    }

    const pending = this.inFlightLookups.get(cacheKey);
    if (pending) {
      return pending;
    }

    const promise = this.executeLookup(
      cleanedTitle,
      yearHint,
      cacheKey,
    ).finally(() => {
      this.inFlightLookups.delete(cacheKey);
    });
    this.inFlightLookups.set(cacheKey, promise);
    return promise;
  }

  private async executeLookup(
    cleanedTitle: string,
    yearHint: number | undefined,
    cacheKey: string,
  ): Promise<TmdbLookupResult> {
    if (!this.apiKey) {
      this.logger.warn(
        `TMDB_API_KEY ausente al consultar "${cleanedTitle}"; marcando como falla transitoria.`,
      );
      return { status: 'transient_error', reason: 'Missing TMDB_API_KEY' };
    }

    try {
      const response = await withHttpRetry(
        () =>
          axios.get<TmdbSearchResponse>(`${this.baseUrl}/search/movie`, {
            params: {
              api_key: this.apiKey,
              query: cleanedTitle,
              language: 'es-MX',
              region: 'AR',
              include_adult: false,
            },
            timeout: 8000,
          }),
        this.retryOptions,
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
        this.searchCache.set(cacheKey, null, this.negativeTtlMs);
        return { status: 'not_found' };
      }

      const comparableQuery = toComparableTitleKey(cleanedTitle);
      const exactCandidates = results.filter(
        (item) =>
          toComparableTitleKey(item.title || '') === comparableQuery ||
          toComparableTitleKey(item.original_title || '') === comparableQuery,
      );
      if (
        !yearHint &&
        new Set(exactCandidates.map((item) => item.id)).size > 1
      ) {
        this.logger.warn(
          `Coincidencia ambigua para "${cleanedTitle}"; se conserva identidad de origen.`,
        );
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

      this.searchCache.set(cacheKey, resolved, this.positiveTtlMs);
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
    const cached = this.detailCache.get(tmdbId);
    if (cached.hit) {
      return cached.value;
    }

    const pending = this.inFlightDetails.get(tmdbId);
    if (pending) {
      return pending;
    }

    const promise = (async (): Promise<TmdbMovieDetailApiResponse | null> => {
      try {
        const response = await withHttpRetry(
          () =>
            axios.get<TmdbMovieDetailApiResponse>(
              `${this.baseUrl}/movie/${tmdbId}`,
              {
                params: {
                  api_key: this.apiKey,
                  language: 'es-MX',
                },
                timeout: 8000,
              },
            ),
          this.retryOptions,
        );
        this.detailCache.set(tmdbId, response.data, this.positiveTtlMs);
        return response.data;
      } catch {
        return null;
      }
    })().finally(() => {
      this.inFlightDetails.delete(tmdbId);
    });

    this.inFlightDetails.set(tmdbId, promise);
    return promise;
  }

  async getUpcomingMovies(): Promise<TmdbMovieSearchItem[]> {
    const todayAr = getArgentinaTodayDateString();
    const cacheKey = `upcoming:${todayAr}`;
    const cached = this.upcomingCache.get(cacheKey);
    if (cached.hit) {
      return cached.value;
    }

    if (this.inFlightUpcoming) {
      return this.inFlightUpcoming;
    }

    const promise = (async (): Promise<TmdbMovieSearchItem[]> => {
      if (!this.apiKey) {
        this.logger.error(
          'TMDB_API_KEY no configurada al consultar próximos estrenos.',
        );
        throw new ServiceUnavailableException(
          'El servicio externo de próximos estrenos no está configurado.',
        );
      }

      try {
        const response = await withHttpRetry(
          () =>
            axios.get<TmdbSearchResponse>(`${this.baseUrl}/movie/upcoming`, {
              params: {
                api_key: this.apiKey,
                language: 'es-MX',
                region: 'AR',
                page: 1,
              },
              timeout: 8000,
            }),
          this.retryOptions,
        );

        if (!Array.isArray(response.data?.results)) {
          throw new Error('Invalid TMDB upcoming response structure');
        }

        const results = response.data.results;
        this.upcomingCache.set(cacheKey, results, this.upcomingTtlMs);
        return results;
      } catch (error: unknown) {
        if (error instanceof ServiceUnavailableException) {
          throw error;
        }
        const msg = error instanceof Error ? error.message : String(error);
        this.logger.error(`Error consultando próximos estrenos: ${msg}`);
        throw new ServiceUnavailableException(
          'No se pudieron obtener los próximos estrenos temporalmente.',
        );
      }
    })().finally(() => {
      this.inFlightUpcoming = null;
    });

    this.inFlightUpcoming = promise;
    return promise;
  }
}
