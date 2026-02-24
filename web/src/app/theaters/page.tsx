import { getCinemas } from '@/lib/api';
import { MapPin } from 'lucide-react';
import Link from 'next/link';

interface Cinema {
  id: number;
  name: string;
  address: string | null;
  lat: number;
  lng: number;
}

interface Chain {
  id: number;
  name: string;
  logoUrl: string | null;
  locations: Cinema[]; 
}

type TheatersResponse = Chain[];

export default async function TheatersPage() {
  const data = await getCinemas() as TheatersResponse | null;
  
  const chains = Array.isArray(data) ? data : [];

  return (
    <div className="container mx-auto px-4 md:px-6 py-8">
      
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl md:text-5xl font-bold bg-linear-to-r from-violet-400 to-fuchsia-400 bg-clip-text text-transparent mb-2">
          Nuestros Cines
        </h1>
        <p className="text-zinc-400">
          Encontrá tu complejo favorito entre las principales cadenas del país.
        </p>
      </div>

      {/* Lista de Cadenas */}
      <div className="space-y-12">
        {chains.map((chain) => (
          <div key={chain.id}>
            {/* Título de la Cadena */}
            <div className="flex items-center gap-3 mb-6 border-b border-zinc-800 pb-2">
               <div className="w-8 h-8 rounded-lg bg-zinc-800 flex items-center justify-center font-bold text-violet-400 text-xl">
                  {chain.name[0]}
               </div>
               <h2 className="text-2xl font-bold text-zinc-100">{chain.name}</h2>
            </div>

            {/* Grid de Sucursales */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {/* Ahora usamos .locations 👇 */}
              {chain.locations?.map((cinema) => (
                <Link
                  key={cinema.id}
                  href={`/theaters/${cinema.id}`}
                  className="group block bg-zinc-900/50 border border-zinc-800 hover:border-violet-500/50 rounded-xl p-4 transition-all hover:bg-zinc-900"
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <h3 className="font-bold text-zinc-200 group-hover:text-violet-400 transition-colors">
                        {cinema.name}
                      </h3>
                      <p className="text-xs text-zinc-500 mt-1 flex items-center gap-1">
                        <MapPin size={12} />
                        {cinema.address && cinema.address !== "Ver Web" ? cinema.address : 'Ver ubicación'}
                      </p>
                    </div>
                  </div>
                </Link>
              ))}
            </div>

            {/* Mensaje vacío por cadena */}
            {(!chain.locations || chain.locations.length === 0) && (
                <p className="text-sm text-zinc-600 italic mt-2">No hay sucursales cargadas.</p>
            )}
          </div>
        ))}

        {/* Estado Vacío General */}
        {chains.length === 0 && (
          <div className="text-center py-20 bg-zinc-900/30 rounded-2xl border border-dashed border-zinc-800">
            <p className="text-zinc-500 text-lg">No se encontraron cines.</p>
          </div>
        )}
      </div>
    </div>
  );
}