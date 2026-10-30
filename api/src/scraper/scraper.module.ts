import { Module } from '@nestjs/common';
import { ScraperController } from './scraper.controller';
import { MultiplexService } from './multiplex/multiplex.service';
import { CinemarkService } from './cinemark/cinemark.service';
import { ShowcaseService } from './showcase/showcase.service';
import { AtlasService } from './atlas/atlas.service';
import { CinepolisService } from './cinepolis/cinepolis.service';
import { CinemaCenterService } from './cinemacenter/cinemacenter.service';
import { TitleNormalizerService } from './services/title-normalizer.service';
import { ScraperOrchestratorService } from './services/scraper-orchestrator.service';
import { TmdbModule } from '../tmdb/tmdb.module';

@Module({
  imports: [TmdbModule],
  controllers: [ScraperController],
  providers: [
    TitleNormalizerService,
    MultiplexService,
    CinemarkService,
    ShowcaseService,
    AtlasService,
    CinepolisService,
    CinemaCenterService,
    ScraperOrchestratorService,
  ],
  exports: [ScraperOrchestratorService],
})
export class ScraperModule {}
