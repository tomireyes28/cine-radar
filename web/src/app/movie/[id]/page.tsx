import Image from 'next/image';
import Link from 'next/link';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { Clock, MapPin, Star, Ticket } from 'lucide-react';
import { getMovieDetail } from '@/lib/api';
import { formatTimeAR, getTodayArgentina } from '@/lib/dates';
import DateSelector from '@/components/movies/DateSelector';
import CinemaSelector from '@/components/movies/CinemaSelector';
import { CinemaGroup } from '@/types/movie';

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ date?: string; cinemaId?: string }>;
}

export async function generateMetadata({ params }: Pick<PageProps, 'params'>) {
  const { id } = await params;
  const movie = await getMovieDetail(id);
  return {
    title: movie ? `${movie.title} | Cine Radar` : 'Película no encontrada | Cine Radar',
    description: movie?.overview ?? undefined,
  };
}

export default async function MovieDetailPage({
  params,
  searchParams,
}: PageProps) {
  const { id } = await params;
  const { date, cinemaId } = await searchParams;

  const movie = await getMovieDetail(id, date);

  if (!movie) {
    return (
      <div className="flex flex-col items-center justify-center py-32 text-zinc-400 gap-4">
        <span className="text-4xl">😔</span>
        <h1 className="text-xl font-medium">No encontramos esa película</h1>
        <Link
          href="/"
          className="px-4 py-2 bg-zinc-800 rounded-lg hover:bg-violet-600 transition-colors text-white"
        >
          Volver al inicio
        </Link>
      </div>
    );
  }

  const allCinemasList = movie.cinemas.map((cg: CinemaGroup) => ({
    id: cg.cinema.id,
    name: cg.cinema.name,
  }));

  const filteredCinemas =
    cinemaId && cinemaId !== 'all'
      ? movie.cinemas.filter((cg) => cg.cinema.id.toString() === cinemaId)
      : movie.cinemas;

  const selectedDate = date ?? getTodayArgentina();
  const displayDate = format(parseISO(selectedDate), "EEEE d 'de' MMMM", {
    locale: es,
  });

  const heroImage = movie.backdropUrl ?? movie.posterUrl;
  const releaseYear = movie.releaseDate?.slice(0, 4);

  return (
    <div className="text-zinc-100 pb-20">
      {/* Hero */}
      <div className="relative w-full h-[55vh] md:h-[60vh] overflow-hidden -mt-20">
        {heroImage ? (
          <Image
            src={heroImage}
            alt=""
            fill
            sizes="100vw"
            className="object-cover opacity-40"
            priority
          />
        ) : (
          <div className="absolute inset-0 bg-linear-to-br from-violet-950 to-zinc-950" />
        )}
        <div className="absolute inset-0 bg-linear-to-b from-zinc-950/40 via-zinc-950/70 to-zinc-950" />

        <div className="absolute bottom-0 left-0 w-full pb-8 z-10">
          <div className="container mx-auto px-4 md:px-6 flex flex-col md:flex-row gap-6 items-end">
            <div className="relative w-32 md:w-56 aspect-2/3 rounded-xl overflow-hidden shadow-2xl border border-white/10 mx-auto md:mx-0 shrink-0 bg-zinc-800">
              {movie.posterUrl ? (
                <Image
                  src={movie.posterUrl}
                  alt={movie.title}
                  fill
                  sizes="(max-width: 768px) 128px, 224px"
                  className="object-cover"
                />
              ) : (
                <div className="flex items-center justify-center h-full text-zinc-500 text-sm">
                  Sin póster
                </div>
              )}
            </div>

            <div className="flex-1 text-center md:text-left mb-2 md:mb-4">
              <h1 className="text-3xl md:text-5xl font-black text-white drop-shadow-lg mb-3 leading-tight">
                {movie.title}
              </h1>

              <div className="flex flex-wrap items-center justify-center md:justify-start gap-x-4 gap-y-2 text-sm text-zinc-300 mb-4">
                {releaseYear && <span>{releaseYear}</span>}
                {movie.duration ? (
                  <span className="flex items-center gap-1">
                    <Clock size={14} /> {movie.duration} min
                  </span>
                ) : null}
                {movie.rating && Number(movie.rating) > 0 ? (
                  <span className="flex items-center gap-1">
                    <Star size={14} className="text-amber-400" /> {movie.rating}
                  </span>
                ) : null}
              </div>

              {movie.genres && movie.genres.length > 0 && (
                <div className="flex flex-wrap justify-center md:justify-start gap-2 mb-4">
                  {movie.genres.map((genre) => (
                    <span
                      key={genre}
                      className="px-2.5 py-1 text-xs rounded-full bg-white/10 border border-white/10"
                    >
                      {genre}
                    </span>
                  ))}
                </div>
              )}

              {movie.overview && (
                <p className="text-zinc-300 text-sm md:text-base max-w-3xl text-pretty line-clamp-4">
                  {movie.overview}
                </p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Showtimes */}
      <div className="container mx-auto px-4 md:px-6 mt-8">
        <div className="mb-8 flex flex-col md:flex-row gap-4 md:items-end bg-zinc-900/30 p-4 rounded-2xl border border-white/5">
          <div>
            <h2 className="text-xs uppercase tracking-widest text-zinc-500 font-bold mb-2 ml-1">
              Elegí tu día
            </h2>
            <DateSelector movieId={movie.id} />
          </div>

          <div className="md:ml-auto w-full md:w-auto mt-2 md:mt-0">
            <h2 className="text-xs uppercase tracking-widest text-zinc-500 font-bold mb-2 ml-1">
              Filtrar por cine
            </h2>
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
          {filteredCinemas.length === 0 ? (
            <div className="p-8 text-center bg-zinc-900/50 rounded-xl border border-dashed border-zinc-800">
              <p className="text-zinc-500">
                No hay funciones disponibles para esta selección 😢
              </p>
            </div>
          ) : (
            filteredCinemas.map((group) => (
              <div
                key={group.cinema.id}
                className="bg-zinc-900/40 border border-white/5 rounded-2xl p-4 md:p-6 hover:border-violet-500/30 transition-colors"
              >
                <div className="flex items-start gap-3 mb-4">
                  <div className="w-10 h-10 rounded-full bg-zinc-800 flex items-center justify-center text-violet-400 shrink-0">
                    <MapPin size={20} />
                  </div>
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-lg font-bold text-white">
                        {group.cinema.name}
                      </h3>
                      {group.cinema.chain?.name && (
                        <span className="px-2 py-0.5 text-[10px] font-bold rounded-md bg-zinc-800 text-zinc-300">
                          {group.cinema.chain.name}
                        </span>
                      )}
                    </div>
                    <span className="text-xs text-zinc-500">
                      {group.cinema.address || 'Ver ubicación'}
                    </span>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  {group.functions.map((show) => (
                    <a
                      key={show.id}
                      href={show.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="bg-zinc-800 hover:bg-violet-600 text-zinc-300 hover:text-white rounded-lg px-4 py-2 transition-all duration-300 flex flex-col items-center min-w-20"
                    >
                      <span className="text-lg font-bold">
                        {formatTimeAR(show.time)}
                      </span>
                      <div className="flex gap-1 text-[10px] font-medium uppercase tracking-wide opacity-70">
                        <span>{show.format}</span>
                        <span>•</span>
                        <span>{show.language.substring(0, 3)}</span>
                      </div>
                    </a>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
