import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildMovieDetailHref } from './navigation.ts';

describe('Movie detail navigation context preservation (F09)', () => {
  it('builds a clean base URL when neither cinemaId nor date is active', () => {
    assert.equal(buildMovieDetailHref(42), '/movie/42');
    assert.equal(buildMovieDetailHref(42, { cinemaId: 'all' }), '/movie/42');
  });

  it('preserves both cinemaId and future date when navigating from a theater page', () => {
    assert.equal(
      buildMovieDetailHref(42, { cinemaId: '14', date: '2026-11-09' }),
      '/movie/42?cinemaId=14&date=2026-11-09',
    );
  });

  it('preserves date alone when navigating from a date-filtered billboard', () => {
    assert.equal(
      buildMovieDetailHref(99, { date: '2026-11-10' }),
      '/movie/99?date=2026-11-10',
    );
  });
});
