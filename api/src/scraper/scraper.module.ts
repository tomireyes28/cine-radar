import { Module } from '@nestjs/common';
import { ScraperCoreModule } from './scraper-core.module';
import { ScraperController } from './scraper.controller';

@Module({
  imports: [ScraperCoreModule],
  controllers: [ScraperController],
  exports: [ScraperCoreModule],
})
export class ScraperModule {}
