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
  posterUrl: string;
  description?: string;
  showtimes?: Showtime[]; 
}