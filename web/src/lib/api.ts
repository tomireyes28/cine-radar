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

export async function getCinemas() {
  try {
    // Reutilizamos el endpoint de filtros que ya trae cadenas y cines ordenados
    const res = await fetch(`${API_URL}/movies/filters`, {
      next: { revalidate: 3600 }, // Cachear por 1 hora (los cines no cambian de lugar seguido)
    });
    if (!res.ok) return null;
    return res.json();
  } catch (error) {
    console.error("❌ Error fetching cinemas:", error);
    return null;
  }

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