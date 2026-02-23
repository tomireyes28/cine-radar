import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { CinemarkService } from '../scraper/cinemark/cinemark.service';
import { MultiplexService } from '../scraper/multiplex/multiplex.service'; // (O como se llame tu servicio dentro de ScraperModule)
import { CinepolisService } from '../scraper/cinepolis/cinepolis.service'; // <--- IMPORTAR

@Injectable()
export class CronService {
  private readonly logger = new Logger(CronService.name);

  constructor(
    private readonly cinemarkService: CinemarkService,
    private readonly multiplexService: MultiplexService, 
    private readonly cinepolisService: CinepolisService 
  ) {}

  @Cron('0 3 * * *', {
    name: 'nightly_scraping',
    timeZone: 'America/Argentina/Buenos_Aires', 
  })
  async handleNightlyScraping() {
    this.logger.log('⏰ [CRON JOB] Iniciando recolección nocturna de carteleras...');
    
    try {
      // 1. Multiplex
      this.logger.log('Iniciando Multiplex...');
      await this.multiplexService.scrapeBillboard(); 

      // 2. Cinemark
      this.logger.log('Iniciando Cinemark...');
      await this.cinemarkService.runScraper();

      // 3. Cinépolis (El Nuevo)
      this.logger.log('Iniciando Cinépolis...');
      await this.cinepolisService.runScraper();  

      this.logger.log('✅ [CRON JOB] Recolección nocturna finalizada con éxito.');
    } catch (error) {
      this.logger.error('❌ [CRON JOB] Ocurrió un error en la recolección nocturna.', error);
    }
  }
}