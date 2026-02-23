import { Injectable, Logger } from '@nestjs/common';
import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { PrismaService } from '../../prisma/prisma.service';
import { TmdbService } from '../../tmdb/tmdb.service';


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

 async testScrapingAbasto() {
    this.logger.log('🕵️‍♂️ Iniciando misión sigilosa en Cinemark Abasto...');

    const browser = await puppeteer.launch({
      headless: true, 
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    try {
      const page = await browser.newPage();
      await page.setViewport({ width: 1366, height: 768 });

      this.logger.log('Navegando a la cartelera...');
      
      await page.goto('https://www.cinemark.com.ar/cartelera/abasto', {
        waitUntil: 'networkidle2', 
      });

      this.logger.log('Extrayendo cartelera directamente desde el HTML frontal...');

      const extractedMovies = await page.evaluate(() => {
       const results: ExtractedMovie[] = []
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
            results.push({
              title: title,
              totalShowtimes: showtimes.length,
              showtimes: showtimes
            });
          }
        }

        return results;
      });

      this.logger.log(`✅ ¡Éxito! Se extrajeron ${extractedMovies.length} películas.`);

      await this.saveMoviesToDB(extractedMovies);
      await browser.close();
      
      return { 
        success: true, 
        moviesCount: extractedMovies.length, 
        data: extractedMovies 
      };

    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Error desconocido';
      this.logger.error(`❌ Error al extraer: ${errorMessage}`);
      await browser.close();
      return { success: false, error: errorMessage };
    }
  }


 private async saveMoviesToDB(extractedMovies: ExtractedMovie[]) {
    this.logger.log('💾 Iniciando guardado en la Base de Datos (Cinemark)...');

    // 1. Cadena (Upsert funciona porque 'name' es @unique en CinemaChain)
    const chain = await this.prisma.cinemaChain.upsert({
      where: { name: 'Cinemark' },
      update: {},
      create: { name: 'Cinemark' },
    });

    // 2. Sucursal (Buscamos primero, creamos si no existe)
    let location = await this.prisma.cinemaLocation.findFirst({
      where: { name: 'Cinemark Abasto', chainId: chain.id },
    });

    if (!location) {
      location = await this.prisma.cinemaLocation.create({
        data: { 
          name: 'Cinemark Abasto', 
          address: 'Av. Corrientes 3247', 
          lat: -34.6037, // Coordenadas reales obligatorias
          lng: -58.4106,
          chainId: chain.id 
        },
      });
    }

    const hoy = new Date();
    const hoyString = hoy.toISOString().split('T')[0];

    // 3. Limpieza de horarios del día para evitar duplicados
    await this.prisma.showtime.deleteMany({
      where: {
        locationId: location.id,
        dateTime: {
          gte: new Date(`${hoyString}T00:00:00.000Z`),
          lt: new Date(`${hoyString}T23:59:59.999Z`),
        },
      },
    });

    // 4. Inserción de Películas y Horarios
    for (const movie of extractedMovies) {
      const tmdbInfo = await this.tmdbService.searchMovie(movie.title);
      
      if (!tmdbInfo || !tmdbInfo.tmdbId) {
        this.logger.warn(`⚠️ No se encontró en TMDB: ${movie.title}`);
        continue;
      }

      const dbMovie = await this.prisma.movie.upsert({
        where: { tmdbId: tmdbInfo.tmdbId },
        update: {
          title: tmdbInfo.officialTitle,
          posterUrl: tmdbInfo.posterUrl,
        },
        create: {
          tmdbId: tmdbInfo.tmdbId,
          title: tmdbInfo.officialTitle,
          posterUrl: tmdbInfo.posterUrl,
        },
      });

      for (const st of movie.showtimes) {
        const [horas, minutos] = st.time.split(':');
        const showtimeDate = new Date(`${hoyString}T${horas}:${minutos}:00.000Z`);

        await this.prisma.showtime.create({
          data: {
            movieId: dbMovie.id,
            locationId: location.id,
            dateTime: showtimeDate,
            format: st.format || '2D',
            language: st.language || 'CASTELLANO',
            ticketUrl: 'https://www.cinemark.com.ar/cartelera/abasto', 
          },
        });
      }
      this.logger.debug(`🎬 Guardada: ${dbMovie.title} con ${movie.showtimes.length} horarios.`);
    }
    this.logger.log('✅ ¡Cinemark Abasto sincronizado con PostgreSQL!');
  }
}