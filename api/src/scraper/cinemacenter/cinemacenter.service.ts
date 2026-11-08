import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import * as cheerio from 'cheerio';
import { CINEMACENTER_CITIES } from './cinemacenter.locations';
import {
  buildArgentinaDate,
  deriveChainScrapeStatus,
  ICinemaScraper,
  ScrapedChainResult,
  ScrapedLocationResult,
  ScrapedMovieItem,
} from '../interfaces/scraper.interface';
import { TitleNormalizerService } from '../services/title-normalizer.service';

interface MovieLinkData {
  rawTitle: string;
  showId: string;
  cinemaId: string;
}

@Injectable()
export class CinemaCenterService implements ICinemaScraper {
  readonly chainKey = 'cinemacenter';
  readonly chainName = 'Cinema Center';
  private readonly logger = new Logger(CinemaCenterService.name);

  constructor(private readonly normalizer: TitleNormalizerService) {}

  async scrape(): Promise<ScrapedChainResult> {
    this.logger.log(
      'Iniciando recolección en Cinema Center (HTTP + AJAX - 0 MB Chrome)...',
    );
    const locationsResult: ScrapedLocationResult[] = [];
    const chainErrors: string[] = [];

    for (const city of CINEMACENTER_CITIES) {
      try {
        const { data: rawBuffer } = await axios.get<ArrayBuffer>(
          'https://www.cinemacenter.com.ar/horarios',
          {
            responseType: 'arraybuffer',
            headers: {
              Cookie: `cityid=${city.cityId}`,
              'User-Agent':
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            },
            timeout: 12000,
          },
        );

        const horariosHtml = new TextDecoder('iso-8859-1').decode(rawBuffer);
        if (!horariosHtml.toLowerCase().includes('cinemacenter')) {
          throw new Error(
            'Estructura HTML desconocida en /horarios de Cinema Center',
          );
        }

        const $ = cheerio.load(horariosHtml);
        const movieLinks: MovieLinkData[] = [];

        $('ul.movies li.movieLink a, .movies-list li a').each((_, el) => {
          const href = $(el).attr('href') || '';
          const rawText = $(el).text().trim();
          if (href.includes('seleccionarMovie')) {
            const matches = href.match(/seleccionarMovie\s*\(([^)]+)\)/);
            if (matches && matches[1]) {
              const args = matches[1]
                .split(',')
                .map((arg) => arg.replace(/['"]/g, '').trim());
              if (args[2] && args[3]) {
                movieLinks.push({
                  rawTitle: rawText,
                  cinemaId: args[2],
                  showId: args[3],
                });
              }
            }
          }
        });

        if (movieLinks.length === 0) {
          locationsResult.push({
            locationName: city.name,
            status: 'empty_verified',
            movies: [],
          });
          continue;
        }

        const moviesMap = new Map<string, ScrapedMovieItem>();
        const ajaxErrors: string[] = [];
        let validShowtimesCount = 0;

        for (const item of movieLinks) {
          const cleanTitle = this.normalizer.normalize(item.rawTitle);
          if (!cleanTitle) continue;

          try {
            const body = new URLSearchParams({
              showId: item.showId,
              cityId: String(city.cityId),
              cinemaId: item.cinemaId,
            });

            const { data: ajaxHtml } = await axios.post<string>(
              'https://www.cinemacenter.com.ar/modules/parts/ajax_horariosShow.php',
              body.toString(),
              {
                headers: {
                  'Content-Type': 'application/x-www-form-urlencoded',
                },
                timeout: 10000,
              },
            );

            const $ajax = cheerio.load(ajaxHtml);
            const format = this.normalizer.normalizeFormat(item.rawTitle);
            const language = this.normalizer.normalizeLanguage(item.rawTitle);

            $ajax('li ul.hours li a').each((_, aEl) => {
              const href = $ajax(aEl).attr('href') || '';
              const matches = href.match(/'([^']+)'/g);
              if (matches && matches[4]) {
                const isoRaw = matches[4].replace(/'/g, '').trim();
                const [datePart, timePart] = isoRaw.split('T');
                if (!datePart || !timePart) return;

                const dateTime = buildArgentinaDate(datePart, timePart);
                if (isNaN(dateTime.getTime())) return;

                if (!moviesMap.has(cleanTitle)) {
                  moviesMap.set(cleanTitle, {
                    rawTitle: cleanTitle,
                    showtimes: [],
                  });
                }

                moviesMap.get(cleanTitle)!.showtimes.push({
                  dateTime,
                  format,
                  language,
                  ticketUrl: 'https://www.cinemacenter.com.ar/horarios',
                });
                validShowtimesCount++;
              }
            });
          } catch (ajaxErr: unknown) {
            const msg =
              ajaxErr instanceof Error ? ajaxErr.message : String(ajaxErr);
            ajaxErrors.push(`${city.name} showId=${item.showId}: ${msg}`);
          }
        }

        if (validShowtimesCount === 0) {
          const err = `${city.name}: ${movieLinks.length} películas detectadas pero 0 horarios extraídos`;
          chainErrors.push(err, ...ajaxErrors);
          locationsResult.push({
            locationName: city.name,
            status: 'failed',
            movies: [],
            errors: [err, ...ajaxErrors],
          });
          continue;
        }

        if (ajaxErrors.length > 0) {
          chainErrors.push(...ajaxErrors);
          locationsResult.push({
            locationName: city.name,
            status: 'partial',
            movies: Array.from(moviesMap.values()),
            errors: ajaxErrors,
          });
          continue;
        }

        locationsResult.push({
          locationName: city.name,
          status: 'complete',
          movies: Array.from(moviesMap.values()),
        });
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        const fullErr = `Error en ${city.name}: ${msg}`;
        this.logger.error(fullErr);
        chainErrors.push(fullErr);
        locationsResult.push({
          locationName: city.name,
          status: 'failed',
          movies: [],
          errors: [msg],
        });
      }
    }

    return {
      chainKey: this.chainKey,
      chainName: this.chainName,
      status: deriveChainScrapeStatus(
        locationsResult,
        CINEMACENTER_CITIES.length,
        chainErrors,
      ),
      expectedLocations: CINEMACENTER_CITIES.length,
      locations: locationsResult,
      errors: chainErrors,
    };
  }
}
