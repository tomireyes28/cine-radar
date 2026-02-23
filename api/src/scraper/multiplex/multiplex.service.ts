import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import * as cheerio from 'cheerio';
import { TmdbService } from '../../tmdb/tmdb.service';
import { ScrapedMovie, Showtime, RawMultiplexFunction } from '../interfaces/scraper.interface';
import { PrismaService } from '../../prisma/prisma.service';
import { Cron, CronExpression } from '@nestjs/schedule';

@Injectable()
export class MultiplexService {
  private readonly logger = new Logger(MultiplexService.name);

  constructor(
    private readonly tmdbService: TmdbService,
    private readonly prisma: PrismaService
  ) {}

  private getTargetDateString(): string {
    const today = new Date();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    const yyyy = today.getFullYear();
    return `${mm}.${dd}.${yyyy}`;
  }

  private async saveMoviesToDB(scrapedMovies: ScrapedMovie[], targetDateStr: string) {
    this.logger.log('💾 Iniciando guardado en la Base de Datos...');

    try {
      // 1. Buscamos el cine que creaste manualmente en Prisma Studio
      const location = await this.prisma.cinemaLocation.findFirst({
        where: { name: 'Multiplex Pilar' }
      });

      if (!location) {
        this.logger.warn('⚠️ No se encontró "Multiplex Pilar". Por favor, crealo en Prisma Studio.');
        return;
      }

      for (const movie of scrapedMovies) {
        const tmdb = movie.tmdbInfo as { tmdbId: number; officialTitle: string; posterUrl: string } | null;

        if (tmdb && tmdb.tmdbId) {
          
          // 2. Guardamos la película en la tabla Movie
          const savedMovie = await this.prisma.movie.upsert({
            where: { tmdbId: tmdb.tmdbId },
            update: {
              title: tmdb.officialTitle,
              posterUrl: tmdb.posterUrl,
            },
            create: {
              tmdbId: tmdb.tmdbId,
              title: tmdb.officialTitle,
              posterUrl: tmdb.posterUrl,
            }
          });

          // 3. Borramos horarios viejos de esta película en este cine para no duplicar
          await this.prisma.showtime.deleteMany({
            where: { movieId: savedMovie.id, locationId: location.id }
          });

          // 4. Preparamos los horarios para PostgreSQL
          const showtimesToSave = movie.showtimes.map(st => {
            const [mm, dd, yyyy] = targetDateStr.split('.');
            const [hours, minutes] = st.time.split(':');
            
            // ATENCIÓN: En JS, los meses van del 0 al 11, por eso restamos 1 al mes
            const showtimeDate = new Date(Number(yyyy), Number(mm) - 1, Number(dd), Number(hours), Number(minutes));

            return {
              movieId: savedMovie.id,
              locationId: location.id,
              dateTime: showtimeDate,
              format: st.format,
              language: st.language,
              ticketUrl: movie.ticketUrl || ''
            };
          });

          // 5. Guardamos todos los horarios en lote (Bulk Insert)
          if (showtimesToSave.length > 0) {
            await this.prisma.showtime.createMany({ data: showtimesToSave });
            this.logger.debug(`🎬 Guardada: ${savedMovie.title} con ${showtimesToSave.length} horarios.`);
          }
        }
      }
      this.logger.log('✅ ¡Películas y Horarios sincronizados en PostgreSQL!');
    } catch (error: any) {
      this.logger.error(`❌ Error al guardar en Prisma: ${error.message}`);
    }
  }

  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async handleCron() {
    this.logger.log('⏰ ¡Ring Ring! El Cron Job despertó. Ejecutando Scraper Automático...');
    await this.scrapeBillboard();
  }

  async scrapeBillboard() {
    this.logger.log('Iniciando Scraper Pro desde la Home...');
    const url = 'https://multiplex.com.ar/'; 

    try {
      const { data } = await axios.get<string>(url);
      const $ = cheerio.load(data);
      const extractedMovies: ScrapedMovie[] = [];
      const targetDate = this.getTargetDateString(); 

      const movieItems = $('.funcion-item').toArray();
      this.logger.log(`Se encontraron ${movieItems.length} películas en la Home.`);

      for (const element of movieItems) {
        const $el = $(element);
        const rawTitle = $el.find('.titulo-link').text().trim() || $el.find('img').attr('alt') || 'Sin Título';
        const movieUrl = $el.find('.portada-link').attr('href');
        const funcionesRaw = $el.attr('data-funciones');

        if (funcionesRaw) {
          const todasLasFunciones = JSON.parse(funcionesRaw) as RawMultiplexFunction[];
          const funcionesHoyPilar = todasLasFunciones.filter(f => 
            f.complejo === '187' && f.dia === targetDate
          );

          if (funcionesHoyPilar.length > 0) {
            this.logger.log(`✅ ¡Encontramos funciones para "${rawTitle}"!`);
            const tmdbData = await this.tmdbService.searchMovie(rawTitle);
            
            const showtimes: Showtime[] = funcionesHoyPilar.map(f => ({
              time: f.hora,
              format: f.formato,
              language: f.idioma
            }));

            extractedMovies.push({
              cinemaTitle: rawTitle,
              ticketUrl: movieUrl,
              tmdbInfo: tmdbData,
              showtimes: showtimes
            });
          }
        }
      }

      this.logger.log(`Proceso terminado. ${extractedMovies.length} películas con funciones hoy.`);
      
      // Llamamos a la función y le pasamos la fecha para armar el DateTime
      await this.saveMoviesToDB(extractedMovies, targetDate);

      return extractedMovies;

    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Error desconocido';
      this.logger.error(`Error en el Scraper Pro: ${errorMessage}`);
      return [];
    }
  }
}