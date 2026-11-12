import { ScraperOrchestratorService } from './scraper-orchestrator.service';
import { MovieIdentityService } from './movie-identity.service';
import { PrismaService } from '../../prisma/prisma.service';
import { MultiplexService } from '../multiplex/multiplex.service';
import { ShowcaseService } from '../showcase/showcase.service';
import { CinemaCenterService } from '../cinemacenter/cinemacenter.service';
import { CinepolisService } from '../cinepolis/cinepolis.service';
import axios from 'axios';
import { AtlasService } from '../atlas/atlas.service';
import { CinemarkService } from '../cinemark/cinemark.service';
import { TitleNormalizerService } from './title-normalizer.service';
import {
  ATLAS_CABALLITO_FIXTURE,
  CINEMARK_THEATERS_BFF_FIXTURE,
  CINEMARK_SHOWTIMES_PALERMO_FIXTURE,
} from '../__fixtures__/provider-payloads';

afterEach(() => jest.restoreAllMocks());
describe('R03 adapters retain movie identity before normalization', () => {
  it('does not group Atlas homonyms together when release years differ', async () => {
    const rows = [1989, 2022].map((year) => ({
      ...ATLAS_CABALLITO_FIXTURE[0],
      cachePeliculas: { titulo: `Batman (${year}) 2D SUB` },
    }));
    jest.spyOn(axios, 'get').mockResolvedValue({ data: rows });
    const result = await new AtlasService(
      new TitleNormalizerService(),
    ).scrape();
    const movies = result.locations[0].movies;
    expect(movies).toHaveLength(2);
    expect(movies.map((movie) => movie.originalTitle)).toEqual([
      'Batman (1989) 2D SUB',
      'Batman (2022) 2D SUB',
    ]);
  });
  it('uses Cinemark movie IDs to distinguish identical titles while grouping formats of the same film', async () => {
    const session = CINEMARK_SHOWTIMES_PALERMO_FIXTURE.data[0];
    jest.spyOn(axios, 'get').mockImplementation((url: string) =>
      Promise.resolve({
        data: url.endsWith('/theaters')
          ? CINEMARK_THEATERS_BFF_FIXTURE
          : {
              data: [
                { ...session, movieId: 'classic', movieName: 'Batman (1989)' },
                { ...session, movieId: 'remake', movieName: 'Batman (2022)' },
                {
                  ...session,
                  movieId: 'classic',
                  movieName: 'Batman (1989) 3D',
                  sessionFormat: '3D',
                },
              ],
            },
      }),
    );
    const result = await new CinemarkService(
      new TitleNormalizerService(),
    ).scrape();
    const movies =
      result.locations.find((location) => location.movies.length)?.movies ?? [];
    expect(movies).toHaveLength(2);
    expect(
      movies.find((movie) => movie.sourceMovieId === 'classic')?.showtimes,
    ).toHaveLength(2);
    expect(
      movies.find((movie) => movie.sourceMovieId === 'remake')?.originalTitle,
    ).toBe('Batman (2022)');
  });
});

it('passes the original provider title and year through orchestration into the resolver', async () => {
  jest
    .spyOn(axios, 'get')
    .mockResolvedValue({
      data: [
        {
          ...ATLAS_CABALLITO_FIXTURE[0],
          cachePeliculas: { titulo: 'Batman (1989) 2D SUB' },
        },
      ],
    });
  const resolve = jest.fn().mockResolvedValue(1);
  const tx = {
    showtime: { createMany: jest.fn().mockResolvedValue({ count: 1 }) },
  };
  const prisma = {
    cinemaChain: { upsert: jest.fn().mockResolvedValue({ id: 1 }) },
    cinemaLocation: {
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockResolvedValue({ id: 1 }),
    },
    $transaction: jest.fn((cb: (client: typeof tx) => Promise<unknown>) =>
      cb(tx),
    ),
  };
  const orchestrator = new ScraperOrchestratorService(
    prisma as unknown as PrismaService,
    { resolveAndUpsertMovie: resolve } as unknown as MovieIdentityService,
    new AtlasService(new TitleNormalizerService()),
    {} as MultiplexService,
    {} as ShowcaseService,
    {} as CinemaCenterService,
    {} as CinemarkService,
    {} as CinepolisService,
  );
  await orchestrator.runByChainKey('atlas');
  expect(resolve).toHaveBeenCalledWith(
    'Batman',
    expect.any(Map),
    expect.objectContaining({
      provider: 'atlas',
      originalTitle: 'Batman (1989) 2D SUB',
    }),
  );
});
