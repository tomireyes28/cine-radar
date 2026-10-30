import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ScraperOrchestratorService } from '../scraper/services/scraper-orchestrator.service';

@Injectable()
export class CronService {
  private readonly logger = new Logger(CronService.name);

  constructor(
    private readonly scraperOrchestrator: ScraperOrchestratorService,
  ) {}

  @Cron('0 4 * * *')
  async handleDailyScraping() {
    if (process.env.DISABLE_INTERNAL_CRON === 'true') {
      this.logger.log(
        'Cron interno deshabilitado (delegado a GitHub Actions).',
      );
      return;
    }

    this.logger.log('Iniciando actualización programada de cartelera...');
    await this.scraperOrchestrator.runAll();
  }
}
