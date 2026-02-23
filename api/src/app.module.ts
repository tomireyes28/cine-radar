import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { TmdbModule } from './tmdb/tmdb.module';
import { ConfigModule } from '@nestjs/config';
import { ScraperModule } from './scraper/scraper.module';
import { PrismaModule } from './prisma/prisma.module';
import { ScheduleModule } from '@nestjs/schedule';
import { MoviesModule } from './movies/movies.module';

@Module({
  imports: [ScheduleModule.forRoot(), ConfigModule.forRoot(), TmdbModule, ScraperModule, PrismaModule, MoviesModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
