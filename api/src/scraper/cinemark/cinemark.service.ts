import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { CINEMARK_LOCATIONS } from './cinemark.locations';
import {
  buildArgentinaDate,
  ICinemaScraper,
  ScrapedChainResult,
  ScrapedLocationResult,
  ScrapedMovieItem,
} from '../interfaces/scraper.interface';
import { TitleNormalizerService } from '../services/title-normalizer.service';

interface CinemarkBffTheater {
  id: number;
  name: string;
  slug: string;
}

interface CinemarkBffShowtime {
  movieId: string;
  movieName: string;
  language?: {
    name?: string;
    shortName?: string;
  };
  sessionFormat?: string;
  sessionDateTime: string; // e.g. "2026-10-30T17:40:00.000Z" (wall-clock AR time)
  sessionDisplayDate: string; // "2026-10-30"
}

@Injectable()
export class CinemarkService implements ICinemaScraper {
  readonly chainKey = 'cinemark';
  readonly chainName = 'Cinemark';
  private readonly logger = new Logger(CinemarkService.name);
  private readonly bffBaseUrl = 'https://bff.cinemark.com.ar/api';

  constructor(private readonly normalizer: TitleNormalizerService) {}

  async scrape(): Promise<ScrapedChainResult> {
    this.logger.log(
      'Iniciando recolección en Cinemark (HTTP BFF JSON API - 0 MB Chrome)...',
    );
    const locationsResult: ScrapedLocationResult[] = [];

    try {
      const { data: theatersResponse } = await axios.get<{
        data: CinemarkBffTheater[];
      }>(`${this.bffBaseUrl}/cinema/theaters`, {
        headers: { country: 'AR' },
        timeout: 12000,
      });

      const theatersBySlug = new Map<string, number>();
      for (const t of theatersResponse.data || []) {
        if (t.slug && t.id) {
          theatersBySlug.set(t.slug.toLowerCase(), t.id);
        }
      }

      for (const locConfig of CINEMARK_LOCATIONS) {
        const slug = locConfig.url.split('/').filter(Boolean).pop()?.toLowerCase();
        const theaterId = slug ? theatersBySlug.get(slug) : undefined;

        if (!theaterId) {
          this.logger.warn(
            `No se encontró theaterId en BFF para ${locConfig.name} (slug: ${slug})`,
          );
          continue;
        }

        try {
          const { data: showtimesResponse } = await axios.get<{
            data: CinemarkBffShowtime[];
          }>(`${this.bffBaseUrl}/cinema/showtimes`, {
            params: { theater: theaterId },
            headers: { country: 'AR' },
            timeout: 12000,
          });

          const sessions = showtimesResponse.data || [];
          if (sessions.length === 0) continue;

          const moviesMap = new Map<string, ScrapedMovieItem>();

          for (const session of sessions) {
            if (!session.movieName || !session.sessionDateTime) continue;

            const cleanTitle = this.normalizer.normalize(session.movieName);
            if (!cleanTitle) continue;

            if (!moviesMap.has(cleanTitle)) {
              moviesMap.set(cleanTitle, {
                rawTitle: cleanTitle,
                showtimes: [],
              });
            }

            const datePart =
              session.sessionDisplayDate ||
              session.sessionDateTime.slice(0, 10);
            const timePart = session.sessionDateTime.slice(11, 16);

            const dateTime = buildArgentinaDate(datePart, timePart);
            const format = this.normalizer.normalizeFormat(
              session.sessionFormat,
            );
            const language = this.normalizer.normalizeLanguage(
              session.language?.name || session.language?.shortName,
            );

            moviesMap.get(cleanTitle)!.showtimes.push({
              dateTime,
              format,
              language,
              ticketUrl: locConfig.url,
            });
          }

          if (moviesMap.size > 0) {
            locationsResult.push({
              locationName: locConfig.name,
              movies: Array.from(moviesMap.values()),
            });
          }
        } catch (locErr: unknown) {
          const msg = locErr instanceof Error ? locErr.message : String(locErr);
          this.logger.error(`Error en ${locConfig.name}: ${msg}`);
        }
      }
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.error(`Error general en Cinemark BFF: ${msg}`);
    }

    return {
      chainName: this.chainName,
      locations: locationsResult,
    };
  }
}
