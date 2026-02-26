import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ScraperController } from './scraper.controller';

// Servicios
import { MultiplexService } from './multiplex/multiplex.service';
import { CinemarkService } from './cinemark/cinemark.service';
import { ShowcaseService } from './showcase/showcase.service';
import { AtlasService } from './atlas/atlas.service';
import { CinepolisService } from './cinepolis/cinepolis.service';
import { CinemaCenterService } from './cinemacenter/cinemacenter.service';

// Módulos externos necesarios
import { PrismaService } from '../prisma/prisma.service';
import { TmdbService } from '../tmdb/tmdb.service';
import { GeoService } from '../movies/geo.service';

@Module({
  imports: [HttpModule],
  controllers: [ScraperController], 
  providers: [
    MultiplexService,
    CinemarkService,
    ShowcaseService,
    AtlasService,
    CinepolisService,
    CinemaCenterService,
    PrismaService,
    TmdbService,
    GeoService
  ],
  exports: [MultiplexService, CinemarkService] 
})
export class ScraperModule {}