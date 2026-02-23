import { Module } from '@nestjs/common';
import { CronService } from './cron.service';
import { CinemarkModule } from '../scraper/cinemark/cinemark.module';
import { ScraperModule } from '../scraper/scraper.module';

@Module({
  imports: [CinemarkModule, ScraperModule], 
  providers: [CronService]
})
export class CronModule {}