import {
  deriveChainScrapeStatus,
  ScrapedChainResult,
} from '../interfaces/scraper.interface';

/** No adapter may authorize deletion by inferring coverage from the returned rows. */
export function enforceVerifiedCoverage(
  chain: ScrapedChainResult,
): ScrapedChainResult {
  const errors = [...chain.errors];
  const locations = chain.locations.map((location) => {
    if (location.status !== 'complete' && location.status !== 'empty_verified')
      return location;
    const from = location.coveredFrom?.getTime();
    const until = location.coveredUntil?.getTime();
    const bounded =
      from !== undefined &&
      until !== undefined &&
      Number.isFinite(from) &&
      Number.isFinite(until) &&
      from <= until;
    const rows = location.movies.flatMap((movie) => movie.showtimes);
    const rowsValid =
      bounded &&
      rows.every(
        (row) =>
          Number.isFinite(row.dateTime.getTime()) &&
          row.dateTime.getTime() >= from &&
          row.dateTime.getTime() <= until,
      );
    const emptyConsistent =
      location.status !== 'empty_verified' || rows.length === 0;
    if (bounded && rowsValid && emptyConsistent) return location;
    const error = `[${location.locationName}] Unknown, invalid or inconsistent coverage; absent showtimes are preserved.`;
    errors.push(error);
    return {
      ...location,
      status: 'partial' as const,
      errors: [...(location.errors ?? []), error],
    };
  });
  return {
    ...chain,
    locations,
    errors,
    status:
      chain.status === 'failed'
        ? 'failed'
        : deriveChainScrapeStatus(locations, chain.expectedLocations, errors),
  };
}
