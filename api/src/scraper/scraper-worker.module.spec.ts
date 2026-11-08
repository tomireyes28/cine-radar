import { Test } from '@nestjs/testing';
import { AppController } from '../app.controller';
import { CronService } from '../cron/cron.service';
import { MoviesController } from '../movies/movies.controller';
import { PrismaService } from '../prisma/prisma.service';
import { ScraperController } from './scraper.controller';
import { ScraperWorkerModule } from './scraper-worker.module';
import { ScraperLockService } from './services/scraper-lock.service';
import { ScraperOrchestratorService } from './services/scraper-orchestrator.service';

describe('ScraperWorkerModule Isolated Bootstrap (F14 + M4)', () => {
  it('boots ScraperOrchestratorService without instantiating HTTP controllers or CronService', async () => {
    const prismaMock = {
      $connect: jest.fn().mockResolvedValue(undefined),
      $disconnect: jest.fn().mockResolvedValue(undefined),
    };

    const moduleRef = await Test.createTestingModule({
      imports: [ScraperWorkerModule],
    })
      .overrideProvider(PrismaService)
      .useValue(prismaMock)
      .compile();

    try {
      expect(moduleRef.get(ScraperOrchestratorService)).toBeDefined();
      expect(moduleRef.get(ScraperLockService)).toBeDefined();

      expect(() => moduleRef.get(AppController)).toThrow();
      expect(() => moduleRef.get(MoviesController)).toThrow();
      expect(() => moduleRef.get(ScraperController)).toThrow();
      expect(() => moduleRef.get(CronService)).toThrow();
    } finally {
      await moduleRef.close();
    }
  });
});
