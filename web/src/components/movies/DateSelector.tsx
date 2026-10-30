'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { clsx } from 'clsx';
import { motion } from 'framer-motion';
import { buildDateRange, getTodayArgentina } from '@/lib/dates';

export default function DateSelector({ movieId }: { movieId: number }) {
  const searchParams = useSearchParams();

  const selectedDate = searchParams.get('date') ?? getTodayArgentina();
  const days = buildDateRange(7);

  return (
    <div className="w-full overflow-x-auto pb-4 pt-2 no-scrollbar">
      <div className="flex gap-3 min-w-max px-1">
        {days.map((dateString, i) => {
          const isSelected = dateString === selectedDate;
          const date = parseISO(dateString);

          const dayName =
            i === 0
              ? 'HOY'
              : i === 1
                ? 'MAÑANA'
                : format(date, 'EEE', { locale: es }).toUpperCase();

          // Preserve other filters (e.g. cinemaId) when switching day
          const params = new URLSearchParams(searchParams.toString());
          params.set('date', dateString);

          return (
            <Link
              key={dateString}
              href={`/movie/${movieId}?${params.toString()}`}
              scroll={false}
              className="relative"
            >
              <div
                className={clsx(
                  'flex flex-col items-center justify-center w-16 h-16 rounded-xl border transition-all duration-300 cursor-pointer',
                  isSelected
                    ? 'bg-violet-600 border-violet-500 text-white shadow-[0_0_15px_rgba(124,58,237,0.5)]'
                    : 'bg-zinc-900/50 border-zinc-800 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200',
                )}
              >
                <span className="text-[10px] font-bold tracking-wider">
                  {dayName}
                </span>
                <span className="text-xl font-bold">{format(date, 'd')}</span>
              </div>

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
