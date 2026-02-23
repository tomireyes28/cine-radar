import { Module } from '@nestjs/common';
import { CinemarkService } from './cinemark.service';
import { CinemarkController } from './cinemark.controller';
import { PrismaModule } from '../../prisma/prisma.module';
import { TmdbModule } from '../../tmdb/tmdb.module';

@Module({
  imports: [PrismaModule, TmdbModule],
  providers: [CinemarkService],
  controllers: [CinemarkController],
  exports: [CinemarkService],
})
export class CinemarkModule {}
