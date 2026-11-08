import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { getMovieDetail, getMoviesForCinema } from './api.ts';
import {
  isValidPositiveInt4,
  resolveSelectedDate,
  sanitizePositiveIntParam,
} from './dates.ts';
import { buildMovieDetailHref } from './navigation.ts';

describe('Critical User Journey: Theater -> Future Date -> Movie Detail (F09/F10/F12/F17)', () => {
  it('preserves selected theater and future date end-to-end across URL builders, param sanitizers, and API client requests', async () => {
    const requestedUrls: string[] = [];

    const fetchMock: typeof fetch = async (input) => {
      const url =
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url;
      requestedUrls.push(url);

      if (url.includes('/movies/now-playing')) {
        return new Response(
          JSON.stringify([
            {
              id: 77,
              tmdbId: 558449,
              title: 'Gladiador 2',
              posterUrl: '/gladiador2.jpg',
              backdropUrl: null,
              overview: 'Secuela épica',
              rating: 8.1,
              genres: ['Acción'],
              duration: 148,
              cinemaCount: 1,
              formats: ['IMAX'],
              showtimes: [
                {
                  id: 901,
                  dateTime: '2026-11-12T23:00:00.000Z',
                  format: 'IMAX',
                  language: 'Subtitulado',
                  ticketUrl: 'https://tickets.example/901',
                },
              ],
            },
          ]),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }

      if (url.includes('/movies/77')) {
        return new Response(
          JSON.stringify({
            id: 77,
            tmdbId: 558449,
            title: 'Gladiador 2',
            posterUrl: '/gladiador2.jpg',
            backdropUrl: null,
            overview: 'Secuela épica',
            rating: 8.1,
            genres: ['Acción'],
            duration: 148,
            cinemas: [
              {
                cinema: {
                  id: 15,
                  name: 'Showcase Norcenter',
                  address: 'Esteban Echeverría 3750',
                  chain: { name: 'Showcase' },
                },
                functions: [
                  {
                    id: 901,
                    time: '2026-11-12T23:00:00.000Z',
                    format: 'IMAX',
                    language: 'Subtitulado',
                    url: 'https://tickets.example/901',
                  },
                ],
              },
              {
                cinema: {
                  id: 22,
                  name: 'Cinemark Palermo',
                  address: 'Beruti 3399',
                  chain: { name: 'Cinemark' },
                },
                functions: [
                  {
                    id: 902,
                    time: '2026-11-12T23:30:00.000Z',
                    format: '2D',
                    language: 'Subtitulado',
                    url: 'https://tickets.example/902',
                  },
                ],
              },
            ],
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }

      return new Response('Not Found', { status: 404 });
    };

    // Step 1: User opens /theaters/15?date=2026-11-12
    const theaterParamId = '15';
    assert.equal(isValidPositiveInt4(theaterParamId), true);
    const theaterDate = resolveSelectedDate('2026-11-12', '2026-11-08');
    assert.equal(theaterDate, '2026-11-12');

    const theaterMovies = await getMoviesForCinema(
      theaterParamId,
      theaterDate,
      { apiBaseUrl: 'http://api.local', fetchImpl: fetchMock },
    );
    assert.equal(theaterMovies.length, 1);

    // Step 2: MovieCard builds detail href preserving both cinemaId=15 and date=2026-11-12
    const detailHref = buildMovieDetailHref(theaterMovies[0].id, {
      cinemaId: theaterParamId,
      date: theaterDate,
    });
    assert.equal(detailHref, '/movie/77?cinemaId=15&date=2026-11-12');

    // Step 3: MovieDetailPage parses URL + searchParams and fetches movie detail for 2026-11-12
    const parsedUrl = new URL(detailHref, 'https://cinema-agenda-app.vercel.app');
    const movieIdParam = parsedUrl.pathname.split('/').pop() ?? '';
    assert.equal(isValidPositiveInt4(movieIdParam), true);

    const detailDate = resolveSelectedDate(
      parsedUrl.searchParams.get('date') ?? undefined,
      '2026-11-08',
    );
    const detailCinemaId = sanitizePositiveIntParam(
      parsedUrl.searchParams.get('cinemaId') ?? undefined,
    );
    assert.equal(detailDate, '2026-11-12');
    assert.equal(detailCinemaId, '15');

    const movieDetail = await getMovieDetail(movieIdParam, detailDate, {
      apiBaseUrl: 'http://api.local',
      fetchImpl: fetchMock,
    });
    assert.ok(movieDetail);

    const filteredCinemas = movieDetail.cinemas.filter(
      (cg) => cg.cinema.id.toString() === detailCinemaId,
    );
    assert.equal(filteredCinemas.length, 1);
    assert.equal(filteredCinemas[0].cinema.name, 'Showcase Norcenter');

    assert.deepEqual(requestedUrls, [
      'http://api.local/movies/now-playing?cinemaId=15&date=2026-11-12',
      'http://api.local/movies/77?date=2026-11-12',
    ]);
  });
});
