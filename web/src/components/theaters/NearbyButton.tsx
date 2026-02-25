'use client';

import { useState } from 'react';
import { MapPin, Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';

export default function NearbyButton() {
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleSearchNearby = () => {
    setLoading(true);

    if (!('geolocation' in navigator)) {
      alert('Tu navegador no soporta geolocalización 😢');
      setLoading(false);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        // Redirigimos a la página de cines con los parámetros en la URL
        // Así la página de /theaters se encarga de hacer el fetch y mostrar la lista
        router.push(`/theaters?lat=${latitude}&lng=${longitude}`);
        setLoading(false);
      },
      (error) => {
        console.error("Error obteniendo ubicación:", error);
        alert('Necesitamos permiso de ubicación para encontrar cines cercanos.');
        setLoading(false);
      }
    );
  };

  return (
    <button
      onClick={handleSearchNearby}
      disabled={loading}
      className="flex items-center gap-2 bg-violet-600 hover:bg-violet-700 text-white px-4 py-2 rounded-full font-medium transition-all shadow-lg shadow-violet-500/20 active:scale-95 disabled:opacity-70 disabled:cursor-not-allowed"
    >
      {loading ? (
        <Loader2 className="animate-spin h-4 w-4" />
      ) : (
        <MapPin className="h-4 w-4" />
      )}
      {loading ? 'Buscando...' : 'Cines cerca de mí'}
    </button>
  );
}