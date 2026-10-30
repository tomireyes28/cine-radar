import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class GeoService {
  constructor(private readonly prisma: PrismaService) {}

  private getDistanceFromLatLonInKm(
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number,
  ): number {
    const earthRadiusKm = 6371;
    const dLat = this.deg2rad(lat2 - lat1);
    const dLon = this.deg2rad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.deg2rad(lat1)) *
        Math.cos(this.deg2rad(lat2)) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distance = earthRadiusKm * c;
    return parseFloat(distance.toFixed(1));
  }

  private deg2rad(deg: number): number {
    return deg * (Math.PI / 180);
  }

  async getNearbyCinemas(userLat: number, userLng: number) {
    const cinemas = await this.prisma.cinemaLocation.findMany({
      where: {
        lat: { not: 0 },
      },
      include: {
        chain: true,
      },
    });

    const cinemasWithDistance = cinemas.map((cinema) => {
      const distance = this.getDistanceFromLatLonInKm(
        userLat,
        userLng,
        cinema.lat,
        cinema.lng,
      );
      return { ...cinema, distance };
    });

    cinemasWithDistance.sort((a, b) => a.distance - b.distance);

    return cinemasWithDistance;
  }
}
