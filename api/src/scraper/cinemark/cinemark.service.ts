import { Injectable, Logger } from '@nestjs/common';
import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { PrismaService } from '../../prisma/prisma.service';
import { TmdbService } from '../../tmdb/tmdb.service';
import { CINEMARK_LOCATIONS, CinemarkLocationConfig } from './cinemark.locations';


export interface ExtractedShowtime {
  time: string;
  format: string;
  language: string;
}

export interface ExtractedMovie {
  title: string;
  totalShowtimes: number;
  showtimes: ExtractedShowtime[];
}

puppeteer.use(StealthPlugin());

@Injectable()
export class CinemarkService {
  private readonly logger = new Logger(CinemarkService.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly tmdbService: TmdbService
  ) {}

 // Renombramos la función para que sea genérica
  async runScraper() {
    this.logger.log('🕵️‍♂️ Iniciando Misión Sigilosa Global en Cinemark...');

    const browser = await puppeteer.launch({
      headless: true, 
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1366, height: 768 });
    
    let totalMoviesScraped = 0;

    try {
      // ITERAMOS SOBRE EL ARCHIVO DE CONFIGURACIÓN
      for (const location of CINEMARK_LOCATIONS) {
        this.logger.log(`\n🚀 Navegando a: ${location.name}...`);
        
        await page.goto(location.url, { waitUntil: 'networkidle2' });

        const extractedMovies = await page.evaluate(() => {
          const results: ExtractedMovie[] = [];
          const seenTitles = new Set();
          const titleElements = Array.from(document.querySelectorAll('h1'));

          for (const h1 of titleElements) {
            const title = h1.textContent?.replace(/"/g, '').trim();
            if (!title || seenTitles.has(title)) continue;
            seenTitles.add(title);

            let container = h1.parentElement;
            while (container && container.querySelectorAll('p').length === 0) {
              container = container.parentElement;
            }

            if (!container) continue;

            const paragraphs = Array.from(container.querySelectorAll('p'));
            const showtimes: ExtractedShowtime[] = [];
            let currentFormat = '';
            let currentLanguage = '';

            for (let i = 0; i < paragraphs.length; i++) {
              const text = paragraphs[i].textContent?.trim() || '';

              if (text === '2D' || text === '3D' || text === 'XD' || text.includes('D-BOX')) {
                currentFormat = text;
                const nextText = paragraphs[i + 1]?.textContent?.trim() || '';
                if (nextText.startsWith('·')) {
                  currentLanguage = nextText.replace('·', '').trim();
                  i++; 
                }
              } 
              else if (text.endsWith('hs')) {
                showtimes.push({
                  time: text.replace('hs', ''), 
                  format: currentFormat,
                  language: currentLanguage
                });
              }
            }

            if (showtimes.length > 0) {
              results.push({ title: title, totalShowtimes: showtimes.length, showtimes: showtimes });
            }
          }
          return results;
        });

        this.logger.log(`✅ Extracción lista: ${extractedMovies.length} películas en ${location.name}.`);
        totalMoviesScraped += extractedMovies.length;
        
        // LE PASAMOS EL CINE ACTUAL AL GUARDADO
        await this.saveMoviesToDB(location, extractedMovies);

        // RESPIRAMOS 3 SEGUNDOS PARA ENGAÑAR A CLOUDFLARE ANTES DEL SIGUIENTE CINE
        this.logger.debug('Respirando 3 segundos para evadir bloqueos...');
        await new Promise(resolve => setTimeout(resolve, 3000));
      }

      await browser.close();
      return { success: true, message: `Scraping completo. ${totalMoviesScraped} carteleras procesadas.` };

    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Error desconocido';
      this.logger.error(`❌ Error general: ${errorMessage}`);
      await browser.close();
      return { success: false, error: errorMessage };
    }
  }

  // AHORA RECIBE EL LOCATION DINÁMICO DESDE EL BUCLE
  private async saveMoviesToDB(locConfig: CinemarkLocationConfig, extractedMovies: ExtractedMovie[]) {
    this.logger.log(`💾 Guardando horarios para ${locConfig.name}...`);

    const chain = await this.prisma.cinemaChain.upsert({
      where: { name: 'Cinemark' },
      update: {},
      create: { name: 'Cinemark' },
    });

    // USA LOS DATOS DINÁMICOS DEL CONFIG (Nombre, dirección, lat y lng reales)
    let location = await this.prisma.cinemaLocation.findFirst({
      where: { name: locConfig.name, chainId: chain.id },
    });

    if (!location) {
      location = await this.prisma.cinemaLocation.create({
        data: { 
          name: locConfig.name, 
          address: locConfig.address, 
          lat: locConfig.lat, 
          lng: locConfig.lng,
          chainId: chain.id 
        },
      });
    }

    const hoy = new Date();
    const hoyString = hoy.toISOString().split('T')[0];

    await this.prisma.showtime.deleteMany({
      where: {
        locationId: location.id,
        dateTime: {
          gte: new Date(`${hoyString}T00:00:00.000Z`),
          lt: new Date(`${hoyString}T23:59:59.999Z`),
        },
      },
    });

    for (const movie of extractedMovies) {
      const tmdbInfo = await this.tmdbService.searchMovie(movie.title);
      
      if (!tmdbInfo || !tmdbInfo.tmdbId) {
        // Silenciamos el log amarillo excesivo para no ensuciar tanto la terminal en bucles grandes
        continue;
      }

      const dbMovie = await this.prisma.movie.upsert({
        where: { tmdbId: tmdbInfo.tmdbId },
        update: { title: tmdbInfo.officialTitle, posterUrl: tmdbInfo.posterUrl },
        create: { tmdbId: tmdbInfo.tmdbId, title: tmdbInfo.officialTitle, posterUrl: tmdbInfo.posterUrl },
      });

      for (const st of movie.showtimes) {
        const [horas, minutos] = st.time.split(':');
        const showtimeDate = new Date(`${hoyString}T${horas}:${minutos}:00.000Z`);

        await this.prisma.showtime.create({
          data: {
            movieId: dbMovie.id,
            locationId: location.id, // ID dinámico de la sucursal actual
            dateTime: showtimeDate,
            format: st.format || '2D',
            language: st.language || 'CASTELLANO',
            ticketUrl: locConfig.url, // URL dinámica para comprar entradas en esa sucursal
          },
        });
      }
    }
    this.logger.log(`✅ ¡PostgreSQL sincronizado para ${locConfig.name}!`);
  }
}