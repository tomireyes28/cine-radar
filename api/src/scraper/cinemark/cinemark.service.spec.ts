import axios from 'axios';
import { CINEMARK_LOCATIONS } from './cinemark.locations';
import { CinemarkService } from './cinemark.service';
import { TitleNormalizerService } from '../services/title-normalizer.service';
import {
  CINEMARK_SHOWTIMES_PALERMO_FIXTURE,
  CINEMARK_THEATERS_BFF_FIXTURE,
} from '../__fixtures__/provider-payloads';

describe('CinemarkService Fixture Suite (F17)', () => {
  let service: CinemarkService;

  beforeEach(() => {
    service = new CinemarkService(new TitleNormalizerService());
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('resolves all theater slugs via BFF, converts wall-clock AR sessionDateTime, and normalizes EN/INGLÉS as Subtitulado', async () => {
    const fullTheaterCatalog = {
      data: CINEMARK_LOCATIONS.map((loc, idx) => ({
        id: 700 + idx,
        name: loc.name,
        slug: loc.url.split('/').filter(Boolean).pop(),
      })),
    };

    jest
      .spyOn(axios, 'get')
      .mockImplementation(
        (url: string, config?: { params?: { theater?: number } }) => {
          if (url.endsWith('/cinema/theaters')) {
            return Promise.resolve({ data: fullTheaterCatalog });
          }
          if (config?.params?.theater === 700) {
            return Promise.resolve({
              data: CINEMARK_SHOWTIMES_PALERMO_FIXTURE,
            });
          }
          return Promise.resolve({ data: { data: [] } });
        },
      );

    const result = await service.scrape();

    expect(result.status).toBe('complete');
    expect(result.expectedLocations).toBe(CINEMARK_LOCATIONS.length);
    expect(result.errors).toEqual([]);

    const palermo = result.locations.find(
      (l) => l.locationName === 'Cinemark Palermo',
    );
    expect(palermo?.status).toBe('complete');
    expect(palermo?.movies[0].rawTitle).toBe('NOSFERATU');
    expect(palermo?.movies[0].showtimes[0]).toMatchObject({
      format: 'XD',
      language: 'SUBTITULADA',
      ticketUrl: 'https://www.cinemarkhoyts.com.ar/cartelera/palermo',
    });
    // 21:40 AR wall-clock -> 00:40Z next UTC day
    expect(palermo?.movies[0].showtimes[0].dateTime.toISOString()).toBe(
      '2026-11-09T00:40:00.000Z',
    );

    const abasto = result.locations.find(
      (l) => l.locationName === 'Cinemark Abasto',
    );
    expect(abasto?.status).toBe('empty_verified');
  });

  it('returns partial when BFF omits theater slugs for some venues while others succeed', async () => {
    jest
      .spyOn(axios, 'get')
      .mockImplementation(
        (url: string, config?: { params?: { theater?: number } }) => {
          if (url.endsWith('/cinema/theaters')) {
            return Promise.resolve({ data: CINEMARK_THEATERS_BFF_FIXTURE });
          }
          if (config?.params?.theater === 701) {
            return Promise.resolve({
              data: CINEMARK_SHOWTIMES_PALERMO_FIXTURE,
            });
          }
          return Promise.resolve({ data: { data: [] } });
        },
      );

    const result = await service.scrape();

    expect(result.status).toBe('partial');
    expect(
      result.locations.find((l) => l.locationName === 'Cinemark Palermo')
        ?.status,
    ).toBe('complete');
    expect(
      result.locations.find((l) => l.locationName === 'Cinemark Unicenter')
        ?.status,
    ).toBe('failed');
  });

  it('returns failed when /cinema/theaters BFF schema is invalid', async () => {
    jest.spyOn(axios, 'get').mockResolvedValue({ data: { unexpected: true } });

    const result = await service.scrape();

    expect(result.status).toBe('failed');
    expect(result.locations.every((l) => l.status === 'failed')).toBe(true);
  });
});
