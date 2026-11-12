import { validCinepolisSchedule } from '../services/payload-integrity.util';
import { Injectable, Logger } from '@nestjs/common';
import { CINEPOLIS_LOCATIONS } from './cinepolis.locations';
import {
  buildArgentinaDate,
  deriveChainScrapeStatus,
  ICinemaScraper,
  ScrapedChainResult,
  ScrapedLocationResult,
  ScrapedMovieItem,
} from '../interfaces/scraper.interface';
import { TitleNormalizerService } from '../services/title-normalizer.service';

export const DEFAULT_CINEPOLIS_PUBLIC_API_KEY =
  'lQM6Mkvri1iHksKKCfpAiwGXq0YUZA7Nn6XAXRPr4i13LwXo';
export const DEFAULT_CINEPOLIS_GRAPHQL_TIMEOUT_MS = 10_000;

interface CinepolisGraphqlShowtime {
  format?: { name?: string };
  experience?: { name?: string };
  datetime: string; // "2026-10-30T19:00:00"
}

interface CinepolisGraphqlLanguageGroup {
  language: string;
  displayLanguage: string;
  showtimes: CinepolisGraphqlShowtime[];
}

interface CinepolisGraphqlDateGroup {
  date: string; // "2026-10-30"
  languages: CinepolisGraphqlLanguageGroup[];
}

export interface CinepolisGraphqlSchedule {
  cinemaId: string;
  movieId: string;
  dates: CinepolisGraphqlDateGroup[];
}

export interface CinepolisExtractedMovieSchedule {
  movieName: string;
  schedules: CinepolisGraphqlSchedule[];
}

interface CinepolisGraphqlErrorItem {
  message?: string;
}

interface CinepolisMoviesGraphqlResponse {
  data?: {
    movies?: {
      edges?: { node: { id: string; name: string } }[];
    };
  };
  errors?: CinepolisGraphqlErrorItem[];
}

interface CinepolisBillboardGraphqlResponse {
  data?: {
    billboard?: {
      schedules?: CinepolisGraphqlSchedule[];
    };
  };
  errors?: CinepolisGraphqlErrorItem[];
}

export interface CinepolisEvaluateParams {
  cinemasCsv: string;
  apiKey: string;
  requestTimeoutMs: number;
}

export interface CinepolisFailedMovie {
  movieId: string;
  movieName: string;
  reason: string;
}

export interface CinepolisEvaluateResult {
  moviesTotal: number;
  failedMovies: CinepolisFailedMovie[];
  schedules: CinepolisExtractedMovieSchedule[];
}

const BLOCKED_RESOURCE_TYPES = new Set(['image', 'media', 'font']);

/**
 * Runs inside the browser page context via `page.evaluate(...)`.
 * Must remain self-contained (no Node-scope closures or external imports).
 */
export async function evaluateCinepolisBillboard(
  params: CinepolisEvaluateParams,
): Promise<CinepolisEvaluateResult> {
  const endpoint = 'https://api-g.cinepolis.com/v2/billboards/graphql';
  const headers = {
    'content-type': 'application/json',
    'country-id': 'AR',
    language: 'ES',
    'x-apikey': params.apiKey,
  };

  async function postGraphql<
    T extends { data?: unknown; errors?: { message?: string }[] },
  >(operationName: string, bodyObj: Record<string, unknown>): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      controller.abort();
    }, params.requestTimeoutMs);

    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify(bodyObj),
        signal: controller.signal,
      });

      if (!res.ok) {
        throw new Error(`GraphQL ${operationName} HTTP ${res.status}`);
      }

      let payload: T;
      try {
        payload = (await res.json()) as T;
      } catch {
        throw new Error(`GraphQL ${operationName} JSON inválido`);
      }

      if (Array.isArray(payload?.errors) && payload.errors.length > 0) {
        const errText = payload.errors
          .map((e) => e?.message || 'error desconocido')
          .join('; ');
        throw new Error(`GraphQL ${operationName} errors: ${errText}`);
      }

      if (!payload || typeof payload !== 'object' || !payload.data) {
        throw new Error(`GraphQL ${operationName} respuesta sin campo data`);
      }

      return payload;
    } catch (err: unknown) {
      if (
        err instanceof Error &&
        (err.name === 'AbortError' || /aborted/i.test(err.message))
      ) {
        throw new Error(
          `GraphQL ${operationName} timeout (${params.requestTimeoutMs}ms)`,
        );
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }

  const moviesRes = await postGraphql<CinepolisMoviesGraphqlResponse>(
    'Movies',
    {
      operationName: 'Movies',
      variables: {
        category: 'now-playing',
        cinemas: '',
        limit: 100,
        countryId: 'AR',
        isAbsoluteMediaPath: true,
      },
      query:
        'query Movies($countryId: String!, $category: String, $cinemas: String, $limit: Int, $isAbsoluteMediaPath: Boolean) { movies(countryId: $countryId, category: $category, cinemas: $cinemas, limit: $limit, isAbsoluteMediaPath: $isAbsoluteMediaPath) { edges { node { id name } } } }',
    },
  );

  const edges = moviesRes.data?.movies?.edges;
  if (!Array.isArray(edges)) {
    throw new Error('GraphQL Movies esquema inválido: falta movies.edges');
  }

  const movies = edges
    .map((e) => e?.node)
    .filter((node): node is { id: string; name: string } =>
      Boolean(node && node.id && node.name),
    );

  if (movies.length !== edges.length)
    throw new Error('GraphQL Movies contiene invalid movies');

  const schedules: CinepolisExtractedMovieSchedule[] = [];
  const failedMovies: CinepolisFailedMovie[] = [];

  for (const movie of movies) {
    try {
      const bbRes = await postGraphql<CinepolisBillboardGraphqlResponse>(
        'Billboard',
        {
          operationName: 'Billboard',
          variables: {
            countryId: 'AR',
            movieId: movie.id,
            cinemas: params.cinemasCsv,
            timezone: 'America/Argentina/Buenos_Aires',
          },
          query:
            'query Billboard($countryId: String!, $movieId: String!, $cinemas: String!, $timezone: String) { billboard(countryId: $countryId, movieId: $movieId, cinemas: $cinemas, timezone: $timezone) { schedules { cinemaId movieId dates { date languages { language displayLanguage showtimes { format { name } experience { name } datetime } } } } } }',
        },
      );

      const movieSchedules = bbRes.data?.billboard?.schedules;
      if (!Array.isArray(movieSchedules)) {
        throw new Error(
          'GraphQL Billboard esquema inválido: falta billboard.schedules',
        );
      }

      if (movieSchedules.length > 0) {
        schedules.push({
          movieName: movie.name,
          schedules: movieSchedules,
        });
      }
    } catch (err: unknown) {
      const reason = err instanceof Error ? err.message : String(err);
      failedMovies.push({
        movieId: String(movie.id),
        movieName: String(movie.name),
        reason,
      });
    }
  }

  return {
    moviesTotal: movies.length,
    failedMovies,
    schedules,
  };
}

@Injectable()
export class CinepolisService implements ICinemaScraper {
  readonly chainKey = 'cinepolis';
  readonly chainName = 'Cinépolis';
  private readonly logger = new Logger(CinepolisService.name);
  private static stealthRegistered = false;

  constructor(private readonly normalizer: TitleNormalizerService) {}

  protected buildLaunchArgs(): string[] {
    const args = ['--disable-dev-shm-usage'];
    if (process.env.PUPPETEER_DISABLE_SANDBOX !== 'false') {
      args.unshift('--no-sandbox', '--disable-setuid-sandbox');
    }
    return args;
  }

  protected async launchBrowser(): Promise<import('puppeteer').Browser> {
    const puppeteerExtraModule = await import('puppeteer-extra');
    const StealthPluginModule = await import('puppeteer-extra-plugin-stealth');
    const puppeteerExtra = (puppeteerExtraModule.default ||
      puppeteerExtraModule) as unknown as {
      use: (plugin: unknown) => void;
      launch: (
        options: Record<string, unknown>,
      ) => Promise<import('puppeteer').Browser>;
    };
    const StealthPlugin =
      StealthPluginModule.default ||
      (StealthPluginModule as unknown as () => unknown);

    if (!CinepolisService.stealthRegistered) {
      puppeteerExtra.use(StealthPlugin());
      CinepolisService.stealthRegistered = true;
    }

    return puppeteerExtra.launch({
      headless: true,
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
      args: this.buildLaunchArgs(),
    });
  }

  async scrape(): Promise<ScrapedChainResult> {
    this.logger.log(
      'Iniciando recolección en Cinépolis (GraphQL v2 via Single Browser Context)...',
    );
    const locationsMap = new Map<string, Map<string, ScrapedMovieItem>>();
    for (const loc of CINEPOLIS_LOCATIONS) {
      locationsMap.set(loc.name, new Map<string, ScrapedMovieItem>());
    }
    const chainErrors: string[] = [];
    let topLevelFailure = false;
    let hasPartialMovieFailures = false;

    let browser: import('puppeteer').Browser | null = null;
    let page: import('puppeteer').Page | null = null;

    const apiKey =
      process.env.CINEPOLIS_PUBLIC_API_KEY?.trim() ||
      DEFAULT_CINEPOLIS_PUBLIC_API_KEY;

    try {
      browser = await this.launchBrowser();
      page = await browser.newPage();
      page.setDefaultTimeout(20_000);

      await page.setRequestInterception(true);
      page.on('request', (req) => {
        if (BLOCKED_RESOURCE_TYPES.has(req.resourceType())) {
          void req.abort().catch(() => undefined);
          return;
        }
        void req.continue().catch(() => undefined);
      });

      await page.goto('https://cinepolis.com/ar', {
        waitUntil: 'domcontentloaded',
        timeout: 20_000,
      });

      const allCinemasCsv = CINEPOLIS_LOCATIONS.map((l) => l.graphqlSlug).join(
        ',',
      );

      const evalResult = await page.evaluate(evaluateCinepolisBillboard, {
        cinemasCsv: allCinemasCsv,
        apiKey,
        requestTimeoutMs: DEFAULT_CINEPOLIS_GRAPHQL_TIMEOUT_MS,
      });

      for (const failed of evalResult.failedMovies) {
        const errMsg = `Billboard falló para "${failed.movieName}" (${failed.movieId}): ${failed.reason}`;
        this.logger.warn(`[Cinépolis] ${errMsg}`);
        chainErrors.push(errMsg);
      }

      if (
        evalResult.moviesTotal > 0 &&
        evalResult.failedMovies.length === evalResult.moviesTotal
      ) {
        topLevelFailure = true;
      } else if (evalResult.failedMovies.length > 0) {
        hasPartialMovieFailures = true;
      }

      const locationBySlug = new Map(
        CINEPOLIS_LOCATIONS.map((l) => [l.graphqlSlug, l]),
      );

      for (const item of evalResult.schedules) {
        const cleanTitle = this.normalizer.normalize(item.movieName);
        if (!cleanTitle) {
          hasPartialMovieFailures = true;
          chainErrors.push('Invalid title');
          continue;
        }

        for (const sched of item.schedules) {
          if (!validCinepolisSchedule(sched)) {
            hasPartialMovieFailures = true;
            chainErrors.push(
              `Invalid schedule structure: ${item.movieName}`,
            );
            continue;
          }
          const locConfig = locationBySlug.get(sched.cinemaId);
          if (!locConfig) continue;

          if (!locationsMap.has(locConfig.name)) {
            locationsMap.set(
              locConfig.name,
              new Map<string, ScrapedMovieItem>(),
            );
          }
          const locMovies = locationsMap.get(locConfig.name)!;

          const identityKey = this.normalizer.identityKey(
            item.movieName,
            sched.movieId,
          );
          if (!locMovies.has(identityKey)) {
            locMovies.set(identityKey, {
              rawTitle: cleanTitle,
              originalTitle: item.movieName,
              sourceMovieId: sched.movieId,
              showtimes: [],
            });
          }
          const movieEntry = locMovies.get(identityKey)!;

          for (const dateGroup of sched.dates || []) {
            for (const langGroup of dateGroup.languages || []) {
              const language = this.normalizer.normalizeLanguage(
                `${langGroup.language} ${langGroup.displayLanguage}`,
              );

              for (const st of langGroup.showtimes || []) {
                if (!st.datetime) continue;
                const [datePart, timePart] = st.datetime.split('T');
                if (!datePart || !timePart) continue;

                const formatRaw = `${st.format?.name || ''} ${st.experience?.name || ''}`;
                const format = this.normalizer.normalizeFormat(formatRaw);

                movieEntry.showtimes.push({
                  dateTime: buildArgentinaDate(datePart, timePart.slice(0, 5)),
                  format,
                  language,
                  ticketUrl: locConfig.url,
                });
              }
            }
          }
        }
      }
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Cinépolis scraper falló: ${msg}`);
      chainErrors.push(msg);
      topLevelFailure = true;
    } finally {
      if (page) {
        await page.close().catch(() => undefined);
      }
      if (browser) {
        await browser.close().catch(() => undefined);
      }
    }

    const locations: ScrapedLocationResult[] = CINEPOLIS_LOCATIONS.map(
      (loc) => {
        if (topLevelFailure) {
          return {
            locationName: loc.name,
            status: 'failed',
            movies: [],
            errors: [...chainErrors],
          };
        }

        const movies = Array.from(locationsMap.get(loc.name)!.values());

        if (hasPartialMovieFailures) {
          return {
            locationName: loc.name,
            status: 'partial',
            movies,
            errors: [...chainErrors],
          };
        }

        return {
          locationName: loc.name,
          status: movies.length > 0 ? 'complete' : 'empty_verified',
          movies,
        };
      },
    );

    return {
      chainKey: this.chainKey,
      chainName: this.chainName,
      status: deriveChainScrapeStatus(
        locations,
        CINEPOLIS_LOCATIONS.length,
        chainErrors,
      ),
      expectedLocations: CINEPOLIS_LOCATIONS.length,
      locations,
      errors: chainErrors,
    };
  }
}
