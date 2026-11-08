'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { clsx } from 'clsx';
import { RotateCcw } from 'lucide-react';

interface BillboardFiltersProps {
  chains: { id: number; name: string }[];
  zones: string[];
}

interface ChipProps {
  label: string;
  ariaLabel: string;
  active: boolean;
  onClick: () => void;
}

function Chip({ label, ariaLabel, active, onClick }: ChipProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      aria-label={ariaLabel}
      className={clsx(
        'shrink-0 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500',
        active
          ? 'bg-violet-600 border-violet-500 text-white shadow-sm shadow-violet-900/30'
          : 'bg-zinc-900/50 border-zinc-800 text-zinc-400 hover:text-zinc-200 hover:border-zinc-600',
      )}
    >
      {label}
    </button>
  );
}

export default function BillboardFilters({
  chains,
  zones,
}: BillboardFiltersProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const activeZone = searchParams.get('zone');
  const activeChain = searchParams.get('chainId');
  const hasActiveFilters = Boolean(activeZone || activeChain);

  const toggleParam = (key: 'zone' | 'chainId', value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (params.get(key) === value) {
      params.delete(key);
    } else {
      params.set(key, value);
    }
    const query = params.toString();
    router.push(query ? `${pathname}?${query}` : pathname, { scroll: false });
  };

  const clearAllFilters = () => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete('zone');
    params.delete('chainId');
    const query = params.toString();
    router.push(query ? `${pathname}?${query}` : pathname, { scroll: false });
  };

  return (
    <div className="space-y-3 mb-8">
      <div className="flex items-center justify-between">
        <p className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold">
          Zona
        </p>
        {hasActiveFilters && (
          <button
            type="button"
            onClick={clearAllFilters}
            aria-label="Limpiar filtros de zona y cadena"
            className="flex items-center gap-1 text-xs text-violet-400 hover:text-violet-300 transition-colors cursor-pointer font-medium"
          >
            <RotateCcw size={12} aria-hidden="true" />
            Limpiar filtros
          </button>
        )}
      </div>

      <div
        role="group"
        aria-label="Filtrar cartelera por zona"
        className="flex gap-2 overflow-x-auto pb-1 no-scrollbar"
      >
        {zones.map((zone) => (
          <Chip
            key={zone}
            label={zone}
            ariaLabel={`Filtrar por zona ${zone}`}
            active={activeZone === zone}
            onClick={() => toggleParam('zone', zone)}
          />
        ))}
      </div>

      <div>
        <p className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold mb-2">
          Cadena
        </p>
        <div
          role="group"
          aria-label="Filtrar cartelera por cadena de cine"
          className="flex gap-2 overflow-x-auto pb-1 no-scrollbar"
        >
          {chains.map((chain) => (
            <Chip
              key={chain.id}
              label={chain.name}
              ariaLabel={`Filtrar por cadena ${chain.name}`}
              active={activeChain === String(chain.id)}
              onClick={() => toggleParam('chainId', String(chain.id))}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
