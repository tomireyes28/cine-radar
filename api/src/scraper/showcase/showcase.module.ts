import { Module } from '@nestjs/common';
import { ShowcaseService } from './showcase.service';
import { ShowcaseController } from './showcase.controller';
import { PrismaModule } from '../../prisma/prisma.module';
import { TmdbModule } from '../../tmdb/tmdb.module';

@Module({
  imports: [PrismaModule, TmdbModule],
  providers: [ShowcaseService],
  controllers: [ShowcaseController],
  exports: [ShowcaseService]
})
export class ShowcaseModule {}
