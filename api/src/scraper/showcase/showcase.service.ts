import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { withHttpRetry } from '../../common/utils/http-retry.util';
import { SHOWCASE_LOCATIONS } from './showcase.locations';
import {
  buildArgentinaDate,
  deriveChainScrapeStatus,
  ICinemaScraper,
  ScrapedChainResult,
  ScrapedLocationResult,
  ScrapedMovieItem,
  ScrapeStatus,
} from '../interfaces/scraper.interface';
import { TitleNormalizerService } from '../services/title-normalizer.service';

interface VoyAlCinePerformance {
  performanceId?: number;
  showTime?: string; // "14:15"
}

interface VoyAlCineFormat {
  formatDescription?: string; // "2D-Subtitulado"
  showId?: string;
  performances?: VoyAlCinePerformance[];
}

interface VoyAlCineCinema {
  id?: number;
  name?: string;
  ewaveId?: number;
  formats?: VoyAlCineFormat[];
}

interface VoyAlCineFilmTree {
  id?: number;
  name?: string;
  days?: Record<string, VoyAlCineCinema[]>;
}

@Injectable()
export class ShowcaseService implements ICinemaScraper {
  readonly chainKey = 'showcase';
  readonly chainName = 'Showcase';
  private readonly logger = new Logger(ShowcaseService.name);

  constructor(private readonly normalizer: TitleNormalizerService) {}

  async scrape(): Promise<ScrapedChainResult> {
    this.logger.log(
      'Iniciando recolección en Showcase (HTTP JSON API VoyAlCine - 0 MB Chrome)...',
    );

    const uniqueLocationNames = Array.from(
      new Set(SHOWCASE_LOCATIONS.map((l) => l.name)),
    );
    const locationsMap = new Map<string, Map<string, ScrapedMovieItem>>();
    for (const locName of uniqueLocationNames) {
      locationsMap.set(locName, new Map<string, ScrapedMovieItem>());
    }

    const chainErrors: string[] = [];

    try {
      const { data: homeHtml } = await withHttpRetry(() =>
        axios.get<string>('https://entradas.todoshowcase.com/', {
          timeout: 15000,
        }),
      );

      if (typeof homeHtml !== 'string') {
        throw new Error('Portada HTML inválida en Showcase');
      }

      const filmIds = [
        ...new Set(
          [...homeHtml.matchAll(/pelicula\.aspx\?filmid=(\d+)/gi)].map(
            (m) => m[1],
          ),
        ),
      ];

      this.logger.log(`Detectados ${filmIds.length} filmIds en Showcase.`);

      if (filmIds.length === 0) {
        throw new Error(
          'No se detectaron filmIds en la portada de Showcase (posible cambio de estructura)',
        );
      }

      let validTreesCount = 0;

      for (const filmId of filmIds) {
        try {
          const { data: tree } = await withHttpRetry(() =>
            axios.get<VoyAlCineFilmTree>(
              `https://api.voyalcine.net/films/${filmId}/tree/showcase`,
              { timeout: 10000 },
            ),
          );

          if (
            !tree ||
            typeof tree.name !== 'string' ||
            !tree.days ||
            typeof tree.days !== 'object'
          ) {
            chainErrors.push(
              `Showcase filmId=${filmId}: esquema VoyAlCine inválido`,
            );
            continue;
          }

          validTreesCount++;

          const cleanTitle = this.normalizer.normalize(tree.name);
          if (!cleanTitle) continue;

          const ticketUrl = `https://entradas.todoshowcase.com/showcase/pelicula.aspx?filmid=${filmId}`;

          for (const [dateStr, cinemas] of Object.entries(tree.days)) {
            if (!Array.isArray(cinemas)) continue;

            for (const cinema of cinemas) {
              const cinemaName =
                typeof cinema?.name === 'string' ? cinema.name : '';
              if (!cinemaName) continue;

              const locConfig = SHOWCASE_LOCATIONS.find((l) =>
                cinemaName.toLowerCase().includes(l.webName.toLowerCase()),
              );
              if (!locConfig) continue;

              const isImaxVenue = cinemaName.toUpperCase().includes('IMAX');
              const locMovies = locationsMap.get(locConfig.name)!;

              if (!locMovies.has(cleanTitle)) {
                locMovies.set(cleanTitle, {
                  rawTitle: cleanTitle,
                  showtimes: [],
                });
              }
              const movieEntry = locMovies.get(cleanTitle)!;

              for (const fmt of cinema.formats || []) {
                const baseDesc = fmt?.formatDescription || '';
                const rawFormatDesc = isImaxVenue
                  ? `IMAX ${baseDesc}`
                  : baseDesc;
                const format = this.normalizer.normalizeFormat(rawFormatDesc);
                const language =
                  this.normalizer.normalizeLanguage(rawFormatDesc);

                for (const perf of fmt.performances || []) {
                  if (typeof perf?.showTime !== 'string' || !perf.showTime) {
                    continue;
                  }
                  const dateTime = buildArgentinaDate(dateStr, perf.showTime);
                  if (isNaN(dateTime.getTime())) continue;

                  movieEntry.showtimes.push({
                    dateTime,
                    format,
                    language,
                    ticketUrl,
                  });
                }
              }
            }
          }
        } catch (filmErr: unknown) {
          const msg =
            filmErr instanceof Error ? filmErr.message : String(filmErr);
          const errDetail = `Showcase filmId=${filmId} falló: ${msg}`;
          this.logger.warn(errDetail);
          chainErrors.push(errDetail);
        }
      }

      if (validTreesCount === 0) {
        throw new Error(
          `Fallaron las ${filmIds.length} consultas de películas en VoyAlCine`,
        );
      }

      const hasFilmErrors = chainErrors.length > 0;
      const locations: ScrapedLocationResult[] = uniqueLocationNames.map(
        (locationName) => {
          const movies = Array.from(locationsMap.get(locationName)!.values());
          let status: ScrapeStatus =
            movies.length > 0 ? 'complete' : 'empty_verified';
          if (hasFilmErrors) {
            status = 'partial';
          }
          return {
            locationName,
            status,
            movies,
            errors: hasFilmErrors ? [...chainErrors] : undefined,
          };
        },
      );

      return {
        chainKey: this.chainKey,
        chainName: this.chainName,
        status: deriveChainScrapeStatus(
          locations,
          uniqueLocationNames.length,
          chainErrors,
        ),
        expectedLocations: uniqueLocationNames.length,
        locations,
        errors: chainErrors,
      };
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.error(`Error general en Showcase: ${msg}`);
      chainErrors.push(msg);

      const failedLocations: ScrapedLocationResult[] = uniqueLocationNames.map(
        (locationName) => ({
          locationName,
          status: 'failed',
          movies: [],
          errors: [msg],
        }),
      );

      return {
        chainKey: this.chainKey,
        chainName: this.chainName,
        status: 'failed',
        expectedLocations: uniqueLocationNames.length,
        locations: failedLocations,
        errors: chainErrors,
      };
    }
  }
}
