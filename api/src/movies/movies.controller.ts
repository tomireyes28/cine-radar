import {
  Controller,
  Get,
  NotFoundException,
  Param,
  ParseIntPipe,
  Query,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
} from '@nestjs/swagger';
import { MoviesService } from './movies.service';
import { GetMoviesDto } from './dto/get-movie.dto';
import { GeoService } from './geo.service';
import { NearbyCinemasDto } from './dto/nearby-cinemas.dto';

@ApiTags('movies')
@Controller('movies')
export class MoviesController {
  constructor(
    private readonly moviesService: MoviesService,
    private readonly geoService: GeoService,
  ) {}

  @Get('now-playing')
  @ApiOperation({
    summary: 'Listar cartelera actual con disponibilidad agrupada',
    description:
      'Retorna las películas en cartelera para la fecha dada (o hoy en Argentina), ordenadas por cantidad de cines donde se proyecta.',
  })
  @ApiResponse({ status: 200, description: 'Lista de películas en cartelera con metadata enriquecida' })
  async getNowPlaying(@Query() filters: GetMoviesDto) {
    return this.moviesService.getNowPlaying(filters);
  }

  @Get('filters')
  @ApiOperation({
    summary: 'Obtener catálogo de cadenas y cines para filtros',
    description: 'Devuelve todas las cadenas de cine con sus sucursales y zonas.',
  })
  @ApiResponse({ status: 200, description: 'Cadenas y cines registrados' })
  async getFilters() {
    return this.moviesService.getFiltersData();
  }

  @Get('nearby')
  @ApiOperation({
    summary: 'Buscar cines cercanos por coordenadas GPS',
    description: 'Calcula la distancia en kilómetros usando la fórmula de Haversine y retorna los cines ordenados de menor a mayor distancia.',
  })
  @ApiResponse({ status: 200, description: 'Cines ordenados por distancia en km' })
  async getNearby(@Query() query: NearbyCinemasDto) {
    return this.geoService.getNearbyCinemas(query.lat, query.lng);
  }

  @Get('upcoming')
  @ApiOperation({
    summary: 'Listar próximos estrenos y reestrenos',
    description: 'Obtiene los estrenos futuros desde TMDB ordenados por fecha de estreno.',
  })
  @ApiResponse({ status: 200, description: 'Próximas películas a estrenarse' })
  async getUpcoming() {
    return this.moviesService.getUpcomingMovies();
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Obtener detalle de película con funciones agrupadas por complejo',
  })
  @ApiParam({ name: 'id', description: 'ID numérico de la película en la base de datos' })
  @ApiResponse({ status: 200, description: 'Detalle de película y cines con sus funciones' })
  @ApiResponse({ status: 404, description: 'Película no encontrada' })
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
