'use client';

import { useState } from 'react';
import Image from 'next/image';
import { Dialog } from 'radix-ui';
import { motion } from 'framer-motion';
import { Ticket, Info, X } from 'lucide-react';
import Link from 'next/link';

import { Movie } from '@/types/movie';
import { UpcomingMovie } from '@/lib/api';
import { buildMovieDetailHref } from '@/lib/navigation';

interface MovieCardProps {
  movie: Movie | UpcomingMovie;
  priority?: boolean;
  variant?: 'now-playing' | 'upcoming';
  cinemaId?: string;
  date?: string;
}

export default function MovieCard({
  movie,
  priority = false,
  variant = 'now-playing',
  cinemaId,
  date,
}: MovieCardProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const movieUrl = buildMovieDetailHref(movie.id, { cinemaId, date });

  const isUpcoming = variant === 'upcoming';
  const upcomingData = isUpcoming ? (movie as UpcomingMovie) : null;
  const isReRelease = upcomingData?.isReRelease;

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

  const formattedDate =
    isUpcoming && upcomingData?.releaseDate
      ? new Date(upcomingData.releaseDate).toLocaleDateString('es-AR', {
          day: 'numeric',
          month: 'long',
          timeZone: 'UTC',
        })
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
        <span
          className={`px-2 py-0.5 text-[10px] font-bold ${badgeColor} text-white rounded-md shadow-lg`}
        >
          {badgeText}
        </span>
      </div>
    </>
  );

  return (
    <Dialog.Root open={isModalOpen} onOpenChange={setIsModalOpen}>
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
          <Link
            href={movieUrl}
            className="block relative aspect-2/3 overflow-hidden"
          >
            {posterContent}
          </Link>
        )}

        <div className="p-3 flex flex-col flex-1 justify-between">
          <div>
            <h3 className="font-semibold text-zinc-100 text-sm md:text-base line-clamp-2 leading-tight group-hover:text-violet-400 transition-colors">
              {movie.title}
            </h3>

            {!isUpcoming && (movie as Movie).cinemaCount ? (
              <p className="text-xs text-zinc-400 mt-1 font-medium">
                {(movie as Movie).cinemaCount}{' '}
                {(movie as Movie).cinemaCount === 1 ? 'cine' : 'cines'}
              </p>
            ) : null}

            {isUpcoming && formattedDate && (
              <p className="text-xs text-zinc-400 mt-1 font-medium">
                {isReRelease
                  ? 'Vuelve a los cines'
                  : `Llega el ${formattedDate}`}
              </p>
            )}
          </div>

          {isUpcoming ? (
            <Dialog.Trigger asChild>
              <button
                type="button"
                aria-label={`Ver sinopsis de ${movie.title}`}
                className="mt-3 w-full flex items-center justify-center gap-2 bg-zinc-800 hover:bg-fuchsia-600 text-zinc-300 hover:text-white text-xs font-medium py-2 rounded-lg transition-all duration-300 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fuchsia-500"
              >
                <ButtonIcon size={14} aria-hidden="true" />
                {buttonText}
              </button>
            </Dialog.Trigger>
          ) : (
            <Link
              href={movieUrl}
              className="mt-3 w-full flex items-center justify-center gap-2 bg-zinc-800 hover:bg-violet-600 text-zinc-300 hover:text-white text-xs font-medium py-2 rounded-lg transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
            >
              <ButtonIcon size={14} aria-hidden="true" />
              {buttonText}
            </Link>
          )}
        </div>
      </motion.div>

      {isUpcoming && (
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-9998 bg-black/80 backdrop-blur-sm" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-9999 w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 bg-zinc-950 border border-zinc-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] focus:outline-none">
            <div className="flex justify-between items-start p-6 border-b border-zinc-800/50">
              <div>
                <Dialog.Title className="text-xl sm:text-2xl font-bold text-zinc-100 pr-4 leading-tight">
                  {movie.title}
                </Dialog.Title>
                <div className="flex items-center gap-2 mt-2">
                  <span
                    className={`px-2 py-0.5 text-[10px] font-bold ${badgeColor} text-white rounded-md`}
                  >
                    {badgeText}
                  </span>
                  {formattedDate && (
                    <span className="text-sm text-zinc-400 font-medium">
                      {isReRelease
                        ? `Reestreno: ${formattedDate}`
                        : `Estreno: ${formattedDate}`}
                    </span>
                  )}
                </div>
              </div>
              <Dialog.Close asChild>
                <button
                  type="button"
                  aria-label="Cerrar detalle de estreno"
                  className="p-1.5 bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-white rounded-full transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
                >
                  <X size={20} aria-hidden="true" />
                </button>
              </Dialog.Close>
            </div>

            <div className="p-6 overflow-y-auto custom-scrollbar">
              <h3 className="text-sm font-semibold text-zinc-500 mb-2 uppercase tracking-wider">
                Sinopsis
              </h3>
              <Dialog.Description className="text-zinc-300 text-sm sm:text-base leading-relaxed">
                {upcomingData?.overview ||
                  'Todavía no hay una sinopsis oficial disponible para esta película.'}
              </Dialog.Description>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      )}
    </Dialog.Root>
  );
}
