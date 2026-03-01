'use client';

import { useState } from 'react';
import { createPortal } from 'react-dom';
import Image from 'next/image';
import { motion, AnimatePresence } from 'framer-motion';
import { Ticket, Info, X } from 'lucide-react'; 
import Link from 'next/link';

import { Movie } from '@/types/movie';
import { UpcomingMovie } from '@/lib/api';

interface MovieCardProps {
  movie: Movie | UpcomingMovie; 
  priority?: boolean;
  variant?: 'now-playing' | 'upcoming'; 
  cinemaId?: string
}

export default function MovieCard({ movie, priority = false, variant = 'now-playing', cinemaId }: MovieCardProps) {
  // ✅ Estados para controlar el modal y evitar errores de hidratación en Next.js
  const [isModalOpen, setIsModalOpen] = useState(false);
const movieUrl = `/movie/${movie.id}${cinemaId ? `?cinemaId=${cinemaId}` : ''}`;
 

  const isUpcoming = variant === 'upcoming';
  const upcomingData = isUpcoming ? (movie as UpcomingMovie) : null;
  const isReRelease = upcomingData?.isReRelease;
  
  // Variables dinámicas
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

  // Pre-calculamos la fecha para usarla en la tarjeta y en el modal
  const formattedDate = isUpcoming && upcomingData?.releaseDate 
    ? new Date(upcomingData.releaseDate).toLocaleDateString('es-AR', { day: 'numeric', month: 'long', timeZone: 'UTC' })
    : '';

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
      <div className="absolute inset-0 bg-linear-to-t from-zinc-950 via-transparent to-transparent opacity-60" />
      <div className="absolute top-2 right-2 flex gap-1">
        <span className={`px-2 py-0.5 text-[10px] font-bold ${badgeColor} text-white rounded-md shadow-lg`}>
          {badgeText}
        </span>
      </div>
    </>
  );

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        whileHover={{ y: -5 }}
        transition={{ duration: 0.3 }}
        className="group relative flex flex-col bg-zinc-900/50 border border-white/5 rounded-xl overflow-hidden shadow-sm hover:shadow-violet-500/20 hover:border-violet-500/30 transition-colors h-full"
      >
        {isUpcoming ? (
          <div className="block relative aspect-2/3 overflow-hidden">
            {posterContent}
          </div>
        ) : (
          <Link href={movieUrl} className="block relative aspect-2/3 overflow-hidden">
            {posterContent}
          </Link>
        )}

        <div className="p-3 flex flex-col flex-1 justify-between">
          <div>
            <h3 className="font-semibold text-zinc-100 text-sm md:text-base line-clamp-2 leading-tight group-hover:text-violet-400 transition-colors">
              {movie.title}
            </h3>
            
            {isUpcoming && formattedDate && (
              <p className="text-xs text-zinc-400 mt-1 font-medium">
                {isReRelease ? 'Vuelve a los cines' : `Llega el ${formattedDate}`}
              </p>
            )}
          </div>

          {/* ✅ Botón que ahora abre el modal */}
          {isUpcoming ? (
            <button 
              onClick={() => setIsModalOpen(true)}
              className="mt-3 w-full flex items-center justify-center gap-2 bg-zinc-800 hover:bg-fuchsia-600 text-zinc-300 hover:text-white text-xs font-medium py-2 rounded-lg transition-all duration-300 cursor-pointer"
            >
              <ButtonIcon size={14} />
              {buttonText}
            </button>
          ) : (
            <Link 
              href={movieUrl}
              className="mt-3 w-full flex items-center justify-center gap-2 bg-zinc-800 hover:bg-violet-600 text-zinc-300 hover:text-white text-xs font-medium py-2 rounded-lg transition-all duration-300"
            >
              <ButtonIcon size={14} />
              {buttonText}
            </Link>
          )}
        </div>
      </motion.div>

      {/* ✅ EL MODAL (Usando createPortal para que flote por encima de todo) */}
      {isModalOpen && typeof window !== 'undefined' && createPortal(
        <AnimatePresence>
          {isModalOpen && (
            <div className="fixed inset-0 z-9999 flex items-center justify-center p-4 sm:p-6">
              {/* Fondo oscuro con blur que cierra el modal al hacer click */}
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setIsModalOpen(false)}
                className="absolute inset-0 bg-black/80 backdrop-blur-sm cursor-pointer"
              />
              
              {/* Contenedor del Modal */}
              <motion.div 
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 20 }}
                className="relative w-full max-w-lg bg-zinc-950 border border-zinc-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
              >
                {/* Cabecera del modal */}
                <div className="flex justify-between items-start p-6 border-b border-zinc-800/50">
                  <div>
                    <h2 className="text-xl sm:text-2xl font-bold text-zinc-100 pr-4 leading-tight">
                      {movie.title}
                    </h2>
                    <div className="flex items-center gap-2 mt-2">
                      <span className={`px-2 py-0.5 text-[10px] font-bold ${badgeColor} text-white rounded-md`}>
                        {badgeText}
                      </span>
                      {formattedDate && (
                        <span className="text-sm text-zinc-400 font-medium">
                          {isReRelease ? `Reestreno: ${formattedDate}` : `Estreno: ${formattedDate}`}
                        </span>
                      )}
                    </div>
                  </div>
                  <button 
                    onClick={() => setIsModalOpen(false)}
                    className="p-1.5 bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-white rounded-full transition-colors"
                  >
                    <X size={20} />
                  </button>
                </div>

                {/* Cuerpo del modal (Scrollable si la sinopsis es muy larga) */}
                <div className="p-6 overflow-y-auto custom-scrollbar">
                  <h3 className="text-sm font-semibold text-zinc-500 mb-2 uppercase tracking-wider">
                    Sinopsis
                  </h3>
                  <p className="text-zinc-300 text-sm sm:text-base leading-relaxed">
                    {upcomingData?.overview || 'Todavía no hay una sinopsis oficial disponible para esta película.'}
                  </p>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>,
        document.body
      )}
    </>
  );
}