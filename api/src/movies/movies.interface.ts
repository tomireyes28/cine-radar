import { Movie, CinemaLocation, CinemaChain } from '@prisma/client';

// 1. Filtros de entrada
export interface MovieFilters {
  date?: string;
  city?: string;
  chainId?: string;
  cinemaId?: string;
}

// 2. Estructura de respuesta de funciones agrupadas
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

// Diccionario para el reduce: { "Cinemark Palermo": { ... } }
export interface GroupedShowtimes {
  [cinemaName: string]: GroupedCinema;
}

// 3. Respuesta final del detalle
export type MovieDetailResponse = Movie & {
  cinemas: GroupedCinema[];
};