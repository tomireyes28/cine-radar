import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class MoviesService {
  constructor(private prisma: PrismaService) {}

  async getMoviesWithShowtimes() {
    // Buscamos todas las películas que tengan al menos un horario cargado
    return this.prisma.movie.findMany({
      where: {
        showtimes: {
          some: {} // Filtra solo las pelis que están en cartelera
        }
      },
      include: {
        // Incluimos los horarios y la info del cine en la misma respuesta
        showtimes: {
          include: {
            location: {
              include: {
                chain: true
              }
            }
          },
          orderBy: {
            dateTime: 'asc' // Ordenamos los horarios por hora de la función
          }
        }
      }
    });
  }
}