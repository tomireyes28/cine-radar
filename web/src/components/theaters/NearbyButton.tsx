'use client';

import { useState } from 'react';
import { MapPin, Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';

export default function NearbyButton() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const handleSearchNearby = () => {
    setError(null);

    if (!('geolocation' in navigator)) {
      setError('Tu navegador no soporta geolocalización.');
      return;
    }

    setLoading(true);
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        router.push(`/theaters?lat=${coords.latitude}&lng=${coords.longitude}`);
        setLoading(false);
      },
      () => {
        setError('Necesitamos permiso de ubicación para encontrar cines cercanos.');
        setLoading(false);
      },
    );
  };

  return (
    <div className="flex flex-col items-start md:items-end gap-2">
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
      {error && (
        <p role="alert" className="text-xs text-red-400 max-w-xs">
          {error}
        </p>
      )}
    </div>
  );
}
