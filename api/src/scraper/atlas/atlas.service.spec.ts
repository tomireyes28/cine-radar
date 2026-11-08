import axios from 'axios';
import { ATLAS_LOCATIONS } from './atlas.locations';
import { AtlasService } from './atlas.service';
import { TitleNormalizerService } from '../services/title-normalizer.service';
import { ATLAS_CABALLITO_FIXTURE } from '../__fixtures__/provider-payloads';

describe('AtlasService Fixture Suite (F17)', () => {
  let service: AtlasService;

  beforeEach(() => {
    service = new AtlasService(new TitleNormalizerService());
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('parses Atlas JSON showtimes, strips D-BOX while preserving hyphenated titles, and marks empty venues as empty_verified', async () => {
    jest.spyOn(axios, 'get').mockImplementation((url: string) => {
      if (url.includes(`codComplejo=${ATLAS_LOCATIONS[0].complexId}`)) {
        return Promise.resolve({ data: ATLAS_CABALLITO_FIXTURE });
      }
      return Promise.resolve({ data: [] });
    });

    const result = await service.scrape();

    expect(result.status).toBe('complete');
    expect(result.expectedLocations).toBe(ATLAS_LOCATIONS.length);
    expect(result.errors).toEqual([]);

    const caballito = result.locations.find(
      (l) => l.locationName === 'Atlas Caballito',
    );
    expect(caballito?.status).toBe('complete');
    expect(caballito?.movies).toHaveLength(2);

    const gladiador = caballito?.movies.find(
      (m) => m.rawTitle === 'GLADIADOR 2',
    );
    expect(gladiador?.showtimes[0]).toMatchObject({
      format: 'D-BOX',
      language: 'SUBTITULADA',
    });
    expect(gladiador?.showtimes[0].dateTime.toISOString()).toBe(
      '2026-11-08T22:30:00.000Z',
    );

    const spiderMan = caballito?.movies.find(
      (m) => m.rawTitle === 'SPIDER-MAN: SIN CAMINO A CASA',
    );
    expect(spiderMan?.showtimes[0]).toMatchObject({
      format: '2D',
      language: 'CASTELLANO',
    });

    const flores = result.locations.find(
      (l) => l.locationName === 'Atlas Flores',
    );
    expect(flores?.status).toBe('empty_verified');
  });

  it('returns partial when one venue errors while remaining venues succeed', async () => {
    jest.spyOn(axios, 'get').mockImplementation((url: string) => {
      if (url.includes(`codComplejo=${ATLAS_LOCATIONS[0].complexId}`)) {
        return Promise.resolve({ data: ATLAS_CABALLITO_FIXTURE });
      }
      if (url.includes(`codComplejo=${ATLAS_LOCATIONS[1].complexId}`)) {
        return Promise.reject(new Error('HTTP 503 Atlas Flores'));
      }
      return Promise.resolve({ data: [] });
    });

    const result = await service.scrape();

    expect(result.status).toBe('partial');
    expect(
      result.locations.find((l) => l.locationName === 'Atlas Flores')?.status,
    ).toBe('failed');
    expect(
      result.locations.find((l) => l.locationName === 'Atlas Caballito')
        ?.status,
    ).toBe('complete');
  });

  it('flags non-empty payloads with 0 valid showtimes as schema drift failures instead of empty_verified', async () => {
    jest
      .spyOn(axios, 'get')
      .mockResolvedValue({ data: [{ unexpectedField: 123 }] });

    const result = await service.scrape();

    expect(result.status).toBe('failed');
    expect(result.locations.every((l) => l.status === 'failed')).toBe(true);
    expect(result.errors[0]).toContain('posible cambio de esquema');
  });
});
