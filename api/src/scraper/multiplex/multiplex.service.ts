import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import * as cheerio from 'cheerio';
import { TmdbService } from '../../tmdb/tmdb.service';
import { PrismaService } from '../../prisma/prisma.service';
import { MULTIPLEX_LOCATIONS } from './multiplex.locations';

// Interfaces tipadas para evitar 'any'
interface RawMultiplexFunction {
  complejo: string; 
  dia: string;      
  hora: string;     
  formato: string;  
  idioma?: string; // Puede ser opcional
}

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

  async scrapeBillboard() {
    this.logger.log('🕵️‍♂️ Iniciando Scraper Multiplex (Todas las sedes)...');
    const url = 'https://multiplex.com.ar/';
    const targetDate = this.getTargetDateString();

    try {
      const { data } = await axios.get<string>(url);
      const $ = cheerio.load(data);
      const movieItems = $('.funcion-item').toArray();

      this.logger.log(`🎬 Se encontraron ${movieItems.length} películas en cartelera.`);

      await this.ensureLocationsExist();

      for (const element of movieItems) {
        const $el = $(element);
        const rawTitle = $el.find('.titulo-link').text().trim() || $el.find('img').attr('alt') || 'Sin Título';
        const movieUrl = $el.find('.portada-link').attr('href') || url;
        const funcionesRaw = $el.attr('data-funciones');

        if (!funcionesRaw) continue;

        let todasLasFunciones: RawMultiplexFunction[] = [];
        try {
          todasLasFunciones = JSON.parse(funcionesRaw) as RawMultiplexFunction[];
        } catch (error) { 
           console.warn(`⚠️ No se pudieron parsear las funciones para "${rawTitle}". Error:`, error);
           continue;
        }

        const tmdbData = await this.tmdbService.searchMovie(rawTitle);
        if (!tmdbData || !tmdbData.tmdbId) continue;

        const dbMovie = await this.prisma.movie.upsert({
          where: { tmdbId: tmdbData.tmdbId },
          update: { title: tmdbData.officialTitle, posterUrl: tmdbData.posterUrl },
          create: { tmdbId: tmdbData.tmdbId, title: tmdbData.officialTitle, posterUrl: tmdbData.posterUrl }
        });

        for (const locConfig of MULTIPLEX_LOCATIONS) {
          const funcionesCine = todasLasFunciones.filter(f => 
            f.complejo === locConfig.complexId && f.dia === targetDate
          );

          if (funcionesCine.length > 0) {
            await this.saveShowtimesForLocation(dbMovie.id, locConfig.name, funcionesCine, movieUrl);
          }
        }
      }

      this.logger.log('🎉 ¡Multiplex sincronizado exitosamente!');

    } catch (error: unknown) { // Manejo de errores seguro
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.error(`❌ Error crítico en Scraper Multiplex: ${msg}`);
    }
  }

  private async ensureLocationsExist() {
    const chain = await this.prisma.cinemaChain.upsert({
      where: { name: 'Multiplex' },
      update: {},
      create: { name: 'Multiplex' }
    });

    for (const config of MULTIPLEX_LOCATIONS) {
      const exists = await this.prisma.cinemaLocation.findFirst({
        where: { name: config.name, chainId: chain.id }
      });

      if (!exists) {
        this.logger.log(`🏗️ Creando sede nueva: ${config.name}`);
        await this.prisma.cinemaLocation.create({
          data: {
            name: config.name,
            chainId: chain.id,
            address: config.address,
            lat: config.lat,
            lng: config.lng
          }
        });
      }
    }
  }

  private async saveShowtimesForLocation(
    movieId: number,
    locationName: string,
    funciones: RawMultiplexFunction[],
    ticketUrl: string
  ) {
    const location = await this.prisma.cinemaLocation.findFirst({
      where: { name: locationName }
    });

    if (!location) return;

    await this.prisma.showtime.deleteMany({
      where: {
        movieId: movieId,
        locationId: location.id,
      }
    });

    for (const f of funciones) {
      const [hours, minutes] = f.hora.split(':');
      const [mm, dd, yyyy] = f.dia.split('.');
      
      const showDate = new Date(Number(yyyy), Number(mm) - 1, Number(dd), Number(hours), Number(minutes));

      let format = '2D';
      let lang = 'CASTELLANO';
      const rawFormat = (f.formato || '').toUpperCase();

      if (rawFormat.includes('3D')) format = '3D';
      if (rawFormat.includes('4D')) format = '4D';
      if (rawFormat.includes('PLATINUM') || rawFormat.includes('VIP')) format = 'PLATINUM';
      if (rawFormat.includes('SUBT')) lang = 'SUBTITULADA';

      await this.prisma.showtime.create({
        data: {
          movieId,
          locationId: location.id,
          dateTime: showDate,
          format,
          language: lang,
          ticketUrl: ticketUrl
        }
      });
    }
  }
}