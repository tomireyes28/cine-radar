'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { isValidPositiveInt4 } from '@/lib/dates';

interface Cinema {
  id: number;
  name: string;
}

interface CinemaSelectorProps {
  cinemas: Cinema[];
  movieId: number;
}

export default function CinemaSelector({
  cinemas,
  movieId,
}: CinemaSelectorProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const rawCinemaId = searchParams.get('cinemaId');
  const currentCinemaId = isValidPositiveInt4(rawCinemaId)
    ? rawCinemaId
    : 'all';

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newCinemaId = e.target.value;
    const params = new URLSearchParams(searchParams.toString());

    if (newCinemaId === 'all') {
      params.delete('cinemaId'); // Si elige "Todos", sacamos el filtro de la URL
    } else {
      params.set('cinemaId', newCinemaId);
    }

    // Navegamos a la misma página pero con la URL actualizada (sin perder la fecha)
    const query = params.toString();
    router.push(query ? `/movie/${movieId}?${query}` : `/movie/${movieId}`);
  };

  return (
    <select
      aria-label="Filtrar horarios por complejo de cine"
      value={currentCinemaId}
      onChange={handleChange}
      className="bg-zinc-900 border border-zinc-700 text-zinc-100 text-sm md:text-base rounded-xl px-4 py-2 hover:border-violet-500 focus:outline-hidden focus:border-violet-500 focus:ring-1 focus:ring-violet-500 transition-colors cursor-pointer w-full md:w-auto"
    >
      <option value="all">Todos los cines</option>
      {cinemas.map((cinema) => (
        <option key={cinema.id} value={cinema.id.toString()}>
          {cinema.name}
        </option>
      ))}
    </select>
  );
}
