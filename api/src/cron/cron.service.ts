import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ScraperOrchestratorService } from '../scraper/services/scraper-orchestrator.service';
import { ARGENTINA_TIMEZONE } from '../common/utils/argentina-time.util';

@Injectable()
export class CronService {
  private readonly logger = new Logger(CronService.name);

  constructor(
    private readonly scraperOrchestrator: ScraperOrchestratorService,
  ) {}

  @Cron('0 4 * * *', { timeZone: ARGENTINA_TIMEZONE })
  async handleDailyScraping() {
    if (process.env.DISABLE_INTERNAL_CRON === 'true') {
      this.logger.log(
        'Cron interno deshabilitado (delegado a GitHub Actions).',
      );
      return;
    }

    this.logger.log(
      `Iniciando actualización programada de cartelera (${ARGENTINA_TIMEZONE})...`,
    );
    await this.scraperOrchestrator.runAll();
  }
}
