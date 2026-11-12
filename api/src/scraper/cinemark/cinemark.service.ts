import { validProviderTime } from '../services/payload-integrity.util';
import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { withHttpRetry } from '../../common/utils/http-retry.util';
import { CINEMARK_LOCATIONS } from './cinemark.locations';
import {
  buildArgentinaDate,
  deriveChainScrapeStatus,
  ICinemaScraper,
  ScrapedChainResult,
  ScrapedLocationResult,
  ScrapedMovieItem,
} from '../interfaces/scraper.interface';
import { TitleNormalizerService } from '../services/title-normalizer.service';

interface CinemarkBffTheater {
  id?: number;
  name?: string;
  slug?: string;
}

interface CinemarkBffShowtime {
  movieId?: string;
  movieName?: string;
  language?: {
    name?: string;
    shortName?: string;
  };
  sessionFormat?: string;
  sessionDateTime?: string; // e.g. "2026-10-30T17:40:00.000Z" (wall-clock AR time)
  sessionDisplayDate?: string; // "2026-10-30"
}

@Injectable()
export class CinemarkService implements ICinemaScraper {
  readonly chainKey = 'cinemark';
  readonly chainName = 'Cinemark';
  private readonly logger = new Logger(CinemarkService.name);
  private readonly bffBaseUrl = 'https://bff.cinemark.com.ar/api';

  constructor(private readonly normalizer: TitleNormalizerService) {}

  async scrape(signal?: AbortSignal): Promise<ScrapedChainResult> {
    this.logger.log(
      'Iniciando recolección en Cinemark (HTTP BFF JSON API - 0 MB Chrome)...',
    );
    const locationsResult: ScrapedLocationResult[] = [];
    const chainErrors: string[] = [];

    try {
      const { data: theatersResponse } = await withHttpRetry(
        () =>
          axios.get<{
            data?: CinemarkBffTheater[];
          }>(`${this.bffBaseUrl}/cinema/theaters`, {
            headers: { country: 'AR' },
            timeout: 12000,
            signal,
          }),
        { signal },
      );

      if (!Array.isArray(theatersResponse?.data)) {
        throw new Error(
          'Respuesta inválida en /cinema/theaters de Cinemark BFF',
        );
      }

      const theatersBySlug = new Map<string, number>();
      for (const t of theatersResponse.data) {
        if (typeof t?.slug === 'string' && typeof t?.id === 'number') {
          theatersBySlug.set(t.slug.toLowerCase(), t.id);
        }
      }

      if (theatersBySlug.size === 0) {
        throw new Error(
          'Catálogo vacío o con esquema desconocido en /cinema/theaters de Cinemark',
        );
      }

      for (const locConfig of CINEMARK_LOCATIONS) {
        const slug = locConfig.url
          .split('/')
          .filter(Boolean)
          .pop()
          ?.toLowerCase();
        const theaterId = slug ? theatersBySlug.get(slug) : undefined;

        if (!theaterId) {
          const err = `No se encontró theaterId en BFF para ${locConfig.name} (slug: ${slug})`;
          this.logger.warn(err);
          chainErrors.push(err);
          locationsResult.push({
            locationName: locConfig.name,
            status: 'failed',
            movies: [],
            errors: [err],
          });
          continue;
        }

        try {
          const { data: showtimesResponse } = await withHttpRetry(
            () =>
              axios.get<{
                data?: CinemarkBffShowtime[];
              }>(`${this.bffBaseUrl}/cinema/showtimes`, {
                params: { theater: theaterId },
                headers: { country: 'AR' },
                timeout: 12000,
                signal,
              }),
            { signal },
          );

          if (!Array.isArray(showtimesResponse?.data)) {
            const err = `${locConfig.name}: esquema inválido en /cinema/showtimes`;
            this.logger.error(err);
            chainErrors.push(err);
            locationsResult.push({
              locationName: locConfig.name,
              status: 'failed',
              movies: [],
              errors: [err],
            });
            continue;
          }

          const sessions = showtimesResponse.data;
          if (sessions.length === 0) {
            locationsResult.push({
              locationName: locConfig.name,
              status: 'empty_verified',
              movies: [],
            });
            continue;
          }

          const moviesMap = new Map<string, ScrapedMovieItem>();
          let validSessionsCount = 0;
          let invalidRecords = 0;

          for (const session of sessions) {
            if (
              typeof session?.movieName !== 'string' ||
              typeof session?.sessionDateTime !== 'string'
            ) {
              invalidRecords++;
              continue;
            }

            const cleanTitle = this.normalizer.normalize(session.movieName);
            if (!cleanTitle) {
              invalidRecords++;
              continue;
            }

            const datePart =
              session.sessionDisplayDate ||
              session.sessionDateTime.slice(0, 10);
            const timePart = session.sessionDateTime.slice(11, 16);
            const dateTime = buildArgentinaDate(datePart, timePart);
            if (!validProviderTime(datePart, timePart)) {
              invalidRecords++;
              continue;
            }

            const identityKey = this.normalizer.identityKey(
              session.movieName,
              session.movieId,
            );
            if (!moviesMap.has(identityKey)) {
              moviesMap.set(identityKey, {
                rawTitle: cleanTitle,
                originalTitle: session.movieName,
                sourceMovieId: session.movieId,
                showtimes: [],
              });
            }

            const format = this.normalizer.normalizeFormat(
              session.sessionFormat,
            );
            const language = this.normalizer.normalizeLanguage(
              session.language?.name || session.language?.shortName,
            );

            moviesMap.get(identityKey)!.showtimes.push({
              dateTime,
              format,
              language,
              ticketUrl: locConfig.url,
            });
            validSessionsCount++;
          }

          if (validSessionsCount === 0) {
            const err = `${locConfig.name}: ${sessions.length} sesiones recibidas pero 0 válidas (posible cambio de esquema)`;
            this.logger.error(err);
            chainErrors.push(err);
            locationsResult.push({
              locationName: locConfig.name,
              status: 'failed',
              movies: [],
              errors: [err],
            });
            continue;
          }

          if (invalidRecords > 0)
            chainErrors.push(`Registros inválidos: ${invalidRecords}`);
          locationsResult.push({
            locationName: locConfig.name,
            status: invalidRecords > 0 ? 'partial' : 'complete',
            errors:
              invalidRecords > 0
                ? [`Registros inválidos: ${invalidRecords}`]
                : undefined,
            movies: Array.from(moviesMap.values()),
          });
        } catch (locErr: unknown) {
          const msg = locErr instanceof Error ? locErr.message : String(locErr);
          const fullErr = `Error en ${locConfig.name}: ${msg}`;
          this.logger.error(fullErr);
          chainErrors.push(fullErr);
          locationsResult.push({
            locationName: locConfig.name,
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
          CINEMARK_LOCATIONS.length,
          chainErrors,
        ),
        expectedLocations: CINEMARK_LOCATIONS.length,
        locations: locationsResult,
        errors: chainErrors,
      };
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.error(`Error general en Cinemark BFF: ${msg}`);
      chainErrors.push(msg);

      const failedLocations: ScrapedLocationResult[] = CINEMARK_LOCATIONS.map(
        (loc) => ({
          locationName: loc.name,
          status: 'failed',
          movies: [],
          errors: [msg],
        }),
      );

      return {
        chainKey: this.chainKey,
        chainName: this.chainName,
        status: 'failed',
        expectedLocations: CINEMARK_LOCATIONS.length,
        locations: failedLocations,
        errors: chainErrors,
      };
    }
  }
}
