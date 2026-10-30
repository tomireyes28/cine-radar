import { Movie, CinemaLocation, CinemaChain, Showtime } from '@prisma/client';

export interface MovieFilters {
  date?: string;
  city?: string;
  zone?: string;
  chainId?: string;
  cinemaId?: string;
}

export type NowPlayingMovieItem = Movie & {
  cinemaCount: number;
  chainNames: string[];
  zones: string[];
  formats: string[];
  showtimes: Pick<
    Showtime,
    'id' | 'dateTime' | 'format' | 'language' | 'ticketUrl'
  >[];
};

export interface FormattedFunction {
  id: number;
  time: Date;
  format: string;
  language: string;
  url: string;
}

export interface GroupedCinema {
  cinema: CinemaLocation & { chain: CinemaChain | null };
  functions: FormattedFunction[];
}

export interface GroupedShowtimes {
  [cinemaName: string]: GroupedCinema;
}

export type MovieDetailResponse = Movie & {
  cinemas: GroupedCinema[];
};
