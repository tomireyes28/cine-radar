export { buildArgentinaDate } from '../../common/utils/argentina-time.util';

export type ScrapeStatus =
  | 'complete'
  | 'empty_verified'
  | 'partial'
  | 'failed';

export interface ScrapedShowtimeItem {
  dateTime: Date;
  format: string;
  language: string;
  ticketUrl: string;
}

export interface ScrapedMovieItem {
  rawTitle: string;
  showtimes: ScrapedShowtimeItem[];
}

export interface ScrapedLocationResult {
  locationName: string;
  status: ScrapeStatus;
  movies: ScrapedMovieItem[];
  coveredFrom?: Date;
  coveredUntil?: Date;
  errors?: string[];
}

export interface ScrapedChainResult {
  chainKey?: string;
  chainName: string;
  status: ScrapeStatus;
  expectedLocations: number;
  locations: ScrapedLocationResult[];
  errors: string[];
}

export interface ICinemaScraper {
  readonly chainKey: string;
  readonly chainName: string;
  scrape(): Promise<ScrapedChainResult>;
}

/**
 * Aggregates venue-level statuses and chain-level errors into a deterministic ScrapeStatus.
 */
export function deriveChainScrapeStatus(
  locations: readonly ScrapedLocationResult[],
  expectedLocations: number,
  chainErrors: readonly string[] = [],
): ScrapeStatus {
  if (locations.length === 0 || expectedLocations === 0) {
    return 'failed';
  }

  let completeCount = 0;
  let emptyVerifiedCount = 0;
  let partialCount = 0;
  let failedCount = 0;

  for (const loc of locations) {
    switch (loc.status) {
      case 'complete':
        completeCount++;
        break;
      case 'empty_verified':
        emptyVerifiedCount++;
        break;
      case 'partial':
        partialCount++;
        break;
      case 'failed':
        failedCount++;
        break;
    }
  }

  if (failedCount === locations.length || completeCount + emptyVerifiedCount + partialCount === 0) {
    return 'failed';
  }

  if (
    failedCount > 0 ||
    partialCount > 0 ||
    locations.length < expectedLocations ||
    chainErrors.length > 0
  ) {
    return 'partial';
  }

  if (completeCount > 0) {
    return 'complete';
  }

  return emptyVerifiedCount === locations.length ? 'empty_verified' : 'failed';
}
