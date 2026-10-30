import {
  Controller,
  Get,
  NotFoundException,
  Param,
  ParseIntPipe,
  Query,
} from '@nestjs/common';
import { MoviesService } from './movies.service';
import { GetMoviesDto } from './dto/get-movie.dto';
import { GeoService } from './geo.service';
import { NearbyCinemasDto } from './dto/nearby-cinemas.dto';

@Controller('movies')
export class MoviesController {
  constructor(
    private readonly moviesService: MoviesService,
    private readonly geoService: GeoService,
  ) {}

  @Get('now-playing')
  async getNowPlaying(@Query() filters: GetMoviesDto) {
    return this.moviesService.getNowPlaying(filters);
  }

  @Get('filters')
  async getFilters() {
    return this.moviesService.getFiltersData();
  }

  @Get('nearby')
  async getNearby(@Query() query: NearbyCinemasDto) {
    return this.geoService.getNearbyCinemas(query.lat, query.lng);
  }

  @Get('upcoming')
  async getUpcoming() {
    return this.moviesService.getUpcomingMovies();
  }

  @Get(':id')
  async getMovieDetail(
    @Param('id', ParseIntPipe) id: number,
    @Query() filters: GetMoviesDto,
  ) {
    const movie = await this.moviesService.getMovieDetail(id, filters);
    if (!movie) {
      throw new NotFoundException(`Movie with ID ${id} not found`);
    }
    return movie;
  }
}
