import { getUpcomingMovies } from '@/lib/api';
import MovieCard from '@/components/movies/MovieCard';
import { CalendarDays, Film } from 'lucide-react';

// 1. Metadatos para SEO (Ideal para que indexe bien si lo subís a producción)
export const metadata = {
  title: 'Próximamente | Cine Radar',
  description: 'Descubrí los próximos estrenos de cine y preparate para lo que se viene en la pantalla grande.',
};

export default async function ProximamentePage() {
  // 2. Fetch directo en el servidor (Carga ultra rápida)
  const movies = await getUpcomingMovies();

  return (
    <div className="px-4 md:px-6 pt-4">
      <div className="max-w-screen-2xl mx-auto"> 
        
        {/* --- CABECERA LIMPIA --- */}
        <div className="mb-10">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 bg-fuchsia-500/10 rounded-lg">
              <CalendarDays className="text-fuchsia-500 w-6 h-6 md:w-8 md:h-8" />
            </div>
            <h1 className="text-3xl md:text-5xl font-bold bg-linear-to-r from-fuchsia-500 to-violet-500 bg-clip-text text-transparent">
              Próximamente en Cines
            </h1>
          </div>
          <p className="text-zinc-400 text-sm md:text-base max-w-2xl ml-1">
            Prepará los pochoclos. Estos son los estrenos confirmados que van a llegar a la pantalla grande en las próximas semanas.
          </p>
        </div>

        {/* --- GRILLA DE PELÍCULAS --- */}
        {movies.length > 0 ? (
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4 md:gap-6 xl:grid-cols-6">
            {movies.map((movie, index) => (
              <MovieCard 
                key={movie.id} 
                movie={movie} 
                variant="upcoming" 
                // Optimizamos la carga de imágenes: las primeras 5 se cargan con prioridad
                priority={index < 5} 
              />
            ))}
          </div>
        ) : (
          /* --- ESTADO VACÍO (Empty State) --- */
          <div className="flex flex-col items-center justify-center py-24 bg-zinc-900/20 rounded-2xl border border-white/5">
            <Film className="w-16 h-16 text-zinc-700 mb-4" />
            <h2 className="text-xl font-semibold text-zinc-300">No hay estrenos a la vista</h2>
            <p className="text-zinc-500 mt-2 text-center max-w-md text-sm">
              Parece que la cartelera futura se está actualizando. Volvé a revisar en un rato.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}