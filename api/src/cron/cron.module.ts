import { Module } from '@nestjs/common';
import { CronService } from './cron.service';
import { CinemarkModule } from '../scraper/cinemark/cinemark.module';
import { ScraperModule } from '../scraper/scraper.module';
import { ShowcaseModule } from '../scraper/showcase/showcase.module';
import { CinepolisModule } from '../scraper/cinepolis/cinepolis.module';
import { CinemaCenterModule } from '../scraper/cinemacenter/cinemacenter.module';
import { AtlasModule } from '../scraper/atlas/atlas.module';

@Module({
  imports: [CinemarkModule, ScraperModule, CinepolisModule, ShowcaseModule,AtlasModule , CinemaCenterModule], 
  providers: [CronService]
})
export class CronModule {}