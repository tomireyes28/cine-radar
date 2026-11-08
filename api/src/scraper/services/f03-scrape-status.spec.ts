import axios from 'axios';
import { AtlasService } from '../atlas/atlas.service';
import { CinemarkService } from '../cinemark/cinemark.service';
import { CinemaCenterService } from '../cinemacenter/cinemacenter.service';
import { CinepolisService } from '../cinepolis/cinepolis.service';
import { MultiplexService } from '../multiplex/multiplex.service';
import { ShowcaseService } from '../showcase/showcase.service';
import { PrismaService } from '../../prisma/prisma.service';
import { MovieIdentityService } from './movie-identity.service';
import { ScraperOrchestratorService } from './scraper-orchestrator.service';
import { TitleNormalizerService } from './title-normalizer.service';
import {
  resolveFullRunExitCode,
  resolveSingleChainExitCode,
} from '../../cli/cli-args.util';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('Scraper Status Reporting & CLI Exit Codes (F03)', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('marks runAll as failed (not empty chains: []) and exits 1 when all 6 strategies fail', async () => {
    const failingStrategy = (key: string, name: string) => ({
      chainKey: key,
      chainName: name,
      scrape: jest
        .fn()
        .mockRejectedValue(new Error(`${name} provider unreachable`)),
    });

    const prismaMock = {
      showtime: {
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
    } as unknown as PrismaService;

    const orchestrator = new ScraperOrchestratorService(
      prismaMock,
      {} as unknown as MovieIdentityService,
      failingStrategy('atlas', 'Atlas Cines') as unknown as AtlasService,
      failingStrategy('multiplex', 'Multiplex') as unknown as MultiplexService,
      failingStrategy('showcase', 'Showcase') as unknown as ShowcaseService,
      failingStrategy(
        'cinemacenter',
        'Cinema Center',
      ) as unknown as CinemaCenterService,
      failingStrategy('cinemark', 'Cinemark') as unknown as CinemarkService,
      failingStrategy('cinepolis', 'Cinépolis') as unknown as CinepolisService,
    );

    const summary = await orchestrator.runAll();

    expect(summary.status).toBe('failed');
    expect(summary.chains).toHaveLength(6);
    expect(summary.failedChains).toEqual([
      'atlas',
      'multiplex',
      'showcase',
      'cinemark',
      'cinemacenter',
      'cinepolis',
    ]);
    expect(summary.chains.every((c) => c.status === 'failed')).toBe(true);
    expect(resolveFullRunExitCode(summary)).toBe(1);
  });

  it('detects provider outage and response schema changes in AtlasService with verifiable failed status', async () => {
    const atlas = new AtlasService(new TitleNormalizerService());

    // Simulate HTTP 200 with changed JSON schema (non-empty array missing expected fields)
    mockedAxios.get.mockResolvedValue({
      data: [{ unexpectedField: 123 }],
    });

    const schemaChangedResult = await atlas.scrape();
    expect(schemaChangedResult.status).toBe('failed');
    expect(schemaChangedResult.locations).toHaveLength(
      schemaChangedResult.expectedLocations,
    );
    expect(
      schemaChangedResult.locations.every((l) => l.status === 'failed'),
    ).toBe(true);
    expect(schemaChangedResult.errors.length).toBeGreaterThan(0);

    // Simulate legitimate HTTP 200 empty array [] -> empty_verified (not failed)
    mockedAxios.get.mockResolvedValue({
      data: [],
    });

    const emptyVerifiedResult = await atlas.scrape();
    expect(emptyVerifiedResult.status).toBe('empty_verified');
    expect(
      emptyVerifiedResult.locations.every((l) => l.status === 'empty_verified'),
    ).toBe(true);

    const prismaMock = {
      cinemaChain: {
        upsert: jest.fn().mockResolvedValue({ id: 1, name: 'Atlas Cines' }),
      },
      cinemaLocation: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      showtime: {
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
    } as unknown as PrismaService;

    mockedAxios.get.mockRejectedValue(new Error('connect ETIMEDOUT'));
    const orchestrator = new ScraperOrchestratorService(
      prismaMock,
      {} as unknown as MovieIdentityService,
      atlas,
      {} as unknown as MultiplexService,
      {} as unknown as ShowcaseService,
      {} as unknown as CinemaCenterService,
      {} as unknown as CinemarkService,
      {} as unknown as CinepolisService,
    );

    const chainSummary = await orchestrator.runByChainKey('atlas');
    expect(chainSummary.status).toBe('failed');
    expect(resolveSingleChainExitCode(chainSummary)).toBe(1);
  });
});
