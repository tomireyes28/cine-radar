import axios from 'axios';
import { MULTIPLEX_LOCATIONS } from './multiplex.locations';
import { MultiplexService } from './multiplex.service';
import { TitleNormalizerService } from '../services/title-normalizer.service';
import {
  MULTIPLEX_HOME_HTML_FIXTURE,
  MULTIPLEX_PARTIAL_CORRUPT_HTML_FIXTURE,
} from '../__fixtures__/provider-payloads';

describe('MultiplexService Fixture Suite (F17)', () => {
  let service: MultiplexService;

  beforeEach(() => {
    service = new MultiplexService(new TitleNormalizerService());
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('parses MM.DD.YYYY data-funciones attributes across Multiplex complexes and marks idle venues empty_verified', async () => {
    jest
      .spyOn(axios, 'get')
      .mockResolvedValue({ data: MULTIPLEX_HOME_HTML_FIXTURE });

    const result = await service.scrape();

    expect(result.status).toBe('complete');
    expect(result.expectedLocations).toBe(MULTIPLEX_LOCATIONS.length);

    const belgrano = result.locations.find(
      (l) => l.locationName === 'Multiplex Belgrano',
    );
    expect(belgrano?.status).toBe('complete');
    expect(belgrano?.movies[0]).toMatchObject({
      rawTitle: 'DUNA: PARTE DOS',
    });
    expect(belgrano?.movies[0].showtimes[0]).toMatchObject({
      format: '2D',
      language: 'SUBTITULADA',
      ticketUrl: 'https://multiplex.com.ar/pelicula/duna-parte-2',
    });
    expect(belgrano?.movies[0].showtimes[0].dateTime.toISOString()).toBe(
      '2026-11-08T21:45:00.000Z',
    );

    const lavalle = result.locations.find(
      (l) => l.locationName === 'Multiplex Lavalle',
    );
    expect(lavalle?.status).toBe('complete');
    expect(lavalle?.movies[0].showtimes[0]).toMatchObject({
      format: '3D',
      language: 'CASTELLANO',
    });

    const canning = result.locations.find(
      (l) => l.locationName === 'Multiplex Canning',
    );
    expect(canning?.status).toBe('empty_verified');
  });

  it('downgrades venues to partial when a corrupt .funcion-item block is skipped so idle venues are never wiped', async () => {
    jest
      .spyOn(axios, 'get')
      .mockResolvedValue({ data: MULTIPLEX_PARTIAL_CORRUPT_HTML_FIXTURE });

    const result = await service.scrape();

    expect(result.status).toBe('partial');
    expect(result.locations.every((l) => l.status === 'partial')).toBe(true);
    expect(result.errors[0]).toContain('omitió 1 bloque(s)');
  });

  it('returns failed when HTML structure changes and no .funcion-item nodes exist', async () => {
    jest
      .spyOn(axios, 'get')
      .mockResolvedValue({ data: '<html><body><div>Rediseño</div></body></html>' });

    const result = await service.scrape();

    expect(result.status).toBe('failed');
    expect(result.locations.every((l) => l.status === 'failed')).toBe(true);
    expect(result.errors[0]).toContain('No se encontraron nodos .funcion-item');
  });
});
