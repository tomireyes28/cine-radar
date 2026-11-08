import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../prisma/prisma.module';
import { ScraperCoreModule } from './scraper-core.module';

/**
 * Lightweight DI container dedicated to CLI / GitHub Actions scraping jobs.
 * Excludes HTTP controllers, ScheduleModule, CronModule, MoviesModule, and ThrottlerModule.
 */
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    ScraperCoreModule,
  ],
})
export class ScraperWorkerModule {}
