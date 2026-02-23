import { Injectable, Logger } from '@nestjs/common';
import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { Browser, Page } from 'puppeteer'; 
import { PrismaService } from '../../prisma/prisma.service';
import { TmdbService } from '../../tmdb/tmdb.service';
import { SHOWCASE_LOCATIONS } from './showcase.locations';

puppeteer.use(StealthPlugin());

// 1. Definimos la interface (El contrato)
interface ScrapedShowtime {
  cinema: string;
  formatRaw: string;
  time: string;
}

@Injectable()
export class ShowcaseService {
  private readonly logger = new Logger(ShowcaseService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tmdbService: TmdbService
  ) {}

  async runScraper() {
    this.logger.log('🍿 Iniciando recolección en Showcase (Modo: Película x Película)...');

    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    }) as unknown as Browser;

    try {
      const page = await browser.newPage();
      
      this.logger.log('📡 Conectando a la Home para obtener cartelera...');
      await page.goto('https://entradas.todoshowcase.com/', { waitUntil: 'domcontentloaded' });

      const movieLinks = await page.evaluate(() => {
        const anchors = Array.from(document.querySelectorAll('.category-thumb a'));
        return anchors
          .map((a) => (a as HTMLAnchorElement).href)
          .filter((href) => href.includes('pelicula.aspx?filmid='));
      });

      const uniqueLinks = [...new Set(movieLinks)];
      this.logger.log(`🎬 Se encontraron ${uniqueLinks.length} películas en cartelera.`);

      for (const link of uniqueLinks) {
        try {
          await this.scrapeMovieDetail(page, link);
          await new Promise((r) => setTimeout(r, 2000));
        } catch (e) {
          const errorMessage = e instanceof Error ? e.message : String(e);
          this.logger.error(`❌ Error procesando película ${link}: ${errorMessage}`);
        }
      }

      await browser.close();
      this.logger.log('🎉 ¡Showcase sincronizado exitosamente!');

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error('❌ Error general en Showcase:', errorMessage);
      if (browser) await browser.close();
    }
  }

  private async scrapeMovieDetail(page: Page, url: string) {
    this.logger.log(`➡️ Procesando: ${url}`);
    await page.goto(url, { waitUntil: 'domcontentloaded' });

    const rawTitle = await page.evaluate(() => {
        // Buscamos específicamente el <strong> dentro del h2 con clase 'name'
        const strongTag = document.querySelector('.movie-info-box .name strong');
        
        // Si existe el strong, usamos ese texto (es el más limpio)
        if (strongTag && strongTag.textContent) {
            return strongTag.textContent.trim();
        }

        // Fallback: Si no hay strong, buscamos el h2 completo
        const h2 = document.querySelector('.movie-info-box .name');
        return h2 ? h2.textContent?.trim() || null : null;
    });

    if (!rawTitle) {
        this.logger.warn('⚠️ No se encontró título de la película. Saltando...');
        return;
    }

    const tmdbInfo = await this.tmdbService.searchMovie(rawTitle);
    if (!tmdbInfo || !tmdbInfo.tmdbId) {
        this.logger.warn(`⚠️ TMDB no encontró: "${rawTitle}"`);
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

    // --- AQUÍ ESTÁ LA MAGIA ---
    const showtimesData = await page.evaluate(() => {
        // Usamos la estructura literal acá adentro porque 'ScrapedShowtime' no existe en el navegador
        const results: { cinema: string; formatRaw: string; time: string }[] = [];
        
        const headers = document.querySelectorAll('.ui-accordion-header');

        headers.forEach((header) => {
            const cinemaName = header.textContent?.trim() || '';
            const contentDiv = header.nextElementSibling; 

            if (contentDiv) {
                const formatDivs = contentDiv.querySelectorAll('.op_format');
                
                formatDivs.forEach((fmtDiv) => {
                    const formatText = fmtDiv.textContent?.trim() || ''; 
                    const perfsDiv = fmtDiv.nextElementSibling;
                    
                    if (perfsDiv) {
                        const buttons = perfsDiv.querySelectorAll('button.op_perf');
                        buttons.forEach((btn) => {
                            results.push({
                                cinema: cinemaName,
                                formatRaw: formatText,
                                time: btn.textContent?.trim() || ''
                            });
                        });
                    }
                });
            }
        });
        return results;
    }) as ScrapedShowtime[]; // <--- 2. ¡AQUÍ USAMOS LA INTERFACE!

    let count = 0;
    // Ahora 'item' ya sabe que es de tipo ScrapedShowtime
    for (const item of showtimesData) {
        if (!item.cinema || !item.time) continue;

        const locConfig = SHOWCASE_LOCATIONS.find((l) => 
            item.cinema.toLowerCase().includes(l.webName.toLowerCase()) 
        );

        if (!locConfig) continue;

        const parts = item.time.split(':');
        if (parts.length !== 2) continue;
        
        const hours = parseInt(parts[0], 10);
        const minutes = parseInt(parts[1], 10);
        
        const now = new Date();
        const showDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hours, minutes);
        
        if (showDate < now && hours < 6) {
             showDate.setDate(showDate.getDate() + 1);
        }

        let format = '2D';
        let lang = 'CASTELLANO';
        const rawUpper = item.formatRaw.toUpperCase();
        
        if (rawUpper.includes('3D')) format = '3D';
        if (rawUpper.includes('4D')) format = '4D';
        if (rawUpper.includes('IMAX')) format = 'IMAX';
        if (rawUpper.includes('SUBTITULADA') || rawUpper.includes('SUBTITULADO')) lang = 'SUBTITULADA';

        const chain = await this.prisma.cinemaChain.upsert({
             where: { name: 'Showcase' }, update: {}, create: { name: 'Showcase' }
        });

        let location = await this.prisma.cinemaLocation.findFirst({
            where: {
                name: locConfig.name,
                chainId: chain.id
            }
        });

        if (!location) {
            location = await this.prisma.cinemaLocation.create({
                data: {
                    name: locConfig.name,
                    chainId: chain.id,
                    address: 'Ver Web',
                    lat: 0, 
                    lng: 0 
                }
            });
        }

        await this.prisma.showtime.create({
            data: {
                movieId: movie.id,
                locationId: location.id,
                dateTime: showDate,
                format: format,
                language: lang,
                ticketUrl: url 
            }
        });
        count++;
    }
    this.logger.debug(`✅ Guardados ${count} horarios de "${movie.title}"`);
  }
}