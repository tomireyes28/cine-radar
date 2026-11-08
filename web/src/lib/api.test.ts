import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  ApiRequestError,
  getCinemaById,
  getMovieDetail,
  getNearbyCinemas,
  getNowPlaying,
  getUpcomingMovies,
} from './api.ts';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('Frontend API Error & Empty State Semantics (F12)', () => {
  it('returns genuine empty collections on HTTP 200 [] without throwing', async () => {
    const fetchMock: typeof fetch = async () => jsonResponse([], 200);

    const nowPlaying = await getNowPlaying(
      { zone: 'CABA' },
      { apiBaseUrl: 'http://api.local', fetchImpl: fetchMock },
    );
    const upcoming = await getUpcomingMovies({
      apiBaseUrl: 'http://api.local',
      fetchImpl: fetchMock,
    });
    const nearby = await getNearbyCinemas('-34.6037', '-58.3816', {
      apiBaseUrl: 'http://api.local',
      fetchImpl: fetchMock,
    });

    assert.deepEqual(nowPlaying, []);
    assert.deepEqual(upcoming, []);
    assert.deepEqual(nearby, []);
  });

  it('returns null ONLY on HTTP 404 so detail pages can trigger notFound()', async () => {
    const fetchMock: typeof fetch = async () =>
      jsonResponse({ statusCode: 404, message: 'Not Found' }, 404);

    const detail = await getMovieDetail('9999', '2026-11-08', {
      apiBaseUrl: 'http://api.local',
      fetchImpl: fetchMock,
    });

    assert.equal(detail, null);

    const cinemaFetchMock: typeof fetch = async () =>
      jsonResponse(
        [
          {
            id: 1,
            name: 'Hoyts',
            locations: [
              {
                id: 10,
                name: 'Hoyts Abasto',
                address: 'Av. Corrientes 3247',
                lat: -34.603,
                lng: -58.41,
                chainId: 1,
              },
            ],
          },
        ],
        200,
      );

    const missingCinema = await getCinemaById('999', {
      apiBaseUrl: 'http://api.local',
      fetchImpl: cinemaFetchMock,
    });
    assert.equal(missingCinema, null);
  });

  it('throws ApiRequestError with kind="rate_limited" on HTTP 429', async () => {
    const fetchMock: typeof fetch = async () =>
      jsonResponse({ statusCode: 429, message: 'Too Many Requests' }, 429);

    await assert.rejects(
      () =>
        getNowPlaying(
          {},
          { apiBaseUrl: 'http://api.local', fetchImpl: fetchMock },
        ),
      (err: unknown) => {
        assert.ok(err instanceof ApiRequestError);
        assert.equal(err.kind, 'rate_limited');
        assert.equal(err.status, 429);
        assert.equal(err.path, '/movies/now-playing');
        return true;
      },
    );
  });

  it('throws ApiRequestError with kind="upstream_http" on HTTP 500/503 instead of caching empty arrays', async () => {
    const fetch500: typeof fetch = async () =>
      jsonResponse({ statusCode: 500, message: 'Internal Server Error' }, 500);

    await assert.rejects(
      () =>
        getMovieDetail('42', '2026-11-08', {
          apiBaseUrl: 'http://api.local',
          fetchImpl: fetch500,
        }),
      (err: unknown) => {
        assert.ok(err instanceof ApiRequestError);
        assert.equal(err.kind, 'upstream_http');
        assert.equal(err.status, 500);
        assert.equal(err.path, '/movies/42');
        return true;
      },
    );

    const fetch503: typeof fetch = async () =>
      jsonResponse({ statusCode: 503, message: 'Service Unavailable' }, 503);

    await assert.rejects(
      () =>
        getUpcomingMovies({
          apiBaseUrl: 'http://api.local',
          fetchImpl: fetch503,
        }),
      (err: unknown) => {
        assert.ok(err instanceof ApiRequestError);
        assert.equal(err.kind, 'upstream_http');
        assert.equal(err.status, 503);
        assert.equal(err.path, '/movies/upcoming');
        return true;
      },
    );
  });

  it('throws ApiRequestError with kind="timeout" when upstream exceeds AbortSignal timeout', async () => {
    const slowFetch: typeof fetch = async (_input, init) =>
      new Promise<Response>((_resolve, reject) => {
        const signal = init?.signal;
        if (signal?.aborted) {
          reject(signal.reason);
          return;
        }
        signal?.addEventListener('abort', () => {
          reject(
            signal.reason ??
              Object.assign(new Error('The operation was aborted due to timeout'), {
                name: 'TimeoutError',
              }),
          );
        });
      });

    await assert.rejects(
      () =>
        getNowPlaying(
          {},
          {
            apiBaseUrl: 'http://api.local',
            fetchImpl: slowFetch,
            timeoutMs: 15,
          },
        ),
      (err: unknown) => {
        assert.ok(err instanceof ApiRequestError);
        assert.equal(err.kind, 'timeout');
        assert.equal(err.path, '/movies/now-playing');
        return true;
      },
    );
  });

  it('throws ApiRequestError with kind="misconfigured" when NEXT_PUBLIC_API_URL is missing', async () => {
    const prevEnv = process.env.NEXT_PUBLIC_API_URL;
    delete process.env.NEXT_PUBLIC_API_URL;

    try {
      await assert.rejects(
        () => getNowPlaying({}),
        (err: unknown) => {
          assert.ok(err instanceof ApiRequestError);
          assert.equal(err.kind, 'misconfigured');
          return true;
        },
      );
    } finally {
      if (prevEnv === undefined) {
        delete process.env.NEXT_PUBLIC_API_URL;
      } else {
        process.env.NEXT_PUBLIC_API_URL = prevEnv;
      }
    }
  });
});
