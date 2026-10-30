import { Movie, MovieDetail } from '@/types/movie';

const API_URL = process.env.NEXT_PUBLIC_API_URL;

export interface UpcomingMovie {
  id: number;
  title: string;
  posterUrl: string | null;
  releaseDate: string;
  overview: string;
  isReRelease: boolean;
}

export interface CinemaLocation {
  id: number;
  name: string;
  address: string;
  zone?: string;
  lat: number | null;
  lng: number | null;
  chainId: number;
}

export interface CinemaChain {
  id: number;
  name: string;
  locations: CinemaLocation[];
}

export interface BillboardFilters {
  zone?: string;
  chainId?: string;
  cinemaId?: string;
  date?: string;
}

async function apiGet<T>(
  path: string,
  params: Record<string, string | undefined>,
  revalidate: number,
): Promise<T | null> {
  try {
    const url = new URL(`${API_URL}${path}`);
    for (const [key, value] of Object.entries(params)) {
      if (value) url.searchParams.set(key, value);
    }

    const res = await fetch(url.toString(), { next: { revalidate } });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch (error) {
    console.error(`API request failed: ${path}`, error);
    return null;
  }
}

export async function getNowPlaying(
  filters: BillboardFilters = {},
): Promise<Movie[]> {
  const data = await apiGet<Movie[]>('/movies/now-playing', { ...filters }, 300);
  return data ?? [];
}

export async function getMovieDetail(
  id: string,
  date?: string,
): Promise<MovieDetail | null> {
  return apiGet<MovieDetail>(`/movies/${id}`, { date }, 300);
}

export async function getCinemas(): Promise<CinemaChain[] | null> {
  return apiGet<CinemaChain[]>('/movies/filters', {}, 3600);
}

export async function getCinemaById(id: string) {
  const chains = await getCinemas();
  if (!chains) return null;

  for (const chain of chains) {
    const cinema = chain.locations.find((c) => c.id.toString() === id);
    if (cinema) {
      return { ...cinema, chainName: chain.name };
    }
  }
  return null;
}

export async function getUpcomingMovies(): Promise<UpcomingMovie[]> {
  const data = await apiGet<UpcomingMovie[]>('/movies/upcoming', {}, 3600);
  return data ?? [];
}

export async function getMoviesForCinema(
  cinemaId: string,
  date?: string,
): Promise<Movie[]> {
  return getNowPlaying({ cinemaId, date });
}

export async function getNearbyCinemas(lat: string, lng: string) {
  const data = await apiGet<(CinemaLocation & { distance: number })[]>(
    '/movies/nearby',
    { lat, lng },
    0,
  );
  return data ?? [];
}
