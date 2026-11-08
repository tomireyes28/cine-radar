import { Module } from '@nestjs/common';
import { TmdbModule } from '../tmdb/tmdb.module';
import { AtlasService } from './atlas/atlas.service';
import { CinemaCenterService } from './cinemacenter/cinemacenter.service';
import { CinemarkService } from './cinemark/cinemark.service';
import { CinepolisService } from './cinepolis/cinepolis.service';
import { MultiplexService } from './multiplex/multiplex.service';
import { ShowcaseService } from './showcase/showcase.service';
import { MovieIdentityService } from './services/movie-identity.service';
import { ScraperLockService } from './services/scraper-lock.service';
import { ScraperOrchestratorService } from './services/scraper-orchestrator.service';
import { TitleNormalizerService } from './services/title-normalizer.service';

@Module({
  imports: [TmdbModule],
  providers: [
    TitleNormalizerService,
    MovieIdentityService,
    ScraperLockService,
    MultiplexService,
    CinemarkService,
    ShowcaseService,
    AtlasService,
    CinepolisService,
    CinemaCenterService,
    ScraperOrchestratorService,
  ],
  exports: [ScraperOrchestratorService, ScraperLockService],
})
export class ScraperCoreModule {}
