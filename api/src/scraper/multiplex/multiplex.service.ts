import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import * as cheerio from 'cheerio';
import { MULTIPLEX_LOCATIONS } from './multiplex.locations';
import {
  buildArgentinaDate,
  ICinemaScraper,
  ScrapedChainResult,
  ScrapedLocationResult,
  ScrapedMovieItem,
} from '../interfaces/scraper.interface';
import { TitleNormalizerService } from '../services/title-normalizer.service';

interface RawMultiplexFunction {
  complejo: string;
  dia: string; // "MM.DD.YYYY"
  hora: string; // "HH:mm"
  formato: string;
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

    for (const loc of MULTIPLEX_LOCATIONS) {
      locationsMap.set(loc.name, new Map<string, ScrapedMovieItem>());
    }

    try {
      const { data } = await axios.get<string>(url, { timeout: 15000 });
      const $ = cheerio.load(data);
      const movieItems = $('.funcion-item').toArray();

      for (const element of movieItems) {
        const $el = $(element);
        const rawTitle =
          $el.find('.titulo-link').text().trim() ||
          $el.find('img').attr('alt')?.trim() ||
          '';
        const movieUrl = $el.find('.portada-link').attr('href') || url;
        const funcionesRaw = $el.attr('data-funciones');

        if (!rawTitle || !funcionesRaw) continue;

        let allFunctions: RawMultiplexFunction[] = [];
        try {
          allFunctions = JSON.parse(funcionesRaw) as RawMultiplexFunction[];
        } catch {
          continue;
        }

        const cleanTitle = this.normalizer.normalize(rawTitle);
        if (!cleanTitle) continue;

        for (const locConfig of MULTIPLEX_LOCATIONS) {
          const matchingShows = allFunctions.filter(
            (f) => f.complejo === locConfig.complexId && f.dia && f.hora,
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
            const isoDatePart = this.parseMultiplexDate(f.dia);
            if (!isoDatePart) continue;

            const dateTime = buildArgentinaDate(isoDatePart, f.hora);
            const combinedFormat = `${f.formato || ''} ${f.idioma || ''}`;

            movieEntry.showtimes.push({
              dateTime,
              format: this.normalizer.normalizeFormat(combinedFormat),
              language: this.normalizer.normalizeLanguage(combinedFormat),
              ticketUrl: movieUrl,
            });
          }
        }
      }
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.error(`Error en Multiplex: ${msg}`);
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
