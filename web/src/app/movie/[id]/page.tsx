import Image from 'next/image';
import { getMovieDetail } from '@/lib/api';
import DateSelector from '@/components/movies/DateSelector';
import CinemaSelector from '@/components/movies/CinemaSelector'; // ✅ Importamos el selector
import { MapPin, Ticket } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import Link from 'next/link';

interface FunctionItem {
  id: number;
  time: string;
  format: string;
  language: string;
  url: string;
}

interface CinemaGroup {
  cinema: {
    id: number;
    name: string;
    address: string;
  };
  functions: FunctionItem[];
}

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ date?: string; cinemaId?: string }>; // ✅ Agregamos cinemaId a la promesa
}

export default async function MovieDetailPage({ params, searchParams }: PageProps) {
  const { id } = await params;
  const { date, cinemaId } = await searchParams; // ✅ Leemos el filtro

  const movie = await getMovieDetail(id, date);

  if (!movie) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-zinc-950 text-zinc-400 gap-4">
        <span className="text-4xl">😔</span>
        <h1 className="text-xl font-medium">No encontramos esa película</h1>
        <p className="text-sm">ID buscado: {id}</p>
        <Link href="/" className="px-4 py-2 bg-zinc-800 rounded-lg hover:bg-violet-600 transition-colors text-white">
          Volver al Inicio
        </Link>
      </div>
    );
  }

  // ✅ Preparamos la lista completa de cines (solo nombre e ID) para pasarle al Select
  const allCinemasList = movie.cinemas.map((cg: CinemaGroup) => ({
    id: cg.cinema.id,
    name: cg.cinema.name,
  }));

  // ✅ Filtramos la grilla de funciones si hay un cine seleccionado en la URL
  const filteredCinemas = cinemaId && cinemaId !== 'all'
    ? movie.cinemas.filter((cg: CinemaGroup) => cg.cinema.id.toString() === cinemaId)
    : movie.cinemas;

  const displayDate = date 
    ? format(new Date(date), "EEEE d 'de' MMMM", { locale: es })
    : 'Hoy';

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 pb-20">
      
     {/* --- BACKDROP ATMOSFÉRICO --- */}
      <div className="relative w-full h-[50vh] md:h-[60vh] overflow-hidden">
        <Image
          src={movie.posterUrl}
          alt="Backdrop"
          fill
          className="object-cover blur-2xl opacity-40 scale-110"
          priority
        />
        <div className="absolute inset-0 bg-linear-to-b from-transparent via-zinc-950/60 to-zinc-950" />
        
        <div className="absolute bottom-0 left-0 w-full pb-8 z-10">
          <div className="container mx-auto px-4 md:px-6 flex flex-col md:flex-row gap-6 items-end">
            <div className="relative w-32 md:w-56 aspect-2/3 rounded-xl overflow-hidden shadow-2xl border border-white/10 mx-auto md:mx-0 shrink-0">
              <Image src={movie.posterUrl} alt={movie.title} fill className="object-cover" />
            </div>
            
            <div className="flex-1 text-center md:text-left mb-2 md:mb-4">
              <h1 className="text-3xl md:text-5xl font-black text-white drop-shadow-lg mb-2 leading-tight">
                {movie.title}
              </h1>
              <p className="text-zinc-300 text-sm md:text-lg max-w-2xl text-balance drop-shadow-md">
                  ¡Disfrutá la cartelera actualizada en tiempo real!
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* --- CONTENIDO PRINCIPAL --- */}
      <div className="container mx-auto px-4 md:px-6 mt-8">
        
        {/* ✅ FILTROS: Fecha y Cine alineados */}
        <div className="mb-8 flex flex-col md:flex-row gap-4 md:items-end bg-zinc-900/30 p-4 rounded-2xl border border-white/5">
            <div>
              <h2 className="text-xs uppercase tracking-widest text-zinc-500 font-bold mb-2 ml-1">Elige tu día</h2>
              <DateSelector movieId={movie.id} />
            </div>
            
            <div className="md:ml-auto w-full md:w-auto mt-2 md:mt-0">
              <h2 className="text-xs uppercase tracking-widest text-zinc-500 font-bold mb-2 ml-1">Filtrar por Cine</h2>
              {/* Le pasamos la lista completa de cines para que pueda elegir */}
              <CinemaSelector cinemas={allCinemasList} movieId={movie.id} />
            </div>
        </div>

        <div className="flex items-center gap-2 mb-6 border-b border-zinc-800 pb-4">
            <Ticket className="text-violet-500" />
            <h2 className="text-xl font-bold capitalize text-zinc-100">
                Funciones para <span className="text-violet-400">{displayDate}</span>
            </h2>
        </div>

        <div className="grid gap-4 md:gap-6">
            {/* ✅ Rendereamos la lista ya FILTRADA */}
            {filteredCinemas.length === 0 ? (
                <div className="p-8 text-center bg-zinc-900/50 rounded-xl border border-dashed border-zinc-800">
                    <p className="text-zinc-500">No hay funciones disponibles para esta selección 😢</p>
                </div>
            ) : (
                filteredCinemas.map((cinemaGroup: CinemaGroup) => (
                    <div 
                        key={cinemaGroup.cinema.id} 
                        className="bg-zinc-900/40 border border-white/5 rounded-2xl p-4 md:p-6 hover:border-violet-500/30 transition-colors"
                    >
                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 mb-4">
                            <div className="flex items-start gap-3">
                                <div className="w-10 h-10 rounded-full bg-zinc-800 flex items-center justify-center text-violet-400 shrink-0">
                                    <MapPin size={20} />
                                </div>
                                <div>
                                    <h3 className="text-lg font-bold text-white">
                                        {cinemaGroup.cinema.name}
                                    </h3>
                                    <span className="text-xs text-zinc-500 flex items-center gap-1">
                                        {cinemaGroup.cinema.address || 'Ver ubicación'} 
                                    </span>
                                </div>
                            </div>
                        </div>

                        <div className="flex flex-wrap gap-2">
                            {cinemaGroup.functions.map((show: FunctionItem) => {
                                const time = format(new Date(show.time), 'HH:mm');
                                return (
                                    <a
                                        key={show.id}
                                        href={show.url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="group relative overflow-hidden bg-zinc-800 hover:bg-violet-600 text-zinc-300 hover:text-white rounded-lg px-4 py-2 transition-all duration-300 flex flex-col items-center min-w-20"
                                    >
                                        <span className="text-lg font-bold">{time}</span>
                                        <div className="flex gap-1 text-[10px] font-medium uppercase tracking-wide opacity-70">
                                            <span>{show.format}</span>
                                            <span>•</span>
                                            <span>{show.language.substring(0, 3)}</span>
                                        </div>
                                    </a>
                                );
                            })}
                        </div>
                    </div>
                ))
            )}
        </div>

      </div>
    </div>
  );
}