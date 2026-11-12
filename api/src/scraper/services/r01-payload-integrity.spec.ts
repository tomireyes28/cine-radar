import axios from 'axios';
import { Browser } from 'puppeteer';
import { AtlasService } from '../atlas/atlas.service';
import { CinemarkService } from '../cinemark/cinemark.service';
import { MultiplexService } from '../multiplex/multiplex.service';
import { ShowcaseService } from '../showcase/showcase.service';
import { CinemaCenterService } from '../cinemacenter/cinemacenter.service';
import { CinepolisService } from '../cinepolis/cinepolis.service';
import { TitleNormalizerService } from './title-normalizer.service';
import * as fixtures from '../__fixtures__/provider-payloads';
import { validProviderTime } from './payload-integrity.util';

const normalizer = new TitleNormalizerService();
afterEach(() => jest.restoreAllMocks());

describe('R01: corrupt internal records cannot authorize deletion', () => {
  it('keeps valid Atlas rows but reports a mixed payload as partial', async () => {
    jest.spyOn(axios, 'get').mockResolvedValue({
      data: [...fixtures.ATLAS_CABALLITO_FIXTURE, { unexpected: true }],
    });
    const result = await new AtlasService(normalizer).scrape();
    expect(result.status).toBe('partial');
    expect(
      result.locations.every(
        (l) => l.status === 'partial' && l.movies.length === 2,
      ),
    ).toBe(true);
  });
  it('reports malformed Cinemark sessions alongside valid sessions as partial', async () => {
    jest.spyOn(axios, 'get').mockImplementation((url: string) =>
      Promise.resolve({
        data: url.endsWith('/theaters')
          ? fixtures.CINEMARK_THEATERS_BFF_FIXTURE
          : {
              data: [
                ...fixtures.CINEMARK_SHOWTIMES_PALERMO_FIXTURE.data,
                { movieName: 'Broken' },
              ],
            },
      }),
    );
    const result = await new CinemarkService(normalizer).scrape();
    expect(
      result.locations
        .filter((l) => l.movies.length)
        .every((l) => l.status === 'partial'),
    ).toBe(true);
    expect(result.locations.some((l) => l.movies.length)).toBe(true);
  });
  it('detects an invalid individual Multiplex function inside otherwise valid JSON', async () => {
    const html = fixtures.MULTIPLEX_HOME_HTML_FIXTURE.replace(
      '"hora":"18:45"',
      '"hora":"25:45"',
    );
    jest.spyOn(axios, 'get').mockResolvedValue({ data: html });
    const result = await new MultiplexService(normalizer).scrape();
    expect(result.status).toBe('partial');
    expect(result.locations.every((l) => l.status === 'partial')).toBe(true);
  });
  it('rejects malformed Showcase performances without treating absent venues as empty', async () => {
    const broken = structuredClone(
      fixtures.SHOWCASE_VOYALCINE_TREE_101_FIXTURE,
    );
    broken.days['2026-11-08'][0].formats[0].performances.push({
      performanceId: 999,
      showTime: 'bad',
    });
    jest.spyOn(axios, 'get').mockImplementation((url: string) =>
      Promise.resolve({
        data: url.includes('todoshowcase')
          ? fixtures.SHOWCASE_HOME_HTML_FIXTURE
          : url.includes('/101/')
            ? broken
            : fixtures.SHOWCASE_VOYALCINE_TREE_102_FIXTURE,
      }),
    );
    const result = await new ShowcaseService(normalizer).scrape();
    expect(result.status).toBe('partial');
    expect(result.locations.every((l) => l.status === 'partial')).toBe(true);
  });
  it('detects malformed Cinema Center links beside a valid function', async () => {
    jest.spyOn(axios, 'get').mockResolvedValue({
      data: fixtures.encodeIso88591ArrayBuffer(
        fixtures.CINEMACENTER_HORARIOS_HTML_FIXTURE,
      ),
    });
    jest.spyOn(axios, 'post').mockResolvedValue({
      data: fixtures.CINEMACENTER_AJAX_SHOWTIMES_HTML_FIXTURE.replace(
        '</ul>',
        '<li><a href="broken">bad</a></li></ul>',
      ),
    });
    const result = await new CinemaCenterService(normalizer).scrape();
    expect(result.status).toBe('partial');
    expect(
      result.locations.every(
        (l) => l.status === 'partial' && l.movies.length > 0,
      ),
    ).toBe(true);
  });
  it('rejects malformed internal Cinépolis schedules while retaining the other movie', async () => {
    class TestService extends CinepolisService {
      protected launchBrowser(): Promise<Browser> {
        return Promise.resolve({
          newPage: () =>
            Promise.resolve({
              setDefaultTimeout: () => undefined,
              setRequestInterception: () => Promise.resolve(undefined),
              on: () => undefined,
              goto: () => Promise.resolve(undefined),
              close: () => Promise.resolve(undefined),
              evaluate: () =>
                Promise.resolve({
                  moviesTotal: 2,
                  failedMovies: [],
                  schedules: [
                    {
                      movieName: 'Broken',
                      schedules: [
                        {
                          cinemaId: 'cinepolis-recoleta-buenos-aires',
                          dates: [
                            {
                              date: '2026-11-08',
                              languages: [
                                {
                                  language: 'SUB',
                                  showtimes: [{ datetime: 'bad' }],
                                },
                              ],
                            },
                          ],
                        },
                      ],
                    },
                    {
                      movieName: 'Valid',
                      schedules: [
                        {
                          cinemaId: 'cinepolis-recoleta-buenos-aires',
                          dates: [
                            {
                              date: '2026-11-08',
                              languages: [
                                {
                                  language: 'SUB',
                                  showtimes: [
                                    { datetime: '2026-11-08T20:00:00' },
                                  ],
                                },
                              ],
                            },
                          ],
                        },
                      ],
                    },
                  ],
                }),
            }),
          close: () => Promise.resolve(undefined),
        } as unknown as Browser);
      }
    }
    const result = await new TestService(normalizer).scrape();
    expect(result.status).toBe('partial');
    expect(result.locations.every((l) => l.status === 'partial')).toBe(true);
    expect(result.locations.some((l) => l.movies.length > 0)).toBe(true);
  });
  it.each([
    ['2026-02-30', '18:00'],
    ['2026-11-08', '25:00'],
    ['2026-11-08', '18:99'],
  ])('rejects rolled-over provider date/time %s %s', (day, time) => {
    expect(validProviderTime(day, time)).toBe(false);
  });
});
