import { getCinemas } from '@/lib/api';
import { MapPin } from 'lucide-react';
import Link from 'next/link';
import NearbyButton from '@/components/theaters/NearbyButton';

// --- INTERFACES ---
interface Cinema {
  id: number;
  name: string;
  address: string | null;
  lat: number;
  lng: number;
  distance?: number; // Agregamos la propiedad opcional de distancia
}

interface Chain {
  id: number;
  name: string;
  logoUrl: string | null;
  locations: Cinema[]; 
}

// --- HELPER FETCH (Para llamar al endpoint de cercanía desde el Server Component) ---
async function getNearbyCinemas(lat: string, lng: string) {
  try {
    // Importante: next: { revalidate: 0 } para que no cachee la ubicación y sea real-time
    const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/movies/nearby?lat=${lat}&lng=${lng}`, {
      next: { revalidate: 0 } 
    });
    
    if (!res.ok) return [];
    return res.json();
  } catch (e) {
    console.error("Error fetching nearby cinemas:", e);
    return [];
  }
}

// --- COMPONENTE DE PÁGINA ---
export default async function TheatersPage({
  searchParams,
}: {
  searchParams: Promise<{ lat?: string; lng?: string }>;
}) {
  // Esperamos los parámetros de la URL (Next.js 15+)
  const params = await searchParams;
  const isNearbyMode = params.lat && params.lng;

  let content;

  // --- LÓGICA DE RENDERIZADO SEGÚN EL MODO ---
  if (isNearbyMode) {
    // 📍 MODO CERCANÍA: Lista plana ordenada por distancia
    const nearbyCinemas: Cinema[] = await getNearbyCinemas(params.lat!, params.lng!);

    content = (
      <div className="space-y-6">
        <div className="flex items-center justify-between border-b border-zinc-800 pb-4">
            <h2 className="text-2xl font-bold text-zinc-100">
                Resultados cerca de tu ubicación
            </h2>
            <Link 
                href="/theaters" 
                className="text-sm text-violet-400 hover:text-violet-300 hover:underline transition-colors"
            >
                Limpiar filtro (Ver todos)
            </Link>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {nearbyCinemas.map((cinema) => (
                <Link
                    key={cinema.id}
                    href={`/theaters/${cinema.id}`}
                    className="group block bg-zinc-900/50 border border-zinc-800 hover:border-violet-500/50 rounded-xl p-4 transition-all hover:bg-zinc-900 shadow-sm hover:shadow-violet-900/10"
                >
                    <div className="flex justify-between items-start">
                        <div>
                            <h3 className="font-bold text-zinc-200 group-hover:text-violet-400 transition-colors">
                                {cinema.name}
                            </h3>
                            <p className="text-xs text-zinc-500 mt-1 flex items-center gap-1">
                                <MapPin size={12} />
                                {cinema.address}
                            </p>
                        </div>
                        {/* BADGE DE DISTANCIA */}
                        <div className="flex flex-col items-end">
                            <span className="bg-violet-600/20 text-violet-300 text-xs font-bold px-2 py-1 rounded-md border border-violet-600/30">
                                {cinema.distance} km
                            </span>
                        </div>
                    </div>
                </Link>
            ))}
        </div>
         
        {nearbyCinemas.length === 0 && (
             <div className="text-center py-20 bg-zinc-900/30 rounded-2xl border border-dashed border-zinc-800">
                <p className="text-zinc-500 text-lg">No encontramos cines cerca de esta ubicación 😔</p>
                <Link href="/theaters" className="text-violet-400 mt-2 block hover:underline">Ver lista completa</Link>
             </div>
        )}
      </div>
    );

  } else {
    // 🏢 MODO NORMAL: Agrupado por Cadenas
    const data = await getCinemas() as Chain[] | null;
    const chains = Array.isArray(data) ? data : [];

    content = (
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

            {(!chain.locations || chain.locations.length === 0) && (
                <p className="text-sm text-zinc-600 italic mt-2">No hay sucursales cargadas.</p>
            )}
          </div>
        ))}

        {chains.length === 0 && (
          <div className="text-center py-20 bg-zinc-900/30 rounded-2xl border border-dashed border-zinc-800">
            <p className="text-zinc-500 text-lg">No se encontraron cines.</p>
          </div>
        )}
      </div>
    );
  }

  // --- RENDER FINAL ---
  return (
    <div className="container mx-auto px-4 md:px-6 py-8">
      
      {/* Header con Botón */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
        <div>
            <h1 className="text-3xl md:text-5xl font-bold bg-linear-to-r from-violet-400 to-fuchsia-400 bg-clip-text text-transparent mb-2">
            Nuestros Cines
            </h1>
            <p className="text-zinc-400">
            Encontrá tu complejo favorito entre las principales cadenas del país.
            </p>
        </div>
        
        {/* Botón de Geolocalización */}
        <NearbyButton />
      </div>

      {/* Contenido Dinámico (Cercanía o Lista Completa) */}
      {content}

    </div>
  );
}