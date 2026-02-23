import { Controller, Get, Param } from '@nestjs/common';
import { TmdbService } from './tmdb.service';

@Controller('tmdb') 
export class TmdbController {
  constructor(private readonly tmdbService: TmdbService) {}

  @Get(':title')
  async getMovie(@Param('title') title: string) {
    const result = await this.tmdbService.searchMovie(title);
    
    if (!result) {
      return { message: 'Película no encontrada' };
    }

    return result;
  }
}