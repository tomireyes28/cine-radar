import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import * as cheerio from 'cheerio';
import { PrismaService } from '../../prisma/prisma.service';
import { TmdbService } from '../../tmdb/tmdb.service';
import { CINEMACENTER_CITIES, CinemaCenterCityConfig } from './cinemacenter.locations';

@Injectable()
export class CinemaCenterService {
  private readonly logger = new Logger(CinemaCenterService.name);
  private readonly decoder = new TextDecoder('iso-8859-1');

  constructor(
    private readonly httpService: HttpService,
    private readonly prisma: PrismaService,
    private readonly tmdbService: TmdbService
  ) {}

  async runScraper() {
    this.logger.log('🍿 Iniciando recolección en Cinema Center (Modo ISO-8859-1)...');

    for (const city of CINEMACENTER_CITIES) {
      try {
        this.logger.log(`🌍 Procesando ciudad: ${city.name} (ID: ${city.cityId})`);
        await this.scrapeCity(city);
        // Pausa de cortesía
        await new Promise((r) => setTimeout(r, 1000));
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        this.logger.error(`❌ Error en ciudad ${city.name}: ${msg}`);
      }
    }
    this.logger.log('🎉 ¡Cinema Center sincronizado exitosamente!');
  }

  private async scrapeCity(city: CinemaCenterCityConfig) {
    const url = `https://www.cinemacenter.com.ar/horarios/${city.slug}`;
    
    // 1. Tipado explícito <ArrayBuffer> para evitar 'any'
    const response = await firstValueFrom(
      this.httpService.get<ArrayBuffer>(url, {
        responseType: 'arraybuffer',
        headers: { 
            'Cookie': `cityId=${city.cityId}`,
            'User-Agent': 'Mozilla/5.0'
        }
      })
    );

    const buffer = response.data;
    const html = this.decoder.decode(buffer);
    const $ = cheerio.load(html);

    const moviesFound: { title: string; showId: string; cinemaId: string }[] = [];

    $('ul.movies li.movieLink a').each((_, el) => {
        const href = $(el).attr('href'); 
        const rawText = $(el).text().trim(); 

        if (href && href.includes('seleccionarMovie')) {
            const matches = href.match(/seleccionarMovie\s*\(([^)]+)\)/);
            
            if (matches && matches[1]) {
                const args = matches[1].split(',').map((arg) => arg.replace(/['"]/g, '').trim());
                const cinemaId = args[2];
                const showId = args[3];

                if (cinemaId && showId) {
                    moviesFound.push({
                        title: rawText,
                        showId: showId,
                        cinemaId: cinemaId
                    });
                }
            }
        }
    });

    this.logger.log(`  🎬 Encontradas ${moviesFound.length} películas en ${city.name}`);

    for (const movieData of moviesFound) {
        let cleanTitle = movieData.title.split(' - ')[0].trim();
        
        // Limpiezas manuales
        if (cleanTitle.includes('BARRASCOSAS')) cleanTitle = 'Cumbres Borrascosas';
        if (cleanTitle.includes('CUAADRADOS')) cleanTitle = 'Bob Esponja: En busca de los pantalones cuadrados';
        if (cleanTitle.includes('MIGRACI')) cleanTitle = '¡Patos!';
        if (cleanTitle.includes('OMNICIENTE')) cleanTitle = 'La profecía: Lector omnisciente';

        await this.fetchAndProcessShowtimes(city, cleanTitle, movieData.showId, movieData.cinemaId);
        
        await new Promise((r) => setTimeout(r, 200));
    }
  }

  private async fetchAndProcessShowtimes(city: CinemaCenterCityConfig, titleRaw: string, showId: string, cinemaId: string) {
    this.logger.log(`    ➡️ Buscando horarios para: ${titleRaw} (ShowID: ${showId})`);

    const params = new URLSearchParams();
    params.append('showId', showId);
    params.append('cityId', city.cityId.toString());
    params.append('cinemaId', cinemaId);

    // Tipado explícito <ArrayBuffer>
    const response = await firstValueFrom(
        this.httpService.post<ArrayBuffer>(
            'https://www.cinemacenter.com.ar/modules/parts/ajax_horariosShow.php',
            params,
            { 
                responseType: 'arraybuffer',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' } 
            }
        )
    );

    const ajaxHtml = this.decoder.decode(response.data);
    const $ = cheerio.load(ajaxHtml);
    
    const tmdbInfo = await this.tmdbService.searchMovie(titleRaw);
    if (!tmdbInfo || !tmdbInfo.tmdbId) {
        this.logger.warn(`    ⚠️ TMDB no encontró: "${titleRaw}"`);
        return;
    }

    const movie = await this.prisma.movie.upsert({
        where: { tmdbId: tmdbInfo.tmdbId },
        update: {},
        create: {
            tmdbId: tmdbInfo.tmdbId,
            title: tmdbInfo.officialTitle,
            posterUrl: tmdbInfo.posterUrl
        }
    });

    const chain = await this.prisma.cinemaChain.upsert({
        where: { name: 'Cinema Center' }, update: {}, create: { name: 'Cinema Center' }
    });
    
    let location = await this.prisma.cinemaLocation.findFirst({
        where: { name: city.name, chainId: chain.id }
    });

    if (!location) {
        location = await this.prisma.cinemaLocation.create({
            data: { 
                name: city.name, 
                chainId: chain.id, 
                address: 'Ver Web', 
                lat: 0, lng: 0 
            }
        });
    }

    let currentDayText = '';
    // Array para acumular las promesas de creación
    const createPromises: Promise<unknown>[] = [];

    $('li').each((_, li) => {
        const dayDiv = $(li).find('.day');
        if (dayDiv.length > 0) {
            currentDayText = dayDiv.text().trim();
        }

        const hoursUl = $(li).find('ul.hours li');
        hoursUl.each((__, hLi) => {
            const timeText = $(hLi).text().trim();
            if (!timeText || !currentDayText) return;

            const date = this.parseSpanishDate(currentDayText, timeText);
            
            if (date) {
                let format = '2D';
                if (titleRaw.toUpperCase().includes('3D')) format = '3D';
                
                let lang = 'CASTELLANO'; 
                if (titleRaw.toUpperCase().includes('SUBT')) lang = 'SUBTITULADA';

                // Pusheamos la promesa al array en lugar de dejarla flotando
                if (location) { // Check simple para TS
                    createPromises.push(
                        this.prisma.showtime.create({
                            data: {
                                movieId: movie.id,
                                locationId: location.id,
                                dateTime: date,
                                format: format,
                                language: lang,
                                ticketUrl: `https://www.cinemacenter.com.ar/horarios/${city.slug}`
                            }
                        })
                    );
                }
            }
        });
    });

    // Esperamos a que todas las funciones de esta película se guarden
    await Promise.all(createPromises);
  }

  private parseSpanishDate(dateString: string, timeString: string): Date | null {
    try {
        const match = dateString.match(/(\d+)\s+de\s+(\w+)\s+de\s+(\d+)/i);
        if (!match) return null;

        const day = parseInt(match[1], 10);
        const monthText = match[2].toLowerCase();
        const year = parseInt(match[3], 10);

        const months: { [key: string]: number } = {
            'enero': 0, 'febrero': 1, 'marzo': 2, 'abril': 3, 'mayo': 4, 'junio': 5,
            'julio': 6, 'agosto': 7, 'septiembre': 8, 'octubre': 9, 'noviembre': 10, 'diciembre': 11
        };

        const month = months[monthText];
        if (month === undefined) return null;

        const [hours, mins] = timeString.split(':').map(Number);
        return new Date(year, month, day, hours, mins);
    } catch {
        // Catch vacío o con _ para evitar error de variable no usada
        return null;
    }
  }
}