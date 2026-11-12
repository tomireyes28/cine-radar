import { ServiceUnavailableException } from '@nestjs/common';
import axios from 'axios';
import { selectBestTmdbCandidate, TmdbService } from './tmdb.service';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('TmdbService Candidate Selection & Shared Normalization (F11)', () => {
  const originalApiKey = process.env.TMDB_API_KEY;

  beforeEach(() => {
    process.env.TMDB_API_KEY = 'test-tmdb-key';
  });

  afterEach(() => {
    if (originalApiKey === undefined) {
      delete process.env.TMDB_API_KEY;
    } else {
      process.env.TMDB_API_KEY = originalApiKey;
    }
    jest.clearAllMocks();
  });

  it('prefers active theatrical remake/release over silent-era or decades-old homonyms when no year hint is present', () => {
    const candidates = [
      {
        id: 653,
        title: 'Nosferatu',
        original_title: 'Nosferatu, eine Symphonie des Grauens',
        release_date: '1922-03-04',
        poster_path: '/old.jpg',
        overview: '1922 classic',
      },
      {
        id: 426063,
        title: 'Nosferatu',
        original_title: 'Nosferatu',
        release_date: '2025-01-02',
        poster_path: '/new.jpg',
        overview: 'Robert Eggers remake',
      },
    ];

    const best = selectBestTmdbCandidate(
      candidates,
      'Nosferatu',
      undefined,
      2026,
    );
    expect(best.id).toBe(426063);
  });

  it('honors explicit release year hints for classic re-releases and avoids partial-prefix traps', () => {
    const batmanCandidates = [
      {
        id: 414906,
        title: 'The Batman',
        original_title: 'The Batman',
        release_date: '2022-03-01',
        poster_path: '/2022.jpg',
      },
      {
        id: 268,
        title: 'Batman',
        original_title: 'Batman',
        release_date: '1989-06-23',
        poster_path: '/1989.jpg',
      },
    ];

    const classicMatch = selectBestTmdbCandidate(
      batmanCandidates,
      'Batman',
      1989,
      2026,
    );
    expect(classicMatch.id).toBe(268);

    const goatCandidates = [
      {
        id: 1001,
        title: 'Goat Simulator: The Movie',
        release_date: '2024-05-01',
        poster_path: '/sim.jpg',
      },
      {
        id: 2002,
        title: 'GOAT',
        original_title: 'GOAT',
        release_date: '2026-02-13',
        poster_path: '/goat.jpg',
      },
    ];

    const exactMatch = selectBestTmdbCandidate(
      goatCandidates,
      'GOAT',
      undefined,
      2026,
    );
    expect(exactMatch.id).toBe(2002);
  });

  it('uses shared D-BOX/alias normalization inside lookupMovie before querying TMDB', async () => {
    const service = new TmdbService();
    let capturedQuery: string | undefined;

    mockedAxios.get.mockImplementation(
      (url: string, config?: { params?: { query?: string } }) => {
        if (url.endsWith('/search/movie')) {
          capturedQuery = config?.params?.query;
          return Promise.resolve({
            data: {
              results: [
                {
                  id: 558449,
                  title: 'Gladiador II',
                  release_date: '2024-11-14',
                  poster_path: '/glad2.jpg',
                  vote_average: 7.1,
                },
              ],
            },
          });
        }
        return Promise.resolve({
          data: {
            id: 558449,
            title: 'Gladiador II',
            poster_path: '/glad2.jpg',
            backdrop_path: '/glad2-bg.jpg',
            release_date: '2024-11-14',
            overview: 'Secuela épica.',
            runtime: 148,
            vote_average: 7.1,
            genres: [{ id: 28, name: 'Acción' }],
          },
        });
      },
    );

    const res = await service.lookupMovie('Gladiador II D-BOX');
    expect(res.status).toBe('matched');
    expect(capturedQuery).toBe('Gladiador II');
  });

  it('throws ServiceUnavailableException in getUpcomingMovies on upstream errors or missing key instead of caching [] (F12)', async () => {
    const service = new TmdbService();

    mockedAxios.get.mockRejectedValueOnce(new Error('HTTP 503 TMDB Down'));
    await expect(service.getUpcomingMovies()).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );

    // Genuine HTTP 200 empty results returns [] without throwing
    mockedAxios.get.mockResolvedValueOnce({ data: { results: [] } });
    await expect(service.getUpcomingMovies()).resolves.toEqual([]);

    // Missing API key throws ServiceUnavailableException on fresh instance
    delete process.env.TMDB_API_KEY;
    const unconfigured = new TmdbService();
    await expect(unconfigured.getUpcomingMovies()).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });
});

describe('R03 TMDB ambiguous homonyms', () => {
  const previous = process.env.TMDB_API_KEY;
  afterEach(() => {
    jest.restoreAllMocks();
    if (previous === undefined) delete process.env.TMDB_API_KEY;
    else process.env.TMDB_API_KEY = previous;
  });
  it('does not enrich yearless titles by guessing between exact homonyms', async () => {
    process.env.TMDB_API_KEY = 'test';
    const request = jest.spyOn(axios, 'get').mockResolvedValue({
      data: {
        results: [
          {
            id: 1,
            title: 'Batman',
            release_date: '1989-01-01',
            poster_path: null,
          },
          {
            id: 2,
            title: 'Batman',
            release_date: '2022-01-01',
            poster_path: null,
          },
        ],
      },
    });
    const result = await new TmdbService().lookupMovie('Batman');
    expect(result.status).toBe('not_found');
    expect(request).toHaveBeenCalledTimes(1);
  });
});
