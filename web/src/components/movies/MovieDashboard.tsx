'use client';

import { useState } from 'react';
import { Movie } from '@/types/movie';
import MovieCard from './MovieCard';
import { Search } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface MovieDashboardProps {
  initialMovies: Movie[];
}

export default function MovieDashboard({ initialMovies }: MovieDashboardProps) {
  const [searchTerm, setSearchTerm] = useState('');

  // Lógica de filtrado en tiempo real
  const filteredMovies = initialMovies.filter((movie) =>
    movie.title.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="w-full">
      {/* --- BARRA DE BÚSQUEDA FLOTANTE --- */}
      <div className="sticky top-20 z-30 mb-8 max-w-xl mx-auto">
        <div className="relative group">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <Search className="h-5 w-5 text-zinc-500 group-focus-within:text-violet-500 transition-colors" />
          </div>
          <input
            type="text"
            placeholder="Buscar película..."
            className="block w-full pl-10 pr-3 py-3 border border-zinc-800 rounded-xl leading-5 bg-zinc-950/80 backdrop-blur-md text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-violet-500 sm:text-sm shadow-xl transition-all"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      {/* --- GRID DE RESULTADOS --- */}
      <motion.div layout className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 md:gap-6 mb-24">
        <AnimatePresence>
          {filteredMovies.map((movie, index) => (
            <MovieCard 
              key={movie.id} 
              movie={movie} 
              priority={index < 5} 
            />
          ))}
        </AnimatePresence>
      </motion.div>

      {/* --- STATE VACÍO --- */}
      {filteredMovies.length === 0 && (
        <div className="text-center py-20">
          <p className="text-zinc-500 text-lg">No encontramos nada con &quot;{searchTerm}&quot; 😔</p>
          <button 
            onClick={() => setSearchTerm('')}
            className="mt-4 text-violet-400 hover:text-violet-300 text-sm font-medium"
          >
            Limpiar búsqueda
          </button>
        </div>
      )}
    </div>
  );
}