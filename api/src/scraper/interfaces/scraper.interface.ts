// Interfaz para el JSON crudo que viene en data-funciones
export interface RawMultiplexFunction {
  complejo: string;
  dia: string;
  hora: string;
  formato: string;
  idioma: string;
}

export interface Showtime {
  time: string;
  format: string;
  language: string;
}

export interface ScrapedMovie {
  cinemaTitle: string;
  ticketUrl: string | undefined;
  tmdbInfo: any; // O el tipo de TMDB que ya tenías
  showtimes: Showtime[]; 
}