'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { format, addDays, isSameDay, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { clsx } from 'clsx';
import { motion } from 'framer-motion';

export default function DateSelector({ movieId }: { movieId: number }) {
  const searchParams = useSearchParams();
  
  // Obtenemos la fecha seleccionada de la URL o usamos HOY
  const dateParam = searchParams.get('date');
  const selectedDate = dateParam ? parseISO(dateParam) : new Date();

  // Generamos los próximos 7 días
  const days = Array.from({ length: 7 }).map((_, i) => addDays(new Date(), i));

  return (
    <div className="w-full overflow-x-auto pb-4 pt-2 no-scrollbar">
      <div className="flex gap-3 min-w-max px-1">
        {days.map((date, i) => {
          const isSelected = isSameDay(date, selectedDate);
          const dateString = format(date, 'yyyy-MM-dd');
          
          // Formato visual: "LUN 24"
          const dayName = i === 0 ? 'HOY' : i === 1 ? 'MAÑANA' : format(date, 'EEE', { locale: es }).toUpperCase();
          const dayNumber = format(date, 'd');

          return (
            <Link
              key={dateString}
              href={`/movie/${movieId}?date=${dateString}`}
              scroll={false} // Evita que la página salte hacia arriba al cambiar fecha
              className="relative"
            >
              <div
                className={clsx(
                  "flex flex-col items-center justify-center w-16 h-16 rounded-xl border transition-all duration-300 cursor-pointer",
                  isSelected 
                    ? "bg-violet-600 border-violet-500 text-white shadow-[0_0_15px_rgba(124,58,237,0.5)]" 
                    : "bg-zinc-900/50 border-zinc-800 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
                )}
              >
                <span className="text-[10px] font-bold tracking-wider">{dayName}</span>
                <span className="text-xl font-bold">{dayNumber}</span>
              </div>
              
              {/* Puntito indicador animado */}
              {isSelected && (
                <motion.div 
                  layoutId="active-day"
                  className="absolute -bottom-2 left-0 right-0 h-1 bg-violet-500 rounded-full mx-auto w-4"
                />
              )}
            </Link>
          );
        })}
      </div>
    </div>
  );
}