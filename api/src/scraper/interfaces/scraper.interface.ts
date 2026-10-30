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
  movies: ScrapedMovieItem[];
}

export interface ScrapedChainResult {
  chainName: string;
  locations: ScrapedLocationResult[];
}

export interface ICinemaScraper {
  readonly chainKey: string;
  readonly chainName: string;
  scrape(): Promise<ScrapedChainResult>;
}

/**
 * Helper to build a Date in Argentina Timezone (UTC-3) from YYYY-MM-DD and HH:mm
 */
export function buildArgentinaDate(dateStr: string, timeStr: string): Date {
  const cleanDate = dateStr.trim().slice(0, 10);
  const [rawHours = '00', rawMinutes = '00'] = timeStr.trim().split(':');
  const hh = rawHours.padStart(2, '0');
  const mm = rawMinutes.padStart(2, '0');
  return new Date(`${cleanDate}T${hh}:${mm}:00.000-03:00`);
}
