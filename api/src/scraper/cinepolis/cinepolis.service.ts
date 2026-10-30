import { Injectable, Logger } from '@nestjs/common';
import { CINEPOLIS_LOCATIONS } from './cinepolis.locations';
import {
  buildArgentinaDate,
  ICinemaScraper,
  ScrapedChainResult,
  ScrapedLocationResult,
  ScrapedMovieItem,
} from '../interfaces/scraper.interface';
import { TitleNormalizerService } from '../services/title-normalizer.service';

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

interface CinepolisGraphqlSchedule {
  cinemaId: string;
  movieId: string;
  dates: CinepolisGraphqlDateGroup[];
}

interface CinepolisExtractedMovieSchedule {
  movieName: string;
  schedules: CinepolisGraphqlSchedule[];
}

@Injectable()
export class CinepolisService implements ICinemaScraper {
  readonly chainKey = 'cinepolis';
  readonly chainName = 'Cinépolis';
  private readonly logger = new Logger(CinepolisService.name);

  constructor(private readonly normalizer: TitleNormalizerService) {}

  async scrape(): Promise<ScrapedChainResult> {
    this.logger.log(
      'Iniciando recolección en Cinépolis (GraphQL v2 via Single Browser Context)...',
    );
    const locationsMap = new Map<string, Map<string, ScrapedMovieItem>>();

    let browser: import('puppeteer').Browser | null = null;

    try {
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

      puppeteerExtra.use(StealthPlugin());

      browser = await puppeteerExtra.launch({
        headless: true,
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
        ],
      });

      const page = await browser.newPage();
      await page.goto('https://cinepolis.com/ar', {
        waitUntil: 'domcontentloaded',
        timeout: 20000,
      });

      const allCinemasCsv = CINEPOLIS_LOCATIONS.map(
        (l) => l.graphqlSlug,
      ).join(',');

      const extractedSchedules = await page.evaluate(
        async (cinemasCsv: string): Promise<CinepolisExtractedMovieSchedule[]> => {
          const headers = {
            'content-type': 'application/json',
            'country-id': 'AR',
            language: 'ES',
            'x-apikey': 'lQM6Mkvri1iHksKKCfpAiwGXq0YUZA7Nn6XAXRPr4i13LwXo',
          };

          const moviesRes = await fetch(
            'https://api-g.cinepolis.com/v2/billboards/graphql',
            {
              method: 'POST',
              headers,
              body: JSON.stringify({
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
              }),
            },
          ).then((r) => r.json());

          const movies: { id: string; name: string }[] =
            moviesRes?.data?.movies?.edges?.map(
              (e: { node: { id: string; name: string } }) => e.node,
            ) || [];

          const results: CinepolisExtractedMovieSchedule[] = [];

          for (const movie of movies) {
            try {
              const bbRes = await fetch(
                'https://api-g.cinepolis.com/v2/billboards/graphql',
                {
                  method: 'POST',
                  headers,
                  body: JSON.stringify({
                    operationName: 'Billboard',
                    variables: {
                      countryId: 'AR',
                      movieId: movie.id,
                      cinemas: cinemasCsv,
                      timezone: 'America/Argentina/Buenos_Aires',
                    },
                    query:
                      'query Billboard($countryId: String!, $movieId: String!, $cinemas: String!, $timezone: String) { billboard(countryId: $countryId, movieId: $movieId, cinemas: $cinemas, timezone: $timezone) { schedules { cinemaId movieId dates { date languages { language displayLanguage showtimes { format { name } experience { name } datetime } } } } } }',
                  }),
                },
              ).then((r) => r.json());

              const schedules: CinepolisGraphqlSchedule[] =
                bbRes?.data?.billboard?.schedules || [];
              if (schedules.length > 0) {
                results.push({
                  movieName: movie.name,
                  schedules,
                });
              }
            } catch {
              // Ignore single movie failure
            }
          }

          return results;
        },
        allCinemasCsv,
      );

      const locationBySlug = new Map(
        CINEPOLIS_LOCATIONS.map((l) => [l.graphqlSlug, l]),
      );

      for (const item of extractedSchedules) {
        const cleanTitle = this.normalizer.normalize(item.movieName);
        if (!cleanTitle) continue;

        for (const sched of item.schedules) {
          const locConfig = locationBySlug.get(sched.cinemaId);
          if (!locConfig) continue;

          if (!locationsMap.has(locConfig.name)) {
            locationsMap.set(locConfig.name, new Map<string, ScrapedMovieItem>());
          }
          const locMovies = locationsMap.get(locConfig.name)!;

          if (!locMovies.has(cleanTitle)) {
            locMovies.set(cleanTitle, {
              rawTitle: cleanTitle,
              showtimes: [],
            });
          }
          const movieEntry = locMovies.get(cleanTitle)!;

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
    } finally {
      if (browser) {
        await browser.close().catch(() => undefined);
      }
    }

    const locations: ScrapedLocationResult[] = [];
    for (const [locationName, moviesMap] of locationsMap.entries()) {
      if (moviesMap.size > 0) {
        locations.push({
          locationName,
          movies: Array.from(moviesMap.values()),
        });
      }
    }

    return {
      chainName: this.chainName,
      locations,
    };
  }
}
