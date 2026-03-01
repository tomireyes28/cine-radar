import { Movie } from "@/types/movie";

const API_URL = process.env.NEXT_PUBLIC_API_URL;

export interface UpcomingMovie {
  id: number;
  title: string;
  posterUrl: string;
  releaseDate: string;
  overview: string;
  isReRelease: boolean;
}

export interface CinemaLocation {
  id: number;
  name: string;
  address: string;
  lat: number | null;
  lng: number | null;
  chainId: number;
}

export interface CinemaChain {
  id: number;
  name: string;
  locations: CinemaLocation[];
}

export async function getNowPlaying(): Promise<Movie[]> {
  try {
    const res = await fetch(`${API_URL}/movies/now-playing`, {
      next: { revalidate: 60 }, 
    });

    if (!res.ok) {
      throw new Error('Error al conectar con el backend');
    }

    return res.json();
  } catch (error) {
    console.error("❌ Falló el fetch de películas:", error);
    return []; 
  }
}

export async function getMovieDetail(id: string, date?: string) {
  try {
    // Si hay fecha, la agregamos a la URL. Si no, el backend usa "HOY" por defecto.
    const url = new URL(`${API_URL}/movies/${id}`);
    if (date) url.searchParams.append('date', date);

    const res = await fetch(url.toString(), {
      next: { revalidate: 0 }, // No cacheamos el detalle para que los horarios estén siempre frescos
    });

    if (!res.ok) return null;

    return res.json();
  } catch (error) {
    console.error("❌ Error fetching movie detail:", error);
    return null;
  }

  
}

// Le avisamos que devuelve un array de Cadenas (o null si falla)
export async function getCinemas(): Promise<CinemaChain[] | null> {
  try {
    const res = await fetch(`${API_URL}/movies/filters`, {
      next: { revalidate: 3600 }, 
    });
    if (!res.ok) return null;
    return res.json();
  } catch (error) {
    console.error("❌ Error fetching cinemas:", error);
    return null;
  }
}

// Tu función limpia y tipada
export async function getCinemaById(id: string) {
  const chains = await getCinemas();
  if (!chains) return null;

  for (const chain of chains) {
    // Chau 'any', hola 'CinemaLocation'
    const cinema = chain.locations.find((c: CinemaLocation) => c.id.toString() === id);
    if (cinema) {
      return { ...cinema, chainName: chain.name }; 
    }
  }
  return null;
}

export async function getUpcomingMovies(): Promise<UpcomingMovie[]> {
  try {
    const res = await fetch(`${API_URL}/movies/upcoming`, {
      next: { revalidate: 3600 }, // Cacheamos 1 hora (no cambia seguido)
    });

    if (!res.ok) {
      throw new Error('Error al conectar con el backend');
    }

    return res.json();
  } catch (error) {
    console.error("❌ Falló el fetch de próximos estrenos:", error);
    return []; 
  }
}



// Buscar películas filtrando por el ID del cine
export async function getMoviesForCinema(cinemaId: string) {
  try {
    const res = await fetch(`${API_URL}/movies/now-playing?cinemaId=${cinemaId}`, {
      next: { revalidate: 60 },
    });
    
    if (!res.ok) return [];
    return res.json();
  } catch (error) {
    console.error(`❌ Falló el fetch para el cine ${cinemaId}:`, error);
    return [];
  }
}