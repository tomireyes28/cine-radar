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

export { buildArgentinaDate } from '../../common/utils/argentina-time.util';
