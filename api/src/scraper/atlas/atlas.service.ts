import { validProviderTime } from '../services/payload-integrity.util';
import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { withHttpRetry } from '../../common/utils/http-retry.util';
import { ATLAS_LOCATIONS } from './atlas.locations';
import {
  buildArgentinaDate,
  deriveChainScrapeStatus,
  ICinemaScraper,
  ScrapedChainResult,
  ScrapedLocationResult,
  ScrapedMovieItem,
} from '../interfaces/scraper.interface';
import { TitleNormalizerService } from '../services/title-normalizer.service';

interface AtlasMovieCache {
  titulo?: string;
  tituloOriginal?: string;
}

interface AtlasShowtimeItem {
  codFuncion?: number;
  codComplejo?: number;
  horaComienzo?: string; // "15:00"
  fecha?: string; // "2026-10-30T00:00:00"
  cachePeliculas?: AtlasMovieCache;
  codTecnologia?: number;
}

@Injectable()
export class AtlasService implements ICinemaScraper {
  readonly chainKey = 'atlas';
  readonly chainName = 'Atlas Cines';
  private readonly logger = new Logger(AtlasService.name);

  constructor(private readonly normalizer: TitleNormalizerService) {}

  async scrape(): Promise<ScrapedChainResult> {
    this.logger.log('Iniciando recolección en Atlas Cines (HTTP JSON API)...');
    const locationsResult: ScrapedLocationResult[] = [];
    const chainErrors: string[] = [];

    for (const location of ATLAS_LOCATIONS) {
      try {
        const url = `https://www.atlascines.com/Funciones/GetPeliculasPorComplejo?codComplejo=${location.complexId}`;
        const { data } = await withHttpRetry(() =>
          axios.get<unknown>(url, {
            timeout: 10000,
          }),
        );

        if (!Array.isArray(data)) {
          const err = `${location.name}: esquema inválido (se esperaba arreglo JSON)`;
          this.logger.error(err);
          chainErrors.push(err);
          locationsResult.push({
            locationName: location.name,
            status: 'failed',
            movies: [],
            errors: [err],
          });
          continue;
        }

        if (data.length === 0) {
          this.logger.warn(`Sin funciones confirmadas para ${location.name}`);
          locationsResult.push({
            locationName: location.name,
            status: 'empty_verified',
            movies: [],
          });
          continue;
        }

        const moviesMap = new Map<string, ScrapedMovieItem>();
        let validShowtimesCount = 0;
        let invalidRecords = 0;

        for (const rawItem of data) {
          const item = rawItem as AtlasShowtimeItem;
          const rawTitle =
            typeof item?.cachePeliculas?.titulo === 'string'
              ? item.cachePeliculas.titulo.trim()
              : '';
          if (
            !rawTitle ||
            typeof item.fecha !== 'string' ||
            typeof item.horaComienzo !== 'string'
          ) {
            invalidRecords++;
            continue;
          }

          const normalizedKey = this.normalizer.normalize(rawTitle);
          if (!normalizedKey) {
            invalidRecords++;
            continue;
          }

          const datePart = item.fecha.split('T')[0];
          const dateTime = buildArgentinaDate(datePart, item.horaComienzo);
          if (!validProviderTime(datePart, item.horaComienzo)) {
            invalidRecords++;
            continue;
          }

          const identityKey = this.normalizer.identityKey(rawTitle);
          if (!moviesMap.has(identityKey)) {
            moviesMap.set(identityKey, {
              rawTitle: normalizedKey,
              originalTitle: rawTitle,
              showtimes: [],
            });
          }

          const format = this.normalizer.normalizeFormat(rawTitle);
          const language = this.normalizer.normalizeLanguage(rawTitle);

          moviesMap.get(identityKey)!.showtimes.push({
            dateTime,
            format,
            language,
            ticketUrl: location.url,
          });
          validShowtimesCount++;
        }

        if (validShowtimesCount === 0) {
          const err = `${location.name}: payload con ${data.length} elementos pero 0 funciones válidas (posible cambio de esquema)`;
          this.logger.error(err);
          chainErrors.push(err);
          locationsResult.push({
            locationName: location.name,
            status: 'failed',
            movies: [],
            errors: [err],
          });
          continue;
        }

        if (invalidRecords > 0)
          chainErrors.push(`Registros inválidos: ${invalidRecords}`);
        locationsResult.push({
          locationName: location.name,
          status: invalidRecords > 0 ? 'partial' : 'complete',
          errors:
            invalidRecords > 0
              ? [`Registros inválidos: ${invalidRecords}`]
              : undefined,
          movies: Array.from(moviesMap.values()),
        });
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        const fullErr = `Error en ${location.name}: ${msg}`;
        this.logger.error(fullErr);
        chainErrors.push(fullErr);
        locationsResult.push({
          locationName: location.name,
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
        ATLAS_LOCATIONS.length,
        chainErrors,
      ),
      expectedLocations: ATLAS_LOCATIONS.length,
      locations: locationsResult,
      errors: chainErrors,
    };
  }
}
