import { getNowPlaying } from "@/lib/api";
import MovieDashboard from "@/components/movies/MovieDashboard";

// Revalidamos los datos cada 60 segundos para tener cartelera fresca
export const revalidate = 60;

export default async function Home() {
  const movies = await getNowPlaying();

  return (
    <main className="container mx-auto px-4 md:px-6">
      
      {/* Hero Title */}
      <section className="mt-8 md:mt-12 mb-6 text-center md:text-left">
        <h1 className="text-3xl md:text-5xl font-bold bg-linear-to-r from-violet-400 to-fuchsia-400 bg-clip-text text-transparent mb-2">
          En Cartelera
        </h1>
        <p className="text-zinc-400 text-sm md:text-lg">
          {movies.length} películas disponibles hoy.
        </p>
      </section>

      {/* Dashboard Interactivo (Buscador + Grid) */}
      <MovieDashboard initialMovies={movies} />

    </main>
  );
}