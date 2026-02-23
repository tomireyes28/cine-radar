import { Module } from '@nestjs/common';
import { MultiplexService } from './multiplex/multiplex.service';
import { TmdbModule } from '../tmdb/tmdb.module';
import { ScraperController } from './scraper.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [TmdbModule, PrismaModule], 
  providers: [MultiplexService],
  controllers: [ScraperController]
})
export class ScraperModule {}