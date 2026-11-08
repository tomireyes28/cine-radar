import type { Browser, HTTPRequest, Page } from 'puppeteer';
import { TitleNormalizerService } from '../services/title-normalizer.service';
import {
  CinepolisEvaluateParams,
  CinepolisService,
  evaluateCinepolisBillboard,
} from './cinepolis.service';

class TestableCinepolisService extends CinepolisService {
  constructor(
    normalizer: TitleNormalizerService,
    private readonly browserFactory: () => Promise<Browser>,
  ) {
    super(normalizer);
  }

  exposeLaunchArgs(): string[] {
    return this.buildLaunchArgs();
  }

  protected override launchBrowser(): Promise<Browser> {
    return this.browserFactory();
  }
}

describe('CinepolisService Resilience, Timeouts & Resource Blocking (F16)', () => {
  const originalFetch = global.fetch;
  const originalApiKey = process.env.CINEPOLIS_PUBLIC_API_KEY;
  const originalDisableSandbox = process.env.PUPPETEER_DISABLE_SANDBOX;

  afterEach(() => {
    global.fetch = originalFetch;

    if (originalApiKey === undefined) {
      delete process.env.CINEPOLIS_PUBLIC_API_KEY;
    } else {
      process.env.CINEPOLIS_PUBLIC_API_KEY = originalApiKey;
    }

    if (originalDisableSandbox === undefined) {
      delete process.env.PUPPETEER_DISABLE_SANDBOX;
    } else {
      process.env.PUPPETEER_DISABLE_SANDBOX = originalDisableSandbox;
    }

    jest.clearAllMocks();
  });

  describe('evaluateCinepolisBillboard (browser GraphQL client)', () => {
    const baseParams: CinepolisEvaluateParams = {
      cinemasCsv: 'cinepolis-recoleta-buenos-aires',
      apiKey: 'test-api-key',
      requestTimeoutMs: 50,
    };

    it('throws on non-OK HTTP responses (403/500) instead of returning empty schedules', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 403,
      });

      await expect(evaluateCinepolisBillboard(baseParams)).rejects.toThrow(
        'GraphQL Movies HTTP 403',
      );
    });

    it('throws when HTTP 200 contains GraphQL errors array so rotated keys never masquerade as empty_verified', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            errors: [{ message: 'Invalid x-apikey header' }],
          }),
      });

      await expect(evaluateCinepolisBillboard(baseParams)).rejects.toThrow(
        'GraphQL Movies errors: Invalid x-apikey header',
      );
    });

    it('aborts hanging GraphQL requests via AbortController timeout', async () => {
      global.fetch = jest.fn(
        (_url: RequestInfo | URL, init?: RequestInit) =>
          new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener('abort', () => {
              const abortErr = new Error('The operation was aborted');
              abortErr.name = 'AbortError';
              reject(abortErr);
            });
          }),
      );

      await expect(
        evaluateCinepolisBillboard({ ...baseParams, requestTimeoutMs: 25 }),
      ).rejects.toThrow('GraphQL Movies timeout (25ms)');
    });

    it('records failedMovies when individual Billboard queries fail while keeping healthy movies', async () => {
      global.fetch = jest.fn(
        (_url: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
          const rawBody = typeof init?.body === 'string' ? init.body : '{}';
          const parsed = JSON.parse(rawBody) as {
            operationName: string;
            variables: { movieId?: string };
          };

          if (parsed.operationName === 'Movies') {
            return Promise.resolve({
              ok: true,
              status: 200,
              json: () =>
                Promise.resolve({
                  data: {
                    movies: {
                      edges: [
                        { node: { id: 'm1', name: 'Duna Parte 2' } },
                        { node: { id: 'm2', name: 'Gladiador 2' } },
                      ],
                    },
                  },
                }),
            } as unknown as Response);
          }

          if (parsed.variables.movieId === 'm1') {
            return Promise.resolve({
              ok: false,
              status: 502,
            } as unknown as Response);
          }

          return Promise.resolve({
            ok: true,
            status: 200,
            json: () =>
              Promise.resolve({
                data: {
                  billboard: {
                    schedules: [
                      {
                        cinemaId: 'cinepolis-recoleta-buenos-aires',
                        movieId: 'm2',
                        dates: [
                          {
                            date: '2026-11-08',
                            languages: [
                              {
                                language: 'SUB',
                                displayLanguage: 'Subtitulado',
                                showtimes: [
                                  {
                                    format: { name: '2D' },
                                    experience: { name: 'Tradicional' },
                                    datetime: '2026-11-08T21:15:00',
                                  },
                                ],
                              },
                            ],
                          },
                        ],
                      },
                    ],
                  },
                },
              }),
          } as unknown as Response);
        },
      );

      const res = await evaluateCinepolisBillboard(baseParams);
      expect(res.moviesTotal).toBe(2);
      expect(res.failedMovies).toEqual([
        {
          movieId: 'm1',
          movieName: 'Duna Parte 2',
          reason: 'GraphQL Billboard HTTP 502',
        },
      ]);
      expect(res.schedules).toHaveLength(1);
      expect(res.schedules[0].movieName).toBe('Gladiador 2');
    });
  });

  describe('CinepolisService.scrape()', () => {
    it('blocks heavy resources, injects custom API key, marks partial movie failures as partial across all 10 venues, and closes page + browser', async () => {
      process.env.CINEPOLIS_PUBLIC_API_KEY = 'rotated-public-key';
      process.env.PUPPETEER_DISABLE_SANDBOX = 'false';

      let requestHandler: ((req: HTTPRequest) => void) | undefined;
      let capturedEvaluateParams: CinepolisEvaluateParams | undefined;

      const closePageSpy = jest.fn().mockResolvedValue(undefined);
      const closeBrowserSpy = jest.fn().mockResolvedValue(undefined);

      const pageMock = {
        setDefaultTimeout: jest.fn(),
        setRequestInterception: jest.fn().mockResolvedValue(undefined),
        on: jest.fn((event: string, cb: (req: HTTPRequest) => void) => {
          if (event === 'request') {
            requestHandler = cb;
          }
        }),
        goto: jest.fn().mockResolvedValue(undefined),
        evaluate: jest.fn(
          (_fn: unknown, params: CinepolisEvaluateParams) => {
            capturedEvaluateParams = params;
            return Promise.resolve({
              moviesTotal: 2,
              failedMovies: [
                {
                  movieId: 'm1',
                  movieName: 'Película Fallida',
                  reason: 'GraphQL Billboard HTTP 503',
                },
              ],
              schedules: [
                {
                  movieName: 'Gladiador 2',
                  schedules: [
                    {
                      cinemaId: 'cinepolis-recoleta-buenos-aires',
                      movieId: 'm2',
                      dates: [
                        {
                          date: '2026-11-08',
                          languages: [
                            {
                              language: 'SUB',
                              displayLanguage: 'Subtitulado',
                              showtimes: [
                                {
                                  format: { name: '2D' },
                                  experience: { name: '' },
                                  datetime: '2026-11-08T20:00:00',
                                },
                              ],
                            },
                          ],
                        },
                      ],
                    },
                  ],
                },
              ],
            });
          },
        ),
        close: closePageSpy,
      } as unknown as Page;

      const browserMock = {
        newPage: jest.fn().mockResolvedValue(pageMock),
        close: closeBrowserSpy,
      } as unknown as Browser;

      const service = new TestableCinepolisService(
        new TitleNormalizerService(),
        () => Promise.resolve(browserMock),
      );

      // Verify sandbox opt-in flag
      expect(service.exposeLaunchArgs()).toEqual(['--disable-dev-shm-usage']);

      const result = await service.scrape();

      // Verify request interception aborts images/media/fonts and continues documents/scripts
      expect(requestHandler).toBeDefined();
      const abortImg = jest.fn().mockResolvedValue(undefined);
      const continueDoc = jest.fn().mockResolvedValue(undefined);
      requestHandler!({
        resourceType: () => 'image',
        abort: abortImg,
        continue: continueDoc,
      } as unknown as HTTPRequest);
      requestHandler!({
        resourceType: () => 'document',
        abort: abortImg,
        continue: continueDoc,
      } as unknown as HTTPRequest);
      expect(abortImg).toHaveBeenCalledTimes(1);
      expect(continueDoc).toHaveBeenCalledTimes(1);

      expect(capturedEvaluateParams?.apiKey).toBe('rotated-public-key');
      expect(result.status).toBe('partial');
      expect(result.locations).toHaveLength(10);
      // Every venue is 'partial' (none is 'empty_verified' or 'complete') so F02 never deletes missing movie showtimes
      expect(result.locations.every((l) => l.status === 'partial')).toBe(true);
      expect(closePageSpy).toHaveBeenCalledTimes(1);
      expect(closeBrowserSpy).toHaveBeenCalledTimes(1);
    });

    it('marks all 10 venues failed and guarantees page + browser cleanup when page.goto or Movies fails', async () => {
      const closePageSpy = jest.fn().mockResolvedValue(undefined);
      const closeBrowserSpy = jest.fn().mockResolvedValue(undefined);

      const pageMock = {
        setDefaultTimeout: jest.fn(),
        setRequestInterception: jest.fn().mockResolvedValue(undefined),
        on: jest.fn(),
        goto: jest.fn().mockRejectedValue(new Error('Navigation timeout 20000ms')),
        close: closePageSpy,
      } as unknown as Page;

      const browserMock = {
        newPage: jest.fn().mockResolvedValue(pageMock),
        close: closeBrowserSpy,
      } as unknown as Browser;

      const service = new TestableCinepolisService(
        new TitleNormalizerService(),
        () => Promise.resolve(browserMock),
      );

      const result = await service.scrape();

      expect(result.status).toBe('failed');
      expect(result.locations).toHaveLength(10);
      expect(result.locations.every((l) => l.status === 'failed')).toBe(true);
      expect(result.errors[0]).toContain('Navigation timeout 20000ms');
      expect(closePageSpy).toHaveBeenCalledTimes(1);
      expect(closeBrowserSpy).toHaveBeenCalledTimes(1);
    });
  });
});
