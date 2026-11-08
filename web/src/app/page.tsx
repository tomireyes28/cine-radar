import { getCinemas, getNowPlaying } from '@/lib/api';
import {
  isValidCalendarDate,
  sanitizePositiveIntParam,
  sanitizeStringParam,
} from '@/lib/dates';
import MovieDashboard from '@/components/movies/MovieDashboard';
import BillboardFilters from '@/components/movies/BillboardFilters';

const ZONES = ['CABA', 'GBA Norte', 'GBA Oeste', 'GBA Sur', 'Interior'];

interface HomeProps {
  searchParams: Promise<{
    zone?: string | string[];
    chainId?: string | string[];
    date?: string | string[];
  }>;
}

export default async function Home({ searchParams }: HomeProps) {
  const rawParams = await searchParams;
  const zone = sanitizeStringParam(rawParams.zone);
  const chainId = sanitizePositiveIntParam(rawParams.chainId);
  const date = isValidCalendarDate(rawParams.date) ? rawParams.date : undefined;

  const [movies, chains] = await Promise.all([
    getNowPlaying({ zone, chainId, date }),
    getCinemas(),
  ]);

  return (
    <div className="container mx-auto px-4 md:px-6">
      <section className="mt-8 md:mt-12 mb-6 text-center md:text-left">
        <h1 className="text-3xl md:text-5xl font-bold bg-linear-to-r from-violet-400 to-fuchsia-400 bg-clip-text text-transparent mb-2">
          En Cartelera
        </h1>
        <p className="text-zinc-400 text-sm md:text-lg">
          {movies.length} películas disponibles hoy.
        </p>
      </section>

      <BillboardFilters
        zones={ZONES}
        chains={(chains ?? []).map(({ id, name }) => ({ id, name }))}
      />

      <MovieDashboard initialMovies={movies} selectedDate={date} />
    </div>
  );
}
