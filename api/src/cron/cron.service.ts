import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { CinemarkService } from '../scraper/cinemark/cinemark.service';
import { MultiplexService } from '../scraper/multiplex/multiplex.service';

@Injectable()
export class CronService {
  private readonly logger = new Logger(CronService.name);

  constructor(
    private readonly cinemarkService: CinemarkService,
    private readonly multiplexService: MultiplexService,
  ) {}

  @Cron('0 3 * * *', {
    name: 'nightly_scraping',
    timeZone: 'America/Argentina/Buenos_Aires', 
  })
  async handleNightlyScraping() {
    this.logger.log('⏰ [CRON JOB] Iniciando recolección nocturna de carteleras...');
    
    try {
      this.logger.log('Iniciando Multiplex...');
      await this.multiplexService.scrapeBillboard(); 

      this.logger.log('Iniciando Cinemark...');
      await this.cinemarkService.runScraper();

      this.logger.log('✅ [CRON JOB] Recolección nocturna finalizada con éxito.');
    } catch (error) {
      this.logger.error('❌ [CRON JOB] Ocurrió un error en la recolección nocturna.', error);
    }
  }
}