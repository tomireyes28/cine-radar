import { Module } from '@nestjs/common';
import { MoviesService } from './movies.service';
import { MoviesController } from './movies.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { GeoService } from './geo.service';
import { TmdbModule } from '../tmdb/tmdb.module';

@Module({
  imports: [PrismaModule, TmdbModule], 
  providers: [MoviesService, GeoService],
  controllers: [MoviesController]
})
export class MoviesModule {}
