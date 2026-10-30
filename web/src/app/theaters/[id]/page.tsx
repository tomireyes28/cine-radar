import { notFound } from 'next/navigation';
import Link from 'next/link';
import { MapPin, Film, ChevronRight, Navigation } from 'lucide-react';
import MovieCard from '@/components/movies/MovieCard';
import { getCinemaById, getMoviesForCinema } from '@/lib/api';
import { Movie } from '@/types/movie';

// ✅ Corregido: params ahora se recibe como Promise y se debe usar await
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params; // 👈 Desembocamos la promesa aquí
  const cinema = await getCinemaById(id);
  if (!cinema) return { title: 'Cine no encontrado | Cine Radar' };
  return { title: `${cinema.name} | Cine Radar` };
}

export default async function CinemaDetailPage({ params }: { params: Promise<{ id: string }> }) {
  // ✅ Corregido: params se espera antes de usar el ID
  const { id } = await params;

  const [cinema, movies] = await Promise.all([
    getCinemaById(id),
    getMoviesForCinema(id)
  ]);

  if (!cinema) {
    notFound();
  }

  // Generamos el link de Google Maps (usamos las coordenadas si existen)
  const mapsUrl = cinema.lat && cinema.lng 
    ? `https://www.google.com/maps/search/?api=1&query=${cinema.lat},${cinema.lng}`
    : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${cinema.name} ${cinema.address}`)}`;

  return (
    <div className="px-4 md:px-6 pt-4">
      <div className="max-w-screen-2xl mx-auto">
        
        {/* --- BREADCRUMBS --- */}
        <nav className="flex items-center gap-2 text-xs md:text-sm text-zinc-500 mb-6">
          <Link href="/theaters" className="hover:text-violet-400 transition-colors">Cines</Link>
          <ChevronRight size={14} />
          <span className="text-zinc-300 font-medium">{cinema.chainName}</span>
          <ChevronRight size={14} />
          <span className="text-violet-400 font-medium">{cinema.name}</span>
        </nav>

        {/* --- HEADER DEL CINE --- */}
        <div className="bg-zinc-900/40 border border-white/5 rounded-2xl p-6 md:p-10 mb-10 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 bg-violet-500/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/3" />
          
          <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div>
              <div className="inline-block px-3 py-1 bg-zinc-800 text-zinc-300 text-xs font-bold rounded-md mb-3">
                {cinema.chainName}
              </div>
              <h1 className="text-3xl md:text-5xl font-bold text-white mb-3">
                {cinema.name}
              </h1>
              <div className="flex items-center gap-2 text-zinc-400">
                <MapPin size={18} className="text-violet-400" />
                <p>{cinema.address}</p>
              </div>
            </div>

            <a 
              href={mapsUrl} 
              target="_blank" 
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 bg-violet-600 hover:bg-violet-500 text-white px-6 py-3 rounded-xl font-medium transition-colors w-full md:w-auto"
            >
              <Navigation size={18} />
              Cómo llegar
            </a>
          </div>
        </div>

        {/* --- CARTELERA DEL CINE --- */}
        <div className="mb-6 flex items-center gap-3">
          <Film className="text-violet-500" size={24} />
          <h2 className="text-2xl font-bold">En cartelera hoy</h2>
          <span className="bg-zinc-800 text-zinc-400 text-xs px-2 py-1 rounded-full ml-2">
            {movies.length} películas
          </span>
        </div>

        {movies.length > 0 ? (
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 md:gap-6">
            {movies.map((movie: Movie, index: number) => (
              <MovieCard 
                key={movie.id} 
                movie={movie} 
                variant="now-playing" 
                priority={index < 5} 
                cinemaId={id} 
              />
            ))}
          </div>
        ) : (
          <div className="bg-zinc-900/30 border border-white/5 rounded-2xl p-12 text-center flex flex-col items-center">
            <Film className="text-zinc-600 mb-4" size={48} />
            <h3 className="text-xl font-medium text-zinc-300 mb-2">No hay funciones programadas</h3>
            <p className="text-zinc-500 max-w-md mx-auto text-sm">
              Parece que este cine no tiene películas en cartelera para hoy o los datos se están actualizando.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}