import { Module } from '@nestjs/common';
import { MultiplexService } from './multiplex/multiplex.service';
import { TmdbModule } from '../tmdb/tmdb.module';
import { ScraperController } from './scraper.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { CinemarkModule } from './cinemark/cinemark.module';
import { CinepolisModule } from './cinepolis/cinepolis.module';
import { ShowcaseModule } from './showcase/showcase.module';

@Module({
  imports: [TmdbModule, PrismaModule, CinemarkModule, CinepolisModule, ShowcaseModule], 
  providers: [MultiplexService],
  controllers: [ScraperController],
  exports: [MultiplexService],
})
export class ScraperModule {}