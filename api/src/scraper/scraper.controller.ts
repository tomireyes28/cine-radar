import { Controller, Get, Logger } from '@nestjs/common';
import { MultiplexService } from './multiplex/multiplex.service';
import { CinemarkService } from './cinemark/cinemark.service';
import { ShowcaseService } from './showcase/showcase.service';
import { AtlasService } from './atlas/atlas.service';
import { CinepolisService } from './cinepolis/cinepolis.service';
import { CinemaCenterService } from './cinemacenter/cinemacenter.service';

@Controller('scraper') // La ruta base será /scraper
export class ScraperController {
  private readonly logger = new Logger(ScraperController.name);

  constructor(
    private readonly multiplexService: MultiplexService,
    private readonly cinemarkService: CinemarkService,
    private readonly showcaseService: ShowcaseService,
    private readonly atlasService: AtlasService,
    private readonly cinepolisService: CinepolisService,
    private readonly cinemaCenterService: CinemaCenterService,
  ) {}

  // 👉 URL: http://localhost:3000/scraper/run-all
  // Ejecuta TODOS en serie (ideal para dejar corriendo de noche)
  @Get('run-all')
  async runAll() {
    this.logger.log('🚀 ¡DISPARANDO TODOS LOS SCRAPERS!');
    
    // Ejecutamos en orden de "liviano" a "pesado"
    await this.atlasService.runScraper();      // API JSON (Rápido)
    await this.cinepolisService.runScraper();  // API JSON (Rápido)
    await this.multiplexService.scrapeBillboard(); // Cheerio HTML (Rápido)
    await this.cinemaCenterService.runScraper(); // Cheerio HTML (Rápido)
    
    // Los que abren navegador (Puppeteer) van al final
    await this.showcaseService.runScraper(); 
    await this.cinemarkService.runScraper();

    return '✅ ¡Todos los scrapers finalizaron! Revisá la consola.';
  }

  // --- INDIVIDUALES ---

  // 👉 URL: http://localhost:3000/scraper/multiplex
  @Get('multiplex')
  async runMultiplex() {
    this.logger.log('▶️ Ejecutando Multiplex...');
    await this.multiplexService.scrapeBillboard();
    return '✅ Multiplex Finalizado';
  }

  // 👉 URL: http://localhost:3000/scraper/cinemark
  @Get('cinemark')
  async runCinemark() {
    this.logger.log('▶️ Ejecutando Cinemark...');
    await this.cinemarkService.runScraper();
    return '✅ Cinemark Finalizado';
  }

  // 👉 URL: http://localhost:3000/scraper/showcase
  @Get('showcase')
  async runShowcase() {
    this.logger.log('▶️ Ejecutando Showcase...');
    await this.showcaseService.runScraper();
    return '✅ Showcase Finalizado';
  }

  // 👉 URL: http://localhost:3000/scraper/atlas
  @Get('atlas')
  async runAtlas() {
    this.logger.log('▶️ Ejecutando Atlas...');
    await this.atlasService.runScraper();
    return '✅ Atlas Finalizado';
  }

  // 👉 URL: http://localhost:3000/scraper/cinepolis
  @Get('cinepolis')
  async runCinepolis() {
    this.logger.log('▶️ Ejecutando Cinépolis...');
    await this.cinepolisService.runScraper();
    return '✅ Cinépolis Finalizado';
  }

  // 👉 URL: http://localhost:3000/scraper/cinemacenter
  @Get('cinemacenter')
  async runCinemaCenter() {
    this.logger.log('▶️ Ejecutando Cinema Center...');
    await this.cinemaCenterService.runScraper();
    return '✅ Cinema Center Finalizado';
  }
}