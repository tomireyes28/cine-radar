import { Controller, Get, Param, Query } from '@nestjs/common';
import { MoviesService } from './movies.service';
import { GetMoviesDto } from './dto/get-movie.dto';
import { GeoService } from './geo.service';
// Borramos el import de MovieFilters porque el DTO ya hace el trabajo

@Controller('movies')
export class MoviesController {
  constructor(private readonly moviesService: MoviesService, private readonly geoService: GeoService) {}

  @Get('now-playing')
  async getNowPlaying(@Query() filters: GetMoviesDto) {
    // NestJS valida 'filters' contra el DTO y se lo pasa al servicio
    return this.moviesService.getNowPlaying(filters);
  }

  @Get('filters')
  async getFilters() {
    return this.moviesService.getFiltersData();
  }

  @Get(':id')
  async getMovieDetail(
    @Param('id') id: string,
    @Query() filters: GetMoviesDto 
  ) {
    const movieId = parseInt(id, 10);
    return this.moviesService.getMovieDetail(movieId, filters);
  }

  @Get('admin/geoseed')
  async seedCoordinates() {
    return this.geoService.updateCinemasCoordinates();
  }
}