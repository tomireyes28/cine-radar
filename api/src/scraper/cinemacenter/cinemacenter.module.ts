import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { CinemaCenterService } from './cinemacenter.service';
import { CinemaCenterController } from './cinemacenter.controller';
import { PrismaModule } from '../../prisma/prisma.module';
import { TmdbModule } from '../../tmdb/tmdb.module';

@Module({
  imports: [HttpModule, PrismaModule, TmdbModule],
  controllers: [CinemaCenterController],
  providers: [CinemaCenterService],
  exports: [CinemaCenterService]
})
export class CinemaCenterModule {}