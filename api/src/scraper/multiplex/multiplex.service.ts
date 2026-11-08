import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import * as cheerio from 'cheerio';
import { withHttpRetry } from '../../common/utils/http-retry.util';
import { MULTIPLEX_LOCATIONS } from './multiplex.locations';
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

interface RawMultiplexFunction {
  complejo?: string;
  dia?: string; // "MM.DD.YYYY"
  hora?: string; // "HH:mm"
  formato?: string;
  idioma?: string;
}

@Injectable()
export class MultiplexService implements ICinemaScraper {
  readonly chainKey = 'multiplex';
  readonly chainName = 'Multiplex';
  private readonly logger = new Logger(MultiplexService.name);

  constructor(private readonly normalizer: TitleNormalizerService) {}

  private parseMultiplexDate(dia: string): string | null {
    const parts = dia.split('.');
    if (parts.length !== 3) return null;
    const [mm, dd, yyyy] = parts;
    return `${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`;
  }

  async scrape(): Promise<ScrapedChainResult> {
    this.logger.log('Iniciando recolección en Multiplex (HTTP + Cheerio)...');
    const url = 'https://multiplex.com.ar/';
    const locationsMap = new Map<string, Map<string, ScrapedMovieItem>>();
    const chainErrors: string[] = [];

    for (const loc of MULTIPLEX_LOCATIONS) {
      locationsMap.set(loc.name, new Map<string, ScrapedMovieItem>());
    }

    try {
      const { data } = await withHttpRetry(() =>
        axios.get<string>(url, { timeout: 15000 }),
      );
      if (typeof data !== 'string' || !data.toLowerCase().includes('<html')) {
        throw new Error('Respuesta HTML inválida en Multiplex');
      }

      const $ = cheerio.load(data);
      const movieItems = $('.funcion-item').toArray();

      if (movieItems.length === 0) {
        throw new Error(
          'No se encontraron nodos .funcion-item en Multiplex (posible cambio de estructura HTML)',
        );
      }

      let corruptItems = 0;
      let totalParsedShowtimes = 0;

      for (const element of movieItems) {
        const $el = $(element);
        const rawTitle =
          $el.find('.titulo-link').text().trim() ||
          $el.find('img').attr('alt')?.trim() ||
          '';
        const movieUrl = $el.find('.portada-link').attr('href') || url;
        const funcionesRaw = $el.attr('data-funciones');

        if (!rawTitle || !funcionesRaw) {
          corruptItems++;
          continue;
        }

        let allFunctions: RawMultiplexFunction[] = [];
        try {
          const parsed = JSON.parse(funcionesRaw) as unknown;
          if (!Array.isArray(parsed)) {
            corruptItems++;
            continue;
          }
          allFunctions = parsed as RawMultiplexFunction[];
        } catch {
          corruptItems++;
          continue;
        }

        const cleanTitle = this.normalizer.normalize(rawTitle);
        if (!cleanTitle) continue;

        for (const locConfig of MULTIPLEX_LOCATIONS) {
          const matchingShows = allFunctions.filter(
            (f) =>
              f &&
              f.complejo === locConfig.complexId &&
              typeof f.dia === 'string' &&
              typeof f.hora === 'string',
          );
          if (matchingShows.length === 0) continue;

          const locMovies = locationsMap.get(locConfig.name)!;
          if (!locMovies.has(cleanTitle)) {
            locMovies.set(cleanTitle, {
              rawTitle: cleanTitle,
              showtimes: [],
            });
          }

          const movieEntry = locMovies.get(cleanTitle)!;

          for (const f of matchingShows) {
            const isoDatePart = this.parseMultiplexDate(f.dia!);
            if (!isoDatePart) continue;

            const dateTime = buildArgentinaDate(isoDatePart, f.hora!);
            if (isNaN(dateTime.getTime())) continue;

            const combinedFormat = `${f.formato || ''} ${f.idioma || ''}`;

            movieEntry.showtimes.push({
              dateTime,
              format: this.normalizer.normalizeFormat(combinedFormat),
              language: this.normalizer.normalizeLanguage(combinedFormat),
              ticketUrl: movieUrl,
            });
            totalParsedShowtimes++;
          }
        }
      }

      if (totalParsedShowtimes === 0) {
        throw new Error(
          `Se detectaron ${movieItems.length} ítems en Multiplex pero 0 horarios válidos (posible cambio de esquema data-funciones)`,
        );
      }

      if (corruptItems > 0) {
        chainErrors.push(
          `Multiplex omitió ${corruptItems} bloque(s) de película con JSON/atributos inválidos`,
        );
      }

      const locations: ScrapedLocationResult[] = MULTIPLEX_LOCATIONS.map(
        (loc) => {
          const movies = Array.from(locationsMap.get(loc.name)!.values());
          let status: ScrapeStatus =
            movies.length > 0 ? 'complete' : 'empty_verified';
          if (corruptItems > 0) {
            status = 'partial';
          }
          return {
            locationName: loc.name,
            status,
            movies,
            errors: corruptItems > 0 ? [...chainErrors] : undefined,
          };
        },
      );

      return {
        chainKey: this.chainKey,
        chainName: this.chainName,
        status: deriveChainScrapeStatus(
          locations,
          MULTIPLEX_LOCATIONS.length,
          chainErrors,
        ),
        expectedLocations: MULTIPLEX_LOCATIONS.length,
        locations,
        errors: chainErrors,
      };
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.error(`Error en Multiplex: ${msg}`);
      chainErrors.push(msg);

      const failedLocations: ScrapedLocationResult[] = MULTIPLEX_LOCATIONS.map(
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
        expectedLocations: MULTIPLEX_LOCATIONS.length,
        locations: failedLocations,
        errors: chainErrors,
      };
    }
  }
}
