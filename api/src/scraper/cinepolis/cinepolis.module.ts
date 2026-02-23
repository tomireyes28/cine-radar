import { Module } from '@nestjs/common';
import { CinepolisService } from './cinepolis.service';
import { CinepolisController } from './cinepolis.controller';
import { PrismaModule } from '../../prisma/prisma.module';
import { TmdbModule } from '../../tmdb/tmdb.module';

@Module({
  imports: [PrismaModule, TmdbModule],
  providers: [CinepolisService],
  controllers: [CinepolisController],
  exports: [CinepolisService]

})
export class CinepolisModule {}
