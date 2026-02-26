import { Injectable, Logger } from '@nestjs/common';
import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { PrismaService } from '../../prisma/prisma.service';
import { TmdbService } from '../../tmdb/tmdb.service';
import { CINEPOLIS_LOCATIONS, CinepolisLocationConfig } from './cinepolis.locations';

puppeteer.use(StealthPlugin());

// --- INTERFACES DEL JSON DE CINÉPOLIS ---
interface CinepolisShowtime {
  starts_at: string; // "2026-02-23 14:50:00"
}

interface CinepolisOption {
  format: string;  // "2D", "3D"
  version: string; // "CAST", "SUBT"
  showtimes: CinepolisShowtime[];
}

interface CinepolisGroup {
  options: CinepolisOption[];
}

interface CinepolisMovie {
  title_translated: string;
  poster_path?: string;
  showtimes_data: CinepolisGroup[];
}

interface CinepolisApiResponse {
  data: CinepolisMovie[];
}

@Injectable()
export class CinepolisService {
  private readonly logger = new Logger(CinepolisService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tmdbService: TmdbService
  ) {}

  async runScraper() {
    this.logger.log('🍿 Iniciando recolección en Cinépolis (Vía API Interna)...');

    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    try {
      const page = await browser.newPage();
      
      // Fecha de hoy para la URL (YYYY-MM-DD)
      const hoy = new Date();
      const fechaQuery = hoy.toISOString().split('T')[0];

      for (const location of CINEPOLIS_LOCATIONS) {
        this.logger.log(`\n🚀 Conectando con API de: ${location.name}...`);

        // TRUCO: Vamos directo a la API que descubriste, simulando ser un navegador
        const apiUrl = `https://www.cinepolis.com.ar/api/movies?complex=${location.complexId}&dates=${fechaQuery}&view=showtimes`;
        
        await page.goto(apiUrl, { waitUntil: 'networkidle0' });

        // Extraemos el JSON puro del body de la página
        const apiResponse = await page.evaluate(() => {
          return JSON.parse(document.body.innerText) as CinepolisApiResponse;
        });

        if (!apiResponse.data || apiResponse.data.length === 0) {
          this.logger.warn(`⚠️ La API no devolvió funciones para ${location.name}`);
          continue;
        }

        this.logger.log(`✅ ¡Datos recibidos! Procesando ${apiResponse.data.length} películas...`);
        
        await this.processAndSaveMovies(apiResponse.data, location);

        // Pausa anti-bloqueo (aunque la API es más permisiva, mejor prevenir)
        const randomDelay = Math.floor(Math.random() * (5000 - 2000 + 1) + 2000);
        await new Promise(r => setTimeout(r, randomDelay));
      }

      await browser.close();
      this.logger.log('🎉 ¡Cinépolis sincronizado exitosamente!');

    } catch (error) {
      this.logger.error('❌ Error en scraper de Cinépolis:', error);
      await browser.close();
    }
  }

  private async processAndSaveMovies(movies: CinepolisMovie[], locConfig: CinepolisLocationConfig) {
    // 1. Guardar Cadena y Sucursal
    const chain = await this.prisma.cinemaChain.upsert({
      where: { name: 'Cinépolis' },
      update: {},
      create: { name: 'Cinépolis' },
    });

    let location = await this.prisma.cinemaLocation.findFirst({
      where: { name: locConfig.name, chainId: chain.id },
    });

    if (!location) {
      location = await this.prisma.cinemaLocation.create({
        data: { 
          name: locConfig.name, 
          address: locConfig.address, // <--- AHORA SÍ: Usamos la dirección real
          lat: locConfig.lat, 
          lng: locConfig.lng,
          chainId: chain.id 
        },
      });
    }

    // 2. Limpiar horarios viejos de HOY
    const hoyString = new Date().toISOString().split('T')[0];
    await this.prisma.showtime.deleteMany({
      where: {
        locationId: location.id,
        dateTime: {
          gte: new Date(`${hoyString}T00:00:00.000Z`),
          lt: new Date(`${hoyString}T23:59:59.999Z`),
        },
      },
    });

    // 3. Procesar Películas
    for (const apiMovie of movies) {
      // LIMPIEZA: Sacamos "| 48FPS", "| 3D", etc.
      let cleanTitle = apiMovie.title_translated.split('|')[0].trim();
      // Sacamos paréntesis molestos
      cleanTitle = cleanTitle.replace(/\(.*?\)/g, '').trim();

      const tmdbInfo = await this.tmdbService.searchMovie(cleanTitle);
      
      if (!tmdbInfo || !tmdbInfo.tmdbId) {
         // Logueamos el original para saber qué falló
         this.logger.warn(`⚠️ TMDB no encontró: "${cleanTitle}" (Original: ${apiMovie.title_translated})`);
         continue;
      }
      // ... (el resto del guardado sigue igual)

      const dbMovie = await this.prisma.movie.upsert({
        where: { tmdbId: tmdbInfo.tmdbId },
        update: { title: tmdbInfo.officialTitle, posterUrl: tmdbInfo.posterUrl },
        create: { tmdbId: tmdbInfo.tmdbId, title: tmdbInfo.officialTitle, posterUrl: tmdbInfo.posterUrl },
      });

      let funcionesGuardadas = 0;

      // 4. Procesar la estructura anidada del JSON
      // showtimes_data -> options -> showtimes
      if (apiMovie.showtimes_data) {
        for (const group of apiMovie.showtimes_data) {
          if (!group.options) continue;

          for (const option of group.options) {
            const formato = option.format || '2D';
            // Cinépolis usa "CAST" y "SUBT". Lo traducimos a nuestro estándar.
            const idioma = option.version === 'SUBT' ? 'SUBTITULADA' : 'CASTELLANO';

            for (const show of option.showtimes) {
              // "starts_at": "2026-02-23 14:50:00" -> Lo convertimos a Date real
              // Reemplazamos espacio por T para que el constructor de Date lo entienda bien en todos los OS
              const isoDate = show.starts_at.replace(' ', 'T'); 
              const showtimeDate = new Date(isoDate);

              await this.prisma.showtime.create({
                data: {
                  movieId: dbMovie.id,
                  locationId: location.id,
                  dateTime: showtimeDate,
                  format: formato,
                  language: idioma,
                  ticketUrl: locConfig.url, // Usamos la URL visual para que el usuario compre
                },
              });
              funcionesGuardadas++;
            }
          }
        }
      }
      this.logger.debug(`🎬 Guardada: ${dbMovie.title} (${funcionesGuardadas} funciones)`);
    }
  }
}