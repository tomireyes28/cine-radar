export interface Showtime {
  id: number;
  dateTime: string;
  format: string;
  language: string;
  ticketUrl: string;
}

export interface Movie {
  id: number;
  title: string;
  tmdbId: number;
  posterUrl: string | null;
  backdropUrl?: string | null;
  overview?: string | null;
  releaseDate?: string | null;
  duration?: number | null;
  rating?: string | null;
  genres?: string[];
  cinemaCount?: number;
  chainNames?: string[];
  zones?: string[];
  formats?: string[];
  showtimes?: Showtime[];
}

export interface FunctionItem {
  id: number;
  time: string;
  format: string;
  language: string;
  url: string;
}

export interface CinemaGroup {
  cinema: {
    id: number;
    name: string;
    address: string;
    zone?: string;
    chain?: { name: string } | null;
  };
  functions: FunctionItem[];
}

export interface MovieDetail extends Movie {
  cinemas: CinemaGroup[];
}
