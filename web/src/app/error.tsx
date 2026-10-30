'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { RefreshCcw, Home, AlertTriangle } from 'lucide-react';

export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Cine Radar App Error:', error);
  }, [error]);

  return (
    <div className="container mx-auto px-4 min-h-[60vh] flex flex-col items-center justify-center text-center py-16">
      <div className="w-16 h-16 rounded-2xl bg-violet-600/10 border border-violet-500/20 flex items-center justify-center text-violet-400 mb-6 shadow-lg shadow-violet-900/20">
        <AlertTriangle size={32} />
      </div>

      <h1 className="text-2xl md:text-4xl font-bold text-zinc-100 mb-3">
        Ocurrió un problema inesperado
      </h1>
      <p className="text-zinc-400 max-w-md mb-8 text-sm md:text-base leading-relaxed">
        No pudimos cargar la información en este momento. Puede deberse a un problema de conexión temporal o mantenimiento.
      </p>

      <div className="flex flex-col sm:flex-row gap-3">
        <button
          onClick={() => reset()}
          className="flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-white font-medium transition-colors shadow-lg shadow-violet-900/30 cursor-pointer"
        >
          <RefreshCcw size={16} />
          Reintentar
        </button>
        <Link
          href="/"
          className="flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-medium transition-colors border border-white/5"
        >
          <Home size={16} />
          Volver al Inicio
        </Link>
      </div>

      {error.digest && (
        <p className="text-[11px] text-zinc-600 mt-10 font-mono">
          Código de error: {error.digest}
        </p>
      )}
    </div>
  );
}
