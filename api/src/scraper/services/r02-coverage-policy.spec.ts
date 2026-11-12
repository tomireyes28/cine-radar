import { enforceVerifiedCoverage } from './coverage-policy.util';
import {
  ScrapedChainResult,
  ScrapedLocationResult,
} from '../interfaces/scraper.interface';
import { PrismaService } from '../../prisma/prisma.service';
import { MovieIdentityService } from './movie-identity.service';
import { ScraperOrchestratorService } from './scraper-orchestrator.service';
import { AtlasService } from '../atlas/atlas.service';
import { MultiplexService } from '../multiplex/multiplex.service';
import { ShowcaseService } from '../showcase/showcase.service';
import { CinemaCenterService } from '../cinemacenter/cinemacenter.service';
import { CinemarkService } from '../cinemark/cinemark.service';
import { CinepolisService } from '../cinepolis/cinepolis.service';

const start = new Date('2026-11-12T00:00:00-03:00');
const end = new Date('2026-11-12T23:59:59.999-03:00');
function result(location: Partial<ScrapedLocationResult>): ScrapedChainResult {
  return {
    chainName: 'Atlas',
    status: 'complete',
    expectedLocations: 1,
    errors: [],
    locations: [
      {
        locationName: 'Sede',
        status: 'empty_verified',
        movies: [],
        ...location,
      },
    ],
  };
}
function setup(data: ScrapedChainResult) {
  const deleteMany = jest.fn().mockResolvedValue({ count: 1 });
  const createMany = jest.fn().mockResolvedValue({ count: 1 });
  const tx = { showtime: { deleteMany, createMany } };
  const prisma = {
    cinemaChain: { upsert: jest.fn().mockResolvedValue({ id: 1 }) },
    cinemaLocation: {
      findMany: jest.fn().mockResolvedValue([{ id: 1, name: 'Sede' }]),
    },
    $transaction: jest.fn((callback: (client: typeof tx) => Promise<unknown>) =>
      callback(tx),
    ),
  };
  const strategy = {
    chainKey: 'atlas',
    scrape: jest.fn().mockResolvedValue(data),
  };
  const orchestrator = new ScraperOrchestratorService(
    prisma as unknown as PrismaService,
    {
      resolveAndUpsertMovie: jest.fn().mockResolvedValue(1),
    } as unknown as MovieIdentityService,
    strategy as unknown as AtlasService,
    {} as MultiplexService,
    {} as ShowcaseService,
    {} as CinemaCenterService,
    {} as CinemarkService,
    {} as CinepolisService,
  );
  return { orchestrator, deleteMany, createMany };
}
describe('R02 verified deletion coverage', () => {
  it.each([
    {},
    { coveredFrom: start },
    { coveredUntil: end },
    { coveredFrom: end, coveredUntil: start },
    { coveredFrom: new Date('invalid'), coveredUntil: end },
  ])(
    'never deletes an empty snapshot with invalid/missing bounds %j',
    async (bounds) => {
      const { orchestrator, deleteMany } = setup(result(bounds));
      const summary = await orchestrator.runByChainKey('atlas');
      expect(summary.status).toBe('partial');
      expect(summary.errors.length).toBeGreaterThan(0);
      expect(deleteMany).not.toHaveBeenCalled();
    },
  );
  it('passes both explicit bounds to empty deletion, protecting tomorrow', async () => {
    const { orchestrator, deleteMany } = setup(
      result({ coveredFrom: start, coveredUntil: end }),
    );
    expect((await orchestrator.runByChainKey('atlas')).status).toBe(
      'empty_verified',
    );
    expect(deleteMany).toHaveBeenCalledWith({
      where: { locationId: 1, dateTime: { gte: start, lte: end } },
    });
  });
  it('treats a complete snapshot with unknown horizon as additive partial data', async () => {
    const { orchestrator, deleteMany, createMany } = setup(
      result({
        status: 'complete',
        movies: [
          {
            rawTitle: 'Film',
            showtimes: [
              {
                dateTime: new Date('2026-12-01T18:00:00-03:00'),
                format: '2D',
                language: 'SUB',
                ticketUrl: 'https://example.com',
              },
            ],
          },
        ],
      }),
    );
    expect((await orchestrator.runByChainKey('atlas')).status).toBe('partial');
    expect(deleteMany).not.toHaveBeenCalled();
    expect(createMany).toHaveBeenCalled();
  });
  it('does not authorize replacement when rows fall outside declared coverage', () => {
    const data = result({
      status: 'complete',
      coveredFrom: start,
      coveredUntil: end,
      movies: [
        {
          rawTitle: 'Film',
          showtimes: [
            {
              dateTime: new Date('2026-11-13T18:00:00-03:00'),
              format: '2D',
              language: 'SUB',
              ticketUrl: 'https://example.com',
            },
          ],
        },
      ],
    });
    expect(enforceVerifiedCoverage(data).locations[0].status).toBe('partial');
  });
});
