import { PrismaService } from '../prisma/prisma.service';
import { GeoService } from './geo.service';

describe('GeoService Unit Suite (F17)', () => {
  const findManyLocationsSpy = jest.fn();
  let service: GeoService;

  beforeEach(() => {
    jest.clearAllMocks();
    const prismaMock = {
      cinemaLocation: {
        findMany: findManyLocationsSpy,
      },
    } as unknown as PrismaService;

    service = new GeoService(prismaMock);
  });

  it('calculates Haversine distance in km and sorts venues from nearest to farthest', async () => {
    findManyLocationsSpy.mockResolvedValue([
      {
        id: 3,
        name: 'Showcase Córdoba',
        lat: -31.3965,
        lng: -64.2163,
        chain: { id: 3, name: 'Showcase' },
      },
      {
        id: 1,
        name: 'Multiplex Lavalle',
        lat: -34.6022,
        lng: -58.3784,
        chain: { id: 1, name: 'Multiplex' },
      },
      {
        id: 2,
        name: 'Cinemark Palermo',
        lat: -34.5886,
        lng: -58.4113,
        chain: { id: 2, name: 'Cinemark' },
      },
    ]);

    // User at Obelisco, CABA (-34.6037, -58.3816)
    const nearby = await service.getNearbyCinemas(-34.6037, -58.3816);

    expect(nearby.map((c) => c.name)).toEqual([
      'Multiplex Lavalle',
      'Cinemark Palermo',
      'Showcase Córdoba',
    ]);
    expect(nearby[0].distance).toBeLessThan(1);
    expect(nearby[1].distance).toBeGreaterThan(2);
    expect(nearby[2].distance).toBeGreaterThan(600);
  });
});
