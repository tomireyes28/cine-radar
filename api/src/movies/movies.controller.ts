import { Controller, Get } from '@nestjs/common';
import { MoviesService } from './movies.service';

@Controller('movies') // Esta es la URL base
export class MoviesController {
  constructor(private readonly moviesService: MoviesService) {}

  @Get() // Responde a peticiones GET en localhost:3000/movies
  async getAllMovies() {
    return this.moviesService.getMoviesWithShowtimes();
  }
}