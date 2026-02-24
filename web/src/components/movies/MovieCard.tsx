'use client';

import Image from 'next/image';
import { Movie } from '@/types/movie';
import { motion } from 'framer-motion';
import { Ticket } from 'lucide-react';
import Link from 'next/link';

interface MovieCardProps {
  movie: Movie;
  priority?: boolean; // Para optimizar la carga de las primeras imágenes
}

export default function MovieCard({ movie, priority = false }: MovieCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -5 }} // Efecto de levitación al pasar el mouse
      transition={{ duration: 0.3 }}
      className="group relative flex flex-col bg-zinc-900/50 border border-white/5 rounded-xl overflow-hidden shadow-sm hover:shadow-violet-500/20 hover:border-violet-500/30 transition-colors"
    >
      <Link href={`/movie/${movie.id}`} className="block relative aspect-2/3 overflow-hidden">
        {/* Poster */}
        <Image
          src={movie.posterUrl}
          alt={movie.title}
          fill
          sizes="(max-width: 768px) 50vw, (max-width: 1200px) 25vw, 20vw"
          className="object-cover transition-transform duration-500 group-hover:scale-105"
          priority={priority}
        />
        
        {/* Overlay con degradado (para que el texto se lea bien) */}
        <div className="absolute inset-0 bg-linear-to-t from-zinc-950 via-transparent to-transparent opacity-60" />
        
        {/* Badge de Formatos (Si tuviera info de formatos, la pondríamos acá) */}
        <div className="absolute top-2 right-2 flex gap-1">
             {/* Acá podríamos poner badges dinámicos tipo "3D" o "IMAX" */}
             <span className="px-2 py-0.5 text-[10px] font-bold bg-violet-600 text-white rounded-md shadow-lg">
                CARTELERA
             </span>
        </div>
      </Link>

      {/* Info */}
      <div className="p-3 flex flex-col flex-1 justify-between">
        <div>
          <h3 className="font-semibold text-zinc-100 text-sm md:text-base line-clamp-2 leading-tight group-hover:text-violet-400 transition-colors">
            {movie.title}
          </h3>
        </div>

        <Link 
            href={`/movie/${movie.id}`}
            className="mt-3 w-full flex items-center justify-center gap-2 bg-zinc-800 hover:bg-violet-600 text-zinc-300 hover:text-white text-xs font-medium py-2 rounded-lg transition-all duration-300"
        >
            <Ticket size={14} />
            Ver Horarios
        </Link>
      </div>
    </motion.div>
  );
}