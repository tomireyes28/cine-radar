import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { ATLAS_LOCATIONS } from './atlas.locations';
import {
  buildArgentinaDate,
  ICinemaScraper,
  ScrapedChainResult,
  ScrapedLocationResult,
  ScrapedMovieItem,
} from '../interfaces/scraper.interface';
import { TitleNormalizerService } from '../services/title-normalizer.service';

interface AtlasMovieCache {
  titulo: string;
  tituloOriginal: string;
}

interface AtlasShowtimeItem {
  codFuncion: number;
  codComplejo: number;
  horaComienzo: string; // "15:00"
  fecha: string; // "2026-10-30T00:00:00"
  cachePeliculas: AtlasMovieCache;
  codTecnologia: number;
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

    for (const location of ATLAS_LOCATIONS) {
      try {
        const url = `https://www.atlascines.com/Funciones/GetPeliculasPorComplejo?codComplejo=${location.complexId}`;
        const { data } = await axios.get<AtlasShowtimeItem[]>(url, {
          timeout: 10000,
        });

        if (!Array.isArray(data) || data.length === 0) {
          this.logger.warn(`Sin funciones para ${location.name}`);
          continue;
        }

        const moviesMap = new Map<string, ScrapedMovieItem>();

        for (const item of data) {
          const rawTitle = item.cachePeliculas?.titulo?.trim();
          if (!rawTitle || !item.fecha || !item.horaComienzo) continue;

          const normalizedKey = this.normalizer.normalize(rawTitle);
          if (!normalizedKey) continue;

          if (!moviesMap.has(normalizedKey)) {
            moviesMap.set(normalizedKey, {
              rawTitle: normalizedKey,
              showtimes: [],
            });
          }

          const datePart = item.fecha.split('T')[0];
          const dateTime = buildArgentinaDate(datePart, item.horaComienzo);

          const format = this.normalizer.normalizeFormat(rawTitle);
          const language = this.normalizer.normalizeLanguage(rawTitle);

          moviesMap.get(normalizedKey)!.showtimes.push({
            dateTime,
            format,
            language,
            ticketUrl: location.url,
          });
        }

        locationsResult.push({
          locationName: location.name,
          movies: Array.from(moviesMap.values()),
        });
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        this.logger.error(`Error en ${location.name}: ${msg}`);
      }
    }

    return {
      chainName: this.chainName,
      locations: locationsResult,
    };
  }
}
