import Image from 'next/image';
import { getMovieDetail } from '@/lib/api';
import DateSelector from '@/components/movies/DateSelector';
import { MapPin, Ticket } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import Link from 'next/link';

// --- DEFINICIÓN DE TIPOS ---
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
  params: Promise<{ id: string }>; // <--- AHORA ES UNA PROMESA
  searchParams: Promise<{ date?: string }>; // <--- ESTO TAMBIÉN
}

export default async function MovieDetailPage({ params, searchParams }: PageProps) {
  // 1. Esperamos los parámetros (REQUISITO DE NEXT.JS NUEVO)
  const { id } = await params;
  const { date } = await searchParams;

  // 2. Buscamos los datos con el ID real
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
        {/* Degradado para fundir */}
        <div className="absolute inset-0 bg-linear-to-b from-transparent via-zinc-950/60 to-zinc-950" />
        
        {/* CORRECCIÓN DE ALINEACIÓN AQUÍ 👇 */}
        {/* 1. Div de posicionamiento (se pega al fondo) */}
        <div className="absolute bottom-0 left-0 w-full pb-8 z-10">
          {/* 2. Div de restricción (centra el contenido igual que abajo) */}
          <div className="container mx-auto px-4 md:px-6 flex flex-col md:flex-row gap-6 items-end">
            
            {/* Poster "Flotante" */}
            <div className="relative w-32 md:w-56 aspect-2/3 rounded-xl overflow-hidden shadow-2xl border border-white/10 mx-auto md:mx-0 shrink-0">
              <Image src={movie.posterUrl} alt={movie.title} fill className="object-cover" />
            </div>
            
            {/* Textos */}
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
        
        <div className="mb-8">
            <h2 className="text-sm uppercase tracking-widest text-zinc-500 font-bold mb-4">
                Elige tu día
            </h2>
            <DateSelector movieId={movie.id} />
        </div>

        <div className="flex items-center gap-2 mb-6 border-b border-zinc-800 pb-4">
            <Ticket className="text-violet-500" />
            <h2 className="text-xl font-bold capitalize text-zinc-100">
                Funciones para <span className="text-violet-400">{displayDate}</span>
            </h2>
        </div>

        <div className="grid gap-4 md:gap-6">
            {movie.cinemas.length === 0 ? (
                <div className="p-8 text-center bg-zinc-900/50 rounded-xl border border-dashed border-zinc-800">
                    <p className="text-zinc-500">No hay funciones disponibles para esta fecha 😢</p>
                </div>
            ) : (
                // Usamos el tipo CinemaGroup para eliminar los 'any'
                movie.cinemas.map((cinemaGroup: CinemaGroup) => (
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
                                    <span className="text-xs text-zinc-500 hover:text-violet-400 flex items-center gap-1 transition-colors cursor-pointer">
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