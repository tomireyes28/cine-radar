import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { TmdbService } from '../../tmdb/tmdb.service';
import { CINEMACENTER_CITIES } from './cinemacenter.locations';
import puppeteer, { Page } from 'puppeteer';

interface MovieLinkData {
  title: string;
  showId: string;
  cinemaId: string;
}

interface RawShowtime {
  isoDate: string;
}

@Injectable()
export class CinemaCenterService {
  private readonly logger = new Logger(CinemaCenterService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tmdbService: TmdbService
  ) {}

  async runScraper() {
    this.logger.log('🍿 Iniciando recolección en Cinema Center (TypeScript Strict)...');

    const browser = await puppeteer.launch({
      headless: true, // Cambialo a 'false' si querés ver físicamente qué hace
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    try {
      const page = await browser.newPage();
      
      // Bloqueamos pavadas para que vuele
      await page.setRequestInterception(true);
      page.on('request', (req) => {
        if (['image', 'font'].includes(req.resourceType()))  req.abort();
        else req.continue();
      });

      const chain = await this.prisma.cinemaChain.upsert({
          where: { name: 'Cinema Center' }, update: {}, create: { name: 'Cinema Center' }
      });

      for (const city of CINEMACENTER_CITIES) {
        try {
          this.logger.log(`🌍 Procesando ciudad: ${city.name}...`);
          
          // 1. Ir a la Home principal
          await page.goto('https://www.cinemacenter.com.ar/', { waitUntil: 'networkidle2' });

          // 2. Seleccionar ciudad y esperar la recarga a la Home
          await Promise.all([
            page.waitForNavigation({ waitUntil: 'networkidle2' }),
            page.select('#city', city.cityId.toString()),
          ]);

          // 3. AHORA SÍ: Ir a horarios con la sesión ya cargada
          await page.goto('https://www.cinemacenter.com.ar/horarios', { waitUntil: 'networkidle2' });

          // 4. Extraer películas (con selector más flexible por las dudas)
          const moviesFound = await page.evaluate((): MovieLinkData[] => {
            const items: MovieLinkData[] = [];
            // Probamos con el selector que tenías y uno de respaldo
            const links = document.querySelectorAll('ul.movies li.movieLink a, .movies-list li a');
            
            links.forEach((el) => {
                const href = el.getAttribute('href') || '';
                const rawText = el.textContent?.trim() || '';
                if (href.includes('seleccionarMovie')) {
                    const matches = href.match(/seleccionarMovie\s*\(([^)]+)\)/);
                    if (matches && matches[1]) {
                        const args = matches[1].split(',').map(arg => arg.replace(/['"]/g, '').trim());
                        if (args[2] && args[3]) {
                            items.push({ title: rawText, showId: args[3], cinemaId: args[2] });
                        }
                    }
                }
            });
            return items;
          });

          this.logger.log(`   🎬 ${moviesFound.length} películas detectadas en /horarios.`);

          if (moviesFound.length > 0) {
            const location = await this.prisma.cinemaLocation.findFirst({
              where: { name: city.name, chainId: chain.id }
            }) || await this.prisma.cinemaLocation.create({
              data: { name: city.name, chainId: chain.id, address: city.address, lat: city.lat, lng: city.lng }
            });

            for (const movieData of moviesFound) {
               await this.processMovie(page, movieData, city.cityId, location.id);
            }
          }

        } catch (error) {
           this.logger.error(`❌ Error en ${city.name}: ${error}`);
        }
      }
    } finally {
      await browser.close();
      this.logger.log('🎉 Proceso terminado.');
    }
  }

  private async processMovie(page: Page, movieData: MovieLinkData, cityId: number, locationId: number) {
    let cleanTitle = movieData.title.split(' - ')[0].trim();
    cleanTitle = cleanTitle.replace(/\s(CAST|SUBT|2D|3D|XD|ATMOS).*$/i, '').trim();
    if (cleanTitle.toUpperCase().includes('LUNA NUEVA')) cleanTitle = 'La Saga Crepúsculo: Luna Nueva';

    const tmdbInfo = await this.tmdbService.searchMovie(cleanTitle);
    if (!tmdbInfo || !tmdbInfo.tmdbId) return;

   const movie = await this.prisma.movie.upsert({
    where: { tmdbId: tmdbInfo.tmdbId },
    update: { 
        title: tmdbInfo.officialTitle, 
        posterUrl: tmdbInfo.posterUrl 
    }, 
    create: {
        tmdbId: tmdbInfo.tmdbId,
        title: tmdbInfo.officialTitle,
        posterUrl: tmdbInfo.posterUrl
    }
});

    const showtimes = await page.evaluate(async (sId: string, cId: string, cinId: string): Promise<RawShowtime[]> => {
        try {
            const formData = new URLSearchParams();
            formData.append('showId', sId);
            formData.append('cityId', cId);
            formData.append('cinemaId', cinId);

            const resp = await fetch('https://www.cinemacenter.com.ar/modules/parts/ajax_horariosShow.php', {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: formData
            });

            const html = await resp.text();
            const div = document.createElement('div');
            div.innerHTML = html;

            const results: RawShowtime[] = [];
            div.querySelectorAll('li ul.hours li a').forEach((a) => {
               const href = a.getAttribute('href');
               if (href) {
                   const matches = href.match(/'([^']+)'/g);
                   if (matches && matches[4]) {
                       results.push({ isoDate: matches[4].replace(/'/g, '') });
                   }
               }
            });
            return results;
        } catch { return []; }
    }, movieData.showId, cityId.toString(), movieData.cinemaId);

    if (showtimes.length > 0) {
        await this.prisma.showtime.deleteMany({ where: { movieId: movie.id, locationId: locationId } });
        await this.prisma.showtime.createMany({
            data: showtimes.map(st => ({
                movieId: movie.id,
                locationId: locationId,
                dateTime: new Date(st.isoDate),
                format: movieData.title.toUpperCase().includes('3D') ? '3D' : '2D',
                language: movieData.title.toUpperCase().includes('SUBT') ? 'SUBTITULADA' : 'CASTELLANO',
                ticketUrl: 'https://www.cinemacenter.com.ar/horarios'
            }))
        });
    }
  }
}