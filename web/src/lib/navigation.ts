export interface MovieDetailNavigationContext {
  cinemaId?: string;
  date?: string;
}

/**
 * Builds the `/movie/[id]` destination preserving active `cinemaId` and `date` filters.
 */
export function buildMovieDetailHref(
  movieId: number | string,
  context: MovieDetailNavigationContext = {},
): string {
  const params = new URLSearchParams();

  if (context.cinemaId && context.cinemaId !== 'all') {
    params.set('cinemaId', context.cinemaId);
  }

  if (context.date) {
    params.set('date', context.date);
  }

  const query = params.toString();
  return query ? `/movie/${movieId}?${query}` : `/movie/${movieId}`;
}
