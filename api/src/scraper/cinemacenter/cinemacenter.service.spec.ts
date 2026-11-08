import axios from 'axios';
import { CINEMACENTER_CITIES } from './cinemacenter.locations';
import { CinemaCenterService } from './cinemacenter.service';
import { TitleNormalizerService } from '../services/title-normalizer.service';
import {
  CINEMACENTER_AJAX_SHOWTIMES_HTML_FIXTURE,
  CINEMACENTER_EMPTY_HORARIOS_HTML_FIXTURE,
  CINEMACENTER_HORARIOS_HTML_FIXTURE,
  encodeIso88591ArrayBuffer,
} from '../__fixtures__/provider-payloads';

describe('CinemaCenterService Fixture Suite (F17)', () => {
  let service: CinemaCenterService;

  beforeEach(() => {
    service = new CinemaCenterService(new TitleNormalizerService());
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('decodes ISO-8859-1 /horarios ArrayBuffer preserving Spanish accents and extracts AJAX showtimes', async () => {
    jest
      .spyOn(axios, 'get')
      .mockImplementation(
        (_url: string, config?: { headers?: Record<string, string> }) => {
          const cookie = config?.headers?.Cookie ?? '';
          if (cookie === `cityid=${CINEMACENTER_CITIES[0].cityId}`) {
            return Promise.resolve({
              data: encodeIso88591ArrayBuffer(
                CINEMACENTER_HORARIOS_HTML_FIXTURE,
              ),
            });
          }
          return Promise.resolve({
            data: encodeIso88591ArrayBuffer(
              CINEMACENTER_EMPTY_HORARIOS_HTML_FIXTURE,
            ),
          });
        },
      );

    jest
      .spyOn(axios, 'post')
      .mockResolvedValue({ data: CINEMACENTER_AJAX_SHOWTIMES_HTML_FIXTURE });

    const result = await service.scrape();

    expect(result.status).toBe('complete');
    expect(result.expectedLocations).toBe(CINEMACENTER_CITIES.length);

    const altaGracia = result.locations.find(
      (l) => l.locationName === 'Cinema Center Alta Gracia',
    );
    expect(altaGracia?.status).toBe('complete');
    expect(altaGracia?.movies[0].rawTitle).toBe(
      'MISIÓN IMPOSIBLE - SENTENCIA FINAL',
    );
    expect(altaGracia?.movies[0].showtimes[0]).toMatchObject({
      format: '2D',
      language: 'SUBTITULADA',
    });
    expect(altaGracia?.movies[0].showtimes[0].dateTime.toISOString()).toBe(
      '2026-11-09T01:15:00.000Z',
    );

    const bahiaBlanca = result.locations.find(
      (l) => l.locationName === 'Cinema Center Bahía Blanca',
    );
    expect(bahiaBlanca?.status).toBe('empty_verified');
  });

  it('marks a venue partial when one of multiple AJAX movie showtime requests fails', async () => {
    const twoMoviesHtml = `<!DOCTYPE html>
<html><head><title>CinemaCenter</title></head><body>
  <ul class="movies">
    <li class="movieLink"><a href="javascript:seleccionarMovie('1','1','10','500')">GLADIADOR 2 (2D SUB)</a></li>
    <li class="movieLink"><a href="javascript:seleccionarMovie('1','1','10','501')">WICKED (2D CAST)</a></li>
  </ul>
</body></html>`;

    jest
      .spyOn(axios, 'get')
      .mockImplementation(
        (_url: string, config?: { headers?: Record<string, string> }) => {
          if (
            config?.headers?.Cookie ===
            `cityid=${CINEMACENTER_CITIES[0].cityId}`
          ) {
            return Promise.resolve({
              data: encodeIso88591ArrayBuffer(twoMoviesHtml),
            });
          }
          return Promise.resolve({
            data: encodeIso88591ArrayBuffer(
              CINEMACENTER_EMPTY_HORARIOS_HTML_FIXTURE,
            ),
          });
        },
      );

    jest
      .spyOn(axios, 'post')
      .mockImplementation((_url: string, body?: unknown) => {
        const encoded = typeof body === 'string' ? body : '';
        if (encoded.includes('showId=501')) {
          return Promise.reject(new Error('AJAX 500 Internal Error'));
        }
        return Promise.resolve({
          data: CINEMACENTER_AJAX_SHOWTIMES_HTML_FIXTURE,
        });
      });

    const result = await service.scrape();

    expect(result.status).toBe('partial');
    const altaGracia = result.locations.find(
      (l) => l.locationName === 'Cinema Center Alta Gracia',
    );
    expect(altaGracia?.status).toBe('partial');
    expect(altaGracia?.movies).toHaveLength(1);
  });

  it('returns failed when /horarios HTML does not match Cinema Center signature', async () => {
    jest.spyOn(axios, 'get').mockResolvedValue({
      data: encodeIso88591ArrayBuffer('<html><body>Cloudflare Challenge</body></html>'),
    });

    const result = await service.scrape();

    expect(result.status).toBe('failed');
    expect(result.locations.every((l) => l.status === 'failed')).toBe(true);
  });
});
