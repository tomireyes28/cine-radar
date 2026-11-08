import axios from 'axios';
import { ShowcaseService } from './showcase.service';
import { TitleNormalizerService } from '../services/title-normalizer.service';
import {
  SHOWCASE_HOME_HTML_FIXTURE,
  SHOWCASE_VOYALCINE_TREE_101_FIXTURE,
  SHOWCASE_VOYALCINE_TREE_102_FIXTURE,
} from '../__fixtures__/provider-payloads';

describe('ShowcaseService Fixture Suite (F17)', () => {
  let service: ShowcaseService;

  beforeEach(() => {
    service = new ShowcaseService(new TitleNormalizerService());
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('deduplicates filmIds from home HTML, maps IMAX THEATRE to Showcase Norcenter as IMAX, and parses VoyAlCine trees', async () => {
    jest.spyOn(axios, 'get').mockImplementation((url: string) => {
      if (url.includes('todoshowcase.com')) {
        return Promise.resolve({ data: SHOWCASE_HOME_HTML_FIXTURE });
      }
      if (url.includes('/films/101/tree/showcase')) {
        return Promise.resolve({ data: SHOWCASE_VOYALCINE_TREE_101_FIXTURE });
      }
      if (url.includes('/films/102/tree/showcase')) {
        return Promise.resolve({ data: SHOWCASE_VOYALCINE_TREE_102_FIXTURE });
      }
      return Promise.reject(new Error(`Unexpected URL: ${url}`));
    });

    const result = await service.scrape();

    expect(result.status).toBe('complete');
    // 8 config entries collapse to 7 unique physical locations (Norcenter + IMAX THEATRE share Showcase Norcenter)
    expect(result.expectedLocations).toBe(7);

    const norcenter = result.locations.find(
      (l) => l.locationName === 'Showcase Norcenter',
    );
    expect(norcenter?.status).toBe('complete');
    expect(norcenter?.movies[0].showtimes[0]).toMatchObject({
      format: 'IMAX',
      language: 'CASTELLANO',
      ticketUrl:
        'https://entradas.todoshowcase.com/showcase/pelicula.aspx?filmid=101',
    });

    const cordoba = result.locations.find(
      (l) => l.locationName === 'Showcase Córdoba',
    );
    expect(cordoba?.status).toBe('complete');
    expect(cordoba?.movies[0].rawTitle).toBe(
      'Misión Imposible - Sentencia Final',
    );

    const rosario = result.locations.find(
      (l) => l.locationName === 'Showcase Rosario',
    );
    expect(rosario?.status).toBe('empty_verified');
  });

  it('marks all venues partial when one VoyAlCine film tree fails so partial film sets never overwrite complete venues', async () => {
    jest.spyOn(axios, 'get').mockImplementation((url: string) => {
      if (url.includes('todoshowcase.com')) {
        return Promise.resolve({ data: SHOWCASE_HOME_HTML_FIXTURE });
      }
      if (url.includes('/films/101/tree/showcase')) {
        return Promise.resolve({ data: SHOWCASE_VOYALCINE_TREE_101_FIXTURE });
      }
      return Promise.reject(new Error('VoyAlCine 504 Gateway Timeout'));
    });

    const result = await service.scrape();

    expect(result.status).toBe('partial');
    expect(result.locations.every((l) => l.status === 'partial')).toBe(true);
  });

  it('returns failed when home HTML contains zero filmIds', async () => {
    jest
      .spyOn(axios, 'get')
      .mockResolvedValue({ data: '<html><body>Mantenimiento</body></html>' });

    const result = await service.scrape();

    expect(result.status).toBe('failed');
    expect(result.locations.every((l) => l.status === 'failed')).toBe(true);
  });
});
