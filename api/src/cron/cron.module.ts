import { Module } from '@nestjs/common';
import { CronService } from './cron.service';
import { ScraperModule } from '../scraper/scraper.module';

@Module({
  imports: [ScraperModule],
  providers: [CronService],
})
export class CronModule {}
