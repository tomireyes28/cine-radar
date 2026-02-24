import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { PrismaService } from '../../prisma/prisma.service';
import { TmdbService } from '../../tmdb/tmdb.service';
import { ATLAS_LOCATIONS, AtlasLocationConfig } from './atlas.locations';

// Interfaces basadas en la estructura de la API de Atlas
interface AtlasMovieCache {
  titulo: string;         
  tituloOriginal: string; 
}

interface AtlasShowtimeItem {
  codFuncion: number;
  codComplejo: number;
  horaComienzo: string;   // Ej: "15:00"
  fecha: string;          // Ej: "2026-02-23T00:00:00"
  cachePeliculas: AtlasMovieCache;
  codTecnologia: number;
}

@Injectable()
export class AtlasService {
  private readonly logger = new Logger(AtlasService.name);

  constructor(
    private readonly httpService: HttpService,
    private readonly prisma: PrismaService,
    private readonly tmdbService: TmdbService
  ) {}

  async runScraper() {
    this.logger.log('🍿 Iniciando recolección en Atlas Cines (Vía API JSON)...');

    try {
      for (const location of ATLAS_LOCATIONS) {
        this.logger.log(`📡 Consultando API para: ${location.name} (ID: ${location.complexId})...`);

        const url = `https://www.atlascines.com/Funciones/GetPeliculasPorComplejo?codComplejo=${location.complexId}`;
        
        // Axios devuelve un Observable, lo convertimos a Promesa
        const response = await firstValueFrom(this.httpService.get<AtlasShowtimeItem[]>(url));
        const data = response.data;

        if (!data || data.length === 0) {
          this.logger.warn(`⚠️ No se encontraron funciones para ${location.name}`);
          continue;
        }

        this.logger.log(`✅ Recibidos ${data.length} registros raw. Procesando...`);
        await this.processShowtimes(data, location);
        
        // Pausa breve para no saturar
        await new Promise(r => setTimeout(r, 500));
      }

      this.logger.log('🎉 ¡Atlas Cines sincronizado exitosamente!');

    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.error('❌ Error en scraper de Atlas:', msg);
    }
  }

  private async processShowtimes(items: AtlasShowtimeItem[], config: AtlasLocationConfig) {
    // Agrupamos por título para optimizar llamadas a TMDB
    const moviesMap = new Map<string, AtlasShowtimeItem[]>();

    for (const item of items) {
      if (!item.cachePeliculas || !item.cachePeliculas.titulo) continue;
      
      let title = item.cachePeliculas.titulo.trim();

      // --- 🧹 LIMPIEZA DE TÍTULOS ---
      
      // 1. Corregir falta de espacio después de dos puntos (Ej: "AVATAR:FUEGO" -> "AVATAR: FUEGO")
      title = title.replace(/:([^\s])/g, ': $1');

      // 2. Corregir "CUMBRES BARRASCOSAS" -> "Cumbres Borrascosas"
      if (title.includes('BARRASCOSAS')) {
        title = title.replace('BARRASCOSAS', 'BORRASCOSAS');
      }

      // 3. Corregir "GOAT" cortado
      if (title.includes('GOAT: LA CABRA')) {
         title = 'GOAT'; // TMDB lo encuentra mejor así
      }
      
      // 4. Sacar basura del final (ej: "EN 2D", "SUBTITULADA", etc para la búsqueda)
      // (Opcional, pero ayuda si el título viene muy sucio)

      // Guardamos en el mapa con el título limpio
      if (!moviesMap.has(title)) {
        moviesMap.set(title, []);
      }
      moviesMap.get(title)?.push(item);
    }

    // Procesamos cada película
    for (const [title, showtimes] of moviesMap) {
      // 1. TMDB
      const tmdbInfo = await this.tmdbService.searchMovie(title);
      
      if (!tmdbInfo || !tmdbInfo.tmdbId) {
        this.logger.warn(`⚠️ TMDB no encontró: "${title}"`);
        continue;
      }

      // 2. Guardar Película
      const dbMovie = await this.prisma.movie.upsert({
        where: { tmdbId: tmdbInfo.tmdbId },
        update: {},
        create: {
          tmdbId: tmdbInfo.tmdbId,
          title: tmdbInfo.officialTitle,
          posterUrl: tmdbInfo.posterUrl
        }
      });

      // 3. Guardar Sucursal (Lógica segura findFirst + create)
      const chain = await this.prisma.cinemaChain.upsert({
        where: { name: 'Atlas Cines' }, update: {}, create: { name: 'Atlas Cines' }
      });

      let location = await this.prisma.cinemaLocation.findFirst({
        where: { name: config.name, chainId: chain.id }
      });

      if (!location) {
        location = await this.prisma.cinemaLocation.create({
            data: { 
                name: config.name, 
                chainId: chain.id, 
                address: 'Ver Web', 
                lat: 0, lng: 0 
            }
        });
      }

      // 4. Guardar Horarios
      let count = 0;
      for (const show of showtimes) {
        // Parsear fecha y hora
        // show.fecha viene como "2026-02-23T00:00:00"
        const datePart = show.fecha.split('T')[0]; // "2026-02-23"
        const [year, month, day] = datePart.split('-').map(Number);
        
        // show.horaComienzo viene como "15:00"
        const [hours, mins] = show.horaComienzo.split(':').map(Number);

        // Crear objeto Date (Mes es base 0)
        const showDate = new Date(year, month - 1, day, hours, mins);

        // Deducir Formato y Idioma del título
        // Atlas suele poner "SUBTITULADA" o "3D" en el título o no.
        let format = '2D';
        if (title.toUpperCase().includes('3D')) format = '3D';
        if (title.toUpperCase().includes('4D')) format = '4D';

        let lang = 'CASTELLANO'; // Default
        if (title.toUpperCase().includes('SUBT') || title.toUpperCase().includes('(S)')) {
            lang = 'SUBTITULADA';
        }

        await this.prisma.showtime.create({
          data: {
            movieId: dbMovie.id,
            locationId: location.id,
            dateTime: showDate,
            format: format,
            language: lang,
            ticketUrl: config.url
          }
        });
        count++;
      }
      this.logger.debug(`✅ Guardados ${count} horarios de "${dbMovie.title}"`);
    }
  }
}