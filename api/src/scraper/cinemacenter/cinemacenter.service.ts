import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import * as cheerio from 'cheerio';
import { CINEMACENTER_CITIES } from './cinemacenter.locations';
import {
  buildArgentinaDate,
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

        if (movieLinks.length === 0) continue;

        const moviesMap = new Map<string, ScrapedMovieItem>();

        for (const item of movieLinks) {
          const cleanTitle = this.normalizer.normalize(item.rawTitle);
          if (!cleanTitle) continue;

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
              const isoRaw = matches[4].replace(/'/g, '').trim(); // e.g. "2026-10-30T16:00"
              const [datePart, timePart] = isoRaw.split('T');
              if (!datePart || !timePart) return;

              if (!moviesMap.has(cleanTitle)) {
                moviesMap.set(cleanTitle, {
                  rawTitle: cleanTitle,
                  showtimes: [],
                });
              }

              moviesMap.get(cleanTitle)!.showtimes.push({
                dateTime: buildArgentinaDate(datePart, timePart),
                format,
                language,
                ticketUrl: 'https://www.cinemacenter.com.ar/horarios',
              });
            }
          });
        }

        if (moviesMap.size > 0) {
          locationsResult.push({
            locationName: city.name,
            movies: Array.from(moviesMap.values()),
          });
        }
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        this.logger.error(`Error en ${city.name}: ${msg}`);
      }
    }

    return {
      chainName: this.chainName,
      locations: locationsResult,
    };
  }
}
