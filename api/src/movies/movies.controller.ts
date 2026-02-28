import { Controller, Get, Param, Query } from '@nestjs/common';
import { MoviesService } from './movies.service';
import { GetMoviesDto } from './dto/get-movie.dto';
import { GeoService } from './geo.service';
import { NearbyCinemasDto } from './dto/nearby-cinemas.dto';

@Controller('movies')
export class MoviesController {
  constructor(private readonly moviesService: MoviesService, private readonly geoService: GeoService) {}

  @Get('now-playing')
  async getNowPlaying(@Query() filters: GetMoviesDto) {
    return this.moviesService.getNowPlaying(filters);
  }

  @Get('filters')
  async getFilters() {
    return this.moviesService.getFiltersData();
  }

  @Get('admin/geoseed')
  async seedCoordinates() {
    return this.geoService.updateCinemasCoordinates();
  }

  @Get('nearby')
async getNearby(@Query() query: NearbyCinemasDto) {
   console.log(query); // Verificar que lat y lng llegan correctamente
  return this.geoService.getNearbyCinemas(query.lat, query.lng);
}

@Get('upcoming')
  async getUpcoming() {
    return this.moviesService.getUpcomingMovies();
  }

  @Get(':id')
  async getMovieDetail(
    @Param('id') id: string,
    @Query() filters: GetMoviesDto 
  ) {
    const movieId = parseInt(id, 10);
    return this.moviesService.getMovieDetail(movieId, filters);
  }

  

  


}