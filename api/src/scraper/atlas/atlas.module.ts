import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { AtlasService } from './atlas.service';
import { AtlasController } from './atlas.controller';
import { PrismaModule } from '../../prisma/prisma.module';
import { TmdbModule } from '../../tmdb/tmdb.module';

@Module({
  imports: [
    HttpModule, 
    PrismaModule, 
    TmdbModule
  ],
  controllers: [AtlasController],
  providers: [AtlasService],
  exports: [AtlasService]
})
export class AtlasModule {}