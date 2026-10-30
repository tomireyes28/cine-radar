import Image from 'next/image';
import Link from 'next/link';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { Clock, MapPin, Star, Ticket } from 'lucide-react';
import { clsx } from 'clsx';
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
  if (!movie) {
    return {
      title: 'Película no encontrada | Cine Radar',
      description: 'La función solicitada no está disponible en cartelera.',
    };
  }

  const heroImage = movie.backdropUrl || movie.posterUrl || '/logo.png';
  const description =
    movie.overview ||
    `Cartelera, horarios y cines para ver ${movie.title} en Argentina.`;

  return {
    title: `${movie.title} | Cartelera y Horarios | Cine Radar`,
    description,
    openGraph: {
      title: `${movie.title} | Cine Radar`,
      description,
      images: [
        {
          url: heroImage,
          width: 1200,
          height: 630,
          alt: movie.title,
        },
      ],
      type: 'video.movie',
    },
    twitter: {
      card: 'summary_large_image',
      title: `${movie.title} | Cine Radar`,
      description,
      images: [heroImage],
    },
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
  const isViewingToday = selectedDate === getTodayArgentina();
  const now = new Date();

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
          <div className="w-full h-full bg-zinc-900" />
        )}
        <div className="absolute inset-0 bg-linear-to-t from-background via-background/60 to-transparent" />
      </div>

      <div className="container mx-auto px-4 md:px-6 -mt-36 md:-mt-48 relative z-10">
        {/* Info header */}
        <div className="flex flex-col md:flex-row gap-6 md:gap-8 items-start mb-10">
          {movie.posterUrl ? (
            <div className="relative w-36 md:w-56 aspect-2/3 rounded-xl overflow-hidden shadow-2xl border border-white/10 shrink-0 mx-auto md:mx-0">
              <Image
                src={movie.posterUrl}
                alt={movie.title}
                fill
                sizes="(max-width: 768px) 144px, 224px"
                className="object-cover"
                priority
              />
            </div>
          ) : null}

          <div className="flex-1 space-y-3">
            <h1 className="text-3xl md:text-5xl font-extrabold text-white tracking-tight">
              {movie.title}
            </h1>

            <div className="flex flex-wrap items-center gap-3 text-xs md:text-sm text-zinc-400">
              {releaseYear && (
                <span className="px-2.5 py-0.5 rounded-full bg-zinc-800 text-zinc-300 font-medium">
                  {releaseYear}
                </span>
              )}
              {movie.duration ? (
                <span className="flex items-center gap-1">
                  <Clock size={14} className="text-violet-400" />
                  {movie.duration} min
                </span>
              ) : null}
              {movie.rating ? (
                <span className="flex items-center gap-1 font-semibold text-amber-400">
                  <Star size={14} className="fill-amber-400 text-amber-400" />
                  {movie.rating}
                </span>
              ) : null}
            </div>

            {movie.genres && movie.genres.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {movie.genres.map((genre) => (
                  <span
                    key={genre}
                    className="px-2.5 py-0.5 text-xs rounded-full bg-violet-950/60 text-violet-300 border border-violet-800/40"
                  >
                    {genre}
                  </span>
                ))}
              </div>
            )}

            {movie.overview && (
              <p className="text-zinc-300 text-sm md:text-base leading-relaxed max-w-3xl pt-2">
                {movie.overview}
              </p>
            )}
          </div>
        </div>

        {/* Date and cinema filters */}
        <div className="space-y-4 mb-8">
          <div>
            <p className="text-xs uppercase tracking-wider text-zinc-400 font-bold mb-2">
              Día
            </p>
            <DateSelector movieId={movie.id} />
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2">
            <div>
              <p className="text-xs uppercase tracking-wider text-zinc-400 font-bold mb-1">
                Filtrar por complejo
              </p>
              <p className="text-xs text-zinc-500">
                {movie.cinemas.length}{' '}
                {movie.cinemas.length === 1 ? 'complejo disponible' : 'complejos disponibles'}
              </p>
            </div>
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
                  {group.functions.map((show) => {
                    const isPast = isViewingToday && new Date(show.time) < now;

                    return (
                      <a
                        key={show.id}
                        href={isPast ? undefined : show.url || '#'}
                        target={isPast ? undefined : '_blank'}
                        rel={isPast ? undefined : 'noopener noreferrer'}
                        aria-disabled={isPast}
                        className={clsx(
                          'rounded-lg px-4 py-2 transition-all duration-300 flex flex-col items-center min-w-20',
                          isPast
                            ? 'bg-zinc-900/40 border border-zinc-800 text-zinc-600 cursor-not-allowed opacity-45'
                            : 'bg-zinc-800 hover:bg-violet-600 text-zinc-300 hover:text-white cursor-pointer shadow-sm',
                        )}
                        title={isPast ? 'Función ya finalizada' : 'Comprar entradas'}
                      >
                        <span
                          className={clsx(
                            'text-lg font-bold',
                            isPast && 'line-through decoration-zinc-700',
                          )}
                        >
                          {formatTimeAR(show.time)}
                        </span>
                        <div className="flex gap-1 text-[10px] font-medium uppercase tracking-wide opacity-70">
                          <span>{show.format}</span>
                          <span>•</span>
                          <span>{show.language.substring(0, 3)}</span>
                          {isPast && <span>(Fin)</span>}
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
