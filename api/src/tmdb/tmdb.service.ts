import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';

// Interfaces para mantener el tipado estricto
interface TmdbMovie {
  id: number;
  title: string;
  poster_path: string | null;
  release_date: string;
  overview?: string;
}

interface TmdbResponse {
  results: TmdbMovie[];
}

@Injectable()
export class TmdbService {
  private readonly logger = new Logger(TmdbService.name);
  private readonly apiKey = process.env.TMDB_API_KEY;
  private readonly baseUrl = 'https://api.themoviedb.org/3';

  private cleanTitle(rawTitle: string): string {
    let cleaned = rawTitle.replace(/[-_]/g, ' ');
    const regex = /(3D|2D|XD|4D|IMAX|ATMOS|DOBLADA|SUBTITULADA|CASTELLANO|LATINO|MACROXE|COMFORT)/gi;
    cleaned = cleaned.replace(regex, '');
    return cleaned.replace(/\s+/g, ' ').trim();
  }

  async searchMovie(rawTitle: string) {
    const cleanedTitle = this.cleanTitle(rawTitle);

    try {
      const response = await axios.get<TmdbResponse>(`${this.baseUrl}/search/movie`, {
        params: {
          api_key: this.apiKey,
          query: cleanedTitle,
          language: 'es-MX',    // ✅ CAMBIO CLAVE: es-MX es el estándar para títulos Latinos
          region: 'AR',         // ✅ OPCIONAL: Ayuda con fechas de estreno locales
          include_adult: false, // 🧹 Evita resultados ruidosos
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

      this.logger.warn(`⚠️ No se encontró película en TMDB para: "${cleanedTitle}"`);
      return null;

    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.error(`❌ Error consultando TMDB para "${cleanedTitle}": ${msg}`);
      return null;
    }
  }

  async getUpcomingMovies(): Promise<TmdbMovie[]> {
    try {
      const response = await axios.get<TmdbResponse>(`${this.baseUrl}/movie/upcoming`, {
        params: {
          api_key: this.apiKey,
          language: 'es-MX',
          region: 'AR', // Solo estrenos en Argentina
          page: 1, 
        },
      });

      return response.data.results;
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.error(`❌ Error consultando próximos estrenos: ${msg}`);
      return []; // Devolvemos array vacío para no romper el front
    }
  }
}