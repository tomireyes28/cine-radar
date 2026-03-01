'use client';

import Image from 'next/image';
import { motion } from 'framer-motion';
import { Ticket, Info } from 'lucide-react'; 
import Link from 'next/link';

// ✅ Importamos tus interfaces exactas
import { Movie } from '@/types/movie';
import { UpcomingMovie } from '@/lib/api';

// ✅ TypeScript feliz: puede ser una película normal o un estreno
interface MovieCardProps {
  movie: Movie | UpcomingMovie; 
  priority?: boolean;
  variant?: 'now-playing' | 'upcoming'; 
}

export default function MovieCard({ movie, priority = false, variant = 'now-playing' }: MovieCardProps) {
  const isUpcoming = variant === 'upcoming';
  
  // ✅ Casteamos la película a UpcomingMovie solo si estamos en esa variante
  // Esto permite acceder a overview y releaseDate sin que TypeScript tire error.
  const upcomingData = isUpcoming ? (movie as UpcomingMovie) : null;
  const isReRelease = upcomingData?.isReRelease;
  
  // Variables dinámicas según la variante y si es reestreno
  let badgeText = 'CARTELERA';
  let badgeColor = 'bg-violet-600';
  let buttonText = 'Ver Horarios';
  let ButtonIcon = Ticket;

  if (isUpcoming) {
    badgeText = isReRelease ? 'REESTRENO' : 'ESTRENO';
    badgeColor = isReRelease ? 'bg-amber-500' : 'bg-fuchsia-600';
    buttonText = 'Ver Sinopsis';
    ButtonIcon = Info;
  }

  // ✅ Separamos el contenido visual del póster para no duplicar código
  const posterContent = (
    <>
      {movie.posterUrl ? (
        <Image
          src={movie.posterUrl}
          alt={movie.title}
          fill
          sizes="(max-width: 768px) 50vw, (max-width: 1200px) 25vw, 20vw"
          className="object-cover transition-transform duration-500 group-hover:scale-105"
          priority={priority}
        />
      ) : (
        <div className="flex items-center justify-center w-full h-full bg-zinc-800 text-zinc-500 text-sm">
          Sin póster
        </div>
      )}
      
      {/* Overlay con degradado */}
      <div className="absolute inset-0 bg-linear-to-t from-zinc-950 via-transparent to-transparent opacity-60" />
      
      {/* Badge dinámico */}
      <div className="absolute top-2 right-2 flex gap-1">
        <span className={`px-2 py-0.5 text-[10px] font-bold ${badgeColor} text-white rounded-md shadow-lg`}>
          {badgeText}
        </span>
      </div>
    </>
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -5 }}
      transition={{ duration: 0.3 }}
      className="group relative flex flex-col bg-zinc-900/50 border border-white/5 rounded-xl overflow-hidden shadow-sm hover:shadow-violet-500/20 hover:border-violet-500/30 transition-colors h-full"
    >
      {/* ✅ Wrapper Condicional Limpio: Link si es cartelera, div si es estreno */}
      {isUpcoming ? (
        <div className="block relative aspect-2/3 overflow-hidden">
          {posterContent}
        </div>
      ) : (
        <Link href={`/movie/${movie.id}`} className="block relative aspect-2/3 overflow-hidden">
          {posterContent}
        </Link>
      )}

      <div className="p-3 flex flex-col flex-1 justify-between">
        <div>
          <h3 className="font-semibold text-zinc-100 text-sm md:text-base line-clamp-2 leading-tight group-hover:text-violet-400 transition-colors">
            {movie.title}
          </h3>
          
          {/* ✅ Lógica de fecha y reestreno */}
          {isUpcoming && upcomingData?.releaseDate && (
            <p className="text-xs text-zinc-400 mt-1 font-medium">
              {isReRelease 
                ? 'Vuelve a los cines' 
                : `Llega el ${new Date(upcomingData.releaseDate).toLocaleDateString('es-AR', { day: 'numeric', month: 'long', timeZone: 'UTC' })}`
              }
            </p>
          )}
        </div>

        {/* ✅ Botón dinámico */}
        {isUpcoming ? (
          <button 
            onClick={() => alert(`Sinopsis: ${upcomingData?.overview}`)}
            className="mt-3 w-full flex items-center justify-center gap-2 bg-zinc-800 hover:bg-fuchsia-600 text-zinc-300 hover:text-white text-xs font-medium py-2 rounded-lg transition-all duration-300"
          >
            <ButtonIcon size={14} />
            {buttonText}
          </button>
        ) : (
          <Link 
            href={`/movie/${movie.id}`}
            className="mt-3 w-full flex items-center justify-center gap-2 bg-zinc-800 hover:bg-violet-600 text-zinc-300 hover:text-white text-xs font-medium py-2 rounded-lg transition-all duration-300"
          >
            <ButtonIcon size={14} />
            {buttonText}
          </Link>
        )}
      </div>
    </motion.div>
  );
}