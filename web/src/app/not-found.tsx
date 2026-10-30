import Link from 'next/link';
import { Film, Home } from 'lucide-react';

export default function NotFound() {
  return (
    <div className="container mx-auto px-4 min-h-[60vh] flex flex-col items-center justify-center text-center py-16">
      <div className="w-16 h-16 rounded-2xl bg-zinc-900 border border-zinc-800 flex items-center justify-center text-violet-400 mb-6">
        <Film size={32} />
      </div>

      <span className="text-violet-400 font-bold text-sm tracking-wider uppercase mb-2">
        Error 404
      </span>
      <h1 className="text-3xl md:text-5xl font-bold text-zinc-100 mb-3">
        Película o página no encontrada
      </h1>
      <p className="text-zinc-400 max-w-md mb-8 text-sm md:text-base">
        La función que estás buscando no existe o fue retirada de cartelera.
      </p>

      <Link
        href="/"
        className="flex items-center gap-2 px-6 py-3 rounded-xl bg-violet-600 hover:bg-violet-500 text-white font-medium transition-colors shadow-lg shadow-violet-900/30"
      >
        <Home size={18} />
        Volver a la cartelera
      </Link>
    </div>
  );
}
