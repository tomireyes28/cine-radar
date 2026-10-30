import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { SHOWCASE_LOCATIONS } from './showcase.locations';
import {
  buildArgentinaDate,
  ICinemaScraper,
  ScrapedChainResult,
  ScrapedLocationResult,
  ScrapedMovieItem,
} from '../interfaces/scraper.interface';
import { TitleNormalizerService } from '../services/title-normalizer.service';

interface VoyAlCinePerformance {
  performanceId: number;
  showTime: string; // "14:15"
}

interface VoyAlCineFormat {
  formatDescription: string; // "2D-Subtitulado"
  showId: string;
  performances: VoyAlCinePerformance[];
}

interface VoyAlCineCinema {
  id: number;
  name: string;
  ewaveId: number;
  formats: VoyAlCineFormat[];
}

interface VoyAlCineFilmTree {
  id: number;
  name: string;
  days: Record<string, VoyAlCineCinema[]>;
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

    const locationsMap = new Map<string, Map<string, ScrapedMovieItem>>();

    try {
      const { data: homeHtml } = await axios.get<string>(
        'https://entradas.todoshowcase.com/',
        { timeout: 15000 },
      );

      const filmIds = [
        ...new Set(
          [...homeHtml.matchAll(/pelicula\.aspx\?filmid=(\d+)/gi)].map(
            (m) => m[1],
          ),
        ),
      ];

      this.logger.log(`Detectados ${filmIds.length} filmIds en Showcase.`);

      for (const filmId of filmIds) {
        try {
          const { data: tree } = await axios.get<VoyAlCineFilmTree>(
            `https://api.voyalcine.net/films/${filmId}/tree/showcase`,
            { timeout: 10000 },
          );

          if (!tree || !tree.name || !tree.days) continue;

          const cleanTitle = this.normalizer.normalize(tree.name);
          if (!cleanTitle) continue;

          const ticketUrl = `https://entradas.todoshowcase.com/showcase/pelicula.aspx?filmid=${filmId}`;

          for (const [dateStr, cinemas] of Object.entries(tree.days)) {
            if (!Array.isArray(cinemas)) continue;

            for (const cinema of cinemas) {
              const locConfig = SHOWCASE_LOCATIONS.find((l) =>
                cinema.name.toLowerCase().includes(l.webName.toLowerCase()),
              );
              if (!locConfig) continue;

              const isImaxVenue = cinema.name
                .toUpperCase()
                .includes('IMAX');

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

              for (const fmt of cinema.formats || []) {
                const rawFormatDesc = isImaxVenue
                  ? `IMAX ${fmt.formatDescription}`
                  : fmt.formatDescription;
                const format = this.normalizer.normalizeFormat(rawFormatDesc);
                const language =
                  this.normalizer.normalizeLanguage(rawFormatDesc);

                for (const perf of fmt.performances || []) {
                  if (!perf.showTime) continue;
                  const dateTime = buildArgentinaDate(dateStr, perf.showTime);

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
        } catch {
          // Skip individual film failure without stopping the rest
        }
      }
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.error(`Error general en Showcase: ${msg}`);
    }

    const locations: ScrapedLocationResult[] = [];
    for (const [locationName, moviesMap] of locationsMap.entries()) {
      locations.push({
        locationName,
        movies: Array.from(moviesMap.values()),
      });
    }

    return {
      chainName: this.chainName,
      locations,
    };
  }
}
