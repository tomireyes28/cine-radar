import { PrismaService } from '../../src/prisma/prisma.service';
import {
  ScrapedChainResult,
  ICinemaScraper,
} from '../../src/scraper/interfaces/scraper.interface';
import { MovieIdentityService } from '../../src/scraper/services/movie-identity.service';
import { ScraperOrchestratorService } from '../../src/scraper/services/scraper-orchestrator.service';
import { AtlasService } from '../../src/scraper/atlas/atlas.service';
import { MultiplexService } from '../../src/scraper/multiplex/multiplex.service';
import { ShowcaseService } from '../../src/scraper/showcase/showcase.service';
import { CinemaCenterService } from '../../src/scraper/cinemacenter/cinemacenter.service';
import { CinemarkService } from '../../src/scraper/cinemark/cinemark.service';
import { CinepolisService } from '../../src/scraper/cinepolis/cinepolis.service';
import { ScraperLockService } from '../../src/scraper/services/scraper-lock.service';

export function client(): PrismaService {
  const value = process.env.INTEGRATION_DATABASE_URL;
  if (!value)
    throw new Error(
      'Use npm run test:integration; no configured application database is allowed.',
    );
  const url = new URL(value);
  if (
    !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) ||
    !/^\/cine_radar_test_[a-f0-9]{32}$/.test(url.pathname)
  ) {
    throw new Error('Refusing non-ephemeral integration database.');
  }
  return new PrismaService({ datasources: { db: { url: value } } });
}

export async function reset(db: PrismaService): Promise<void> {
  await db.scrapeRun.deleteMany();
  await db.scraperLock.deleteMany();
  await db.movie.deleteMany();
  await db.cinemaChain.deleteMany();
}

export function orchestrator(
  db: PrismaService,
  identity: MovieIdentityService,
  strategy: ICinemaScraper,
  lock?: ScraperLockService,
): ScraperOrchestratorService {
  return new ScraperOrchestratorService(
    db,
    identity,
    strategy as AtlasService,
    {} as MultiplexService,
    {} as ShowcaseService,
    {} as CinemaCenterService,
    {} as CinemarkService,
    {} as CinepolisService,
    lock,
  );
}

export function strategy(data: ScrapedChainResult): ICinemaScraper {
  return {
    chainKey: 'atlas',
    chainName: 'Test chain',
    scrape: () => Promise.resolve(data),
  };
}

export function barrier(participants: number): () => Promise<void> {
  let count = 0;
  let release!: () => void;
  const ready = new Promise<void>((resolve) => {
    release = resolve;
  });
  return () => {
    if (++count === participants) release();
    return ready;
  };
}
