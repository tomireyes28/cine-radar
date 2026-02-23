import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';

// Definimos la forma exacta de la película que nos devuelve TMDB
interface TmdbMovie {
  id: number;
  title: string;
  poster_path: string | null;
  release_date: string;
}

// Definimos la forma de la respuesta general de TMDB
interface TmdbResponse {
  results: TmdbMovie[];
}

@Injectable()
export class TmdbService {
  private readonly logger = new Logger(TmdbService.name);
  private readonly apiKey = process.env.TMDB_API_KEY;
  private readonly baseUrl = 'https://api.themoviedb.org/3';

  private cleanTitle(rawTitle: string): string {
    // 1. Cambiamos guiones por espacios normales
    let cleaned = rawTitle.replace(/[-_]/g, ' ');

    // 2. Eliminamos las etiquetas técnicas de los cines
    const regex = /(3D|2D|XD|4D|IMAX|ATMOS|DOBLADA|SUBTITULADA|CASTELLANO|LATINO|MACROXE|COMFORT)/gi;
    cleaned = cleaned.replace(regex, '');

    // 3. Borramos espacios dobles o triples que hayan quedado en el medio
    return cleaned.replace(/\s+/g, ' ').trim();
  }

  async searchMovie(rawTitle: string) {
    const cleanedTitle = this.cleanTitle(rawTitle);

    try {
      // Acá le pasamos <TmdbResponse> a axios para que sepa qué está recibiendo
      const response = await axios.get<TmdbResponse>(`${this.baseUrl}/search/movie`, {
        params: {
          api_key: this.apiKey,
          query: cleanedTitle,
          language: 'es-AR',
        },
      });

      const results = response.data.results;

      if (results.length > 0) {
        const movie = results[0];
        
        return {
          tmdbId: movie.id,
          officialTitle: movie.title,
          posterUrl: movie.poster_path ? `https://image.tmdb.org/t/p/w500${movie.poster_path}` : null, 
          releaseDate: movie.release_date, 
        };
      }

      this.logger.warn(`No se encontró película en TMDB para: "${cleanedTitle}"`);
      return null;

    } catch (error: unknown) {
      if (error instanceof Error) {
        this.logger.error(`Error consultando TMDB para "${cleanedTitle}":`, error.message);
      }
      return null;
    }
  }
}