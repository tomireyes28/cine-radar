export interface ShowcaseLocationConfig {
  name: string;      // Nombre UNIFICADO para la DB (ej: Showcase Norcenter)
  webName: string;   // Texto EXACTO o PARCIAL único a buscar en el HTML
  url: string;
  address: string;   // Nuevo
  lat: number;       // Nuevo
  lng: number;       // Nuevo
}

export const SHOWCASE_LOCATIONS: ShowcaseLocationConfig[] = [
  // --- GBA NORTE ---
  {
    name: 'Showcase Norcenter',
    webName: 'Showcase Norcenter', 
    url: 'https://entradas.todoshowcase.com',
    address: 'Esteban Echeverría 3750',
    lat: -34.5218, lng: -58.5136
  },
  {
    // TRUCO: Mapeamos "IMAX THEATRE" al mismo "Showcase Norcenter" en la DB
    // Así los horarios de IMAX se suman al cine Norcenter.
    name: 'Showcase Norcenter', 
    webName: 'IMAX THEATRE', 
    url: 'https://entradas.todoshowcase.com',
    address: 'Esteban Echeverría 3750',
    lat: -34.5218, lng: -58.5136
  },
  {
    name: 'Showcase Haedo',
    webName: 'Showcase Haedo',
    url: 'https://entradas.todoshowcase.com',
    address: 'Av. Dr. Luis Güemes 369',
    lat: -34.6388, lng: -58.5801
  },

  // --- CABA ---
  {
    name: 'Showcase Belgrano',
    webName: 'Showcase Belgrano',
    url: 'https://entradas.todoshowcase.com',
    address: 'Monroe 1655',
    lat: -34.5535, lng: -58.4532
  },

  // --- GBA SUR ---
  {
    name: 'Showcase Quilmes',
    webName: 'Showcase Quilmes',
    url: 'https://entradas.todoshowcase.com',
    address: 'Humberto Primo 250',
    lat: -34.7251, lng: -58.2556
  },

  // --- INTERIOR ---
  {
    name: 'Showcase Rosario',
    webName: 'Showcase Rosario',
    url: 'https://entradas.todoshowcase.com',
    address: 'Junín 501', // Alto Rosario Shopping
    lat: -32.9280, lng: -60.6678
  },
  {
    name: 'Showcase Córdoba',
    webName: 'Villa Cabrera', // "Showcase Córdoba Villa Cabrera" -> Buscamos "Villa Cabrera" que es único
    url: 'https://entradas.todoshowcase.com',
    address: 'José de Goyechea 2851',
    lat: -31.3965, lng: -64.2163
  },
  {
    name: 'Showcase Villa Allende',
    webName: 'Showcase Villa Allende',
    url: 'https://entradas.todoshowcase.com',
    address: 'Río de Janeiro 1725',
    lat: -31.2953, lng: -64.2957
  }
];