import { Injectable, Logger } from '@nestjs/common';
import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { PrismaService } from '../../prisma/prisma.service';
import { TmdbService } from '../../tmdb/tmdb.service';
import { CINEMARK_LOCATIONS, CinemarkLocationConfig } from './cinemark.locations';

// Interfaces estrictas para eliminar los 'any'
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

  async runScraper() {
    this.logger.log('🕵️‍♂️ Iniciando Misión Sigilosa Global en Cinemark...');

    const browser = await puppeteer.launch({
      headless: true, 
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    try {
      const page = await browser.newPage();
      await page.setViewport({ width: 1366, height: 768 });
      
      let totalMoviesScraped = 0;

      // ITERAMOS SOBRE TU ARCHIVO DE CONFIGURACIÓN (Con tus URLs verificadas)
      for (const location of CINEMARK_LOCATIONS) {
        this.logger.log(`\n🚀 Navegando a: ${location.name}...`);
        
        try {
          // Usamos exactamente location.url sin modificar nada
          await page.goto(location.url, { waitUntil: 'networkidle2' });

          // ⏳ ESPERA INTELIGENTE: Obligamos a Puppeteer a esperar que aparezca al menos un <h1>
          // Esto evita que el scraper lea la página vacía mientras carga el AJAX.
          await page.waitForSelector('h1', { timeout: 10000 }).catch(() => {
            this.logger.warn(`⚠️ Tiempo agotado esperando títulos en ${location.name}.`);
          });

          const extractedMovies = await page.evaluate((): ExtractedMovie[] => {
            const results: ExtractedMovie[] = [];
            const seenTitles = new Set<string>();
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
                results.push({ title, totalShowtimes: showtimes.length, showtimes });
              }
            }
            return results;
          });

          this.logger.log(`✅ Extracción lista: ${extractedMovies.length} películas en ${location.name}.`);
          totalMoviesScraped += extractedMovies.length;
          
          await this.saveMoviesToDB(location, extractedMovies);

        } catch (cityError) {
          this.logger.error(`❌ Falló la carga de ${location.name}: ${cityError}`);
        }

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

  private async saveMoviesToDB(locConfig: CinemarkLocationConfig, extractedMovies: ExtractedMovie[]) {
    this.logger.log(`💾 Guardando horarios para ${locConfig.name}...`);

    const chain = await this.prisma.cinemaChain.upsert({
      where: { name: 'Cinemark' },
      update: {},
      create: { name: 'Cinemark' },
    });

    // Búsqueda segura por nombre y cadena
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

    // Limpiamos solo las funciones de hoy para este cine específico
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
      if (!tmdbInfo || !tmdbInfo.tmdbId) continue;

      const dbMovie = await this.prisma.movie.upsert({
        where: { tmdbId: tmdbInfo.tmdbId },
        update: { title: tmdbInfo.officialTitle, posterUrl: tmdbInfo.posterUrl },
        create: { tmdbId: tmdbInfo.tmdbId, title: tmdbInfo.officialTitle, posterUrl: tmdbInfo.posterUrl },
      });

      // Mapeo estricto de horarios
      const showtimesToCreate = movie.showtimes.map(st => {
        const [horas, minutos] = st.time.split(':');
        return {
          movieId: dbMovie.id,
          locationId: location.id,
          dateTime: new Date(`${hoyString}T${horas}:${minutos}:00.000Z`),
          format: st.format || '2D',
          language: st.language || 'CASTELLANO',
          ticketUrl: locConfig.url,
        };
      });

      if (showtimesToCreate.length > 0) {
        await this.prisma.showtime.createMany({ data: showtimesToCreate });
      }
    }
    this.logger.log(`✅ ¡PostgreSQL sincronizado para ${locConfig.name}!`);
  }
}