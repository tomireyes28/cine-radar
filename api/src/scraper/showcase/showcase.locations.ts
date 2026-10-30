export interface ShowcaseLocationConfig {
  name: string;
  webName: string;
  url: string;
  address: string;
  zone: string;
  city: string;
  lat: number;
  lng: number;
}

export const SHOWCASE_LOCATIONS: ShowcaseLocationConfig[] = [
  // --- GBA NORTE ---
  {
    name: 'Showcase Norcenter',
    webName: 'Showcase Norcenter',
    url: 'https://entradas.todoshowcase.com',
    address: 'Esteban Echeverría 3750',
    zone: 'GBA Norte',
    city: 'Munro',
    lat: -34.5218,
    lng: -58.5136,
  },
  {
    name: 'Showcase Norcenter',
    webName: 'IMAX THEATRE',
    url: 'https://entradas.todoshowcase.com',
    address: 'Esteban Echeverría 3750',
    zone: 'GBA Norte',
    city: 'Munro',
    lat: -34.5218,
    lng: -58.5136,
  },
  {
    name: 'Showcase Haedo',
    webName: 'Showcase Haedo',
    url: 'https://entradas.todoshowcase.com',
    address: 'Av. Dr. Luis Güemes 369',
    zone: 'GBA Oeste',
    city: 'Haedo',
    lat: -34.6388,
    lng: -58.5801,
  },

  // --- CABA ---
  {
    name: 'Showcase Belgrano',
    webName: 'Showcase Belgrano',
    url: 'https://entradas.todoshowcase.com',
    address: 'Monroe 1655',
    zone: 'CABA',
    city: 'CABA',
    lat: -34.5535,
    lng: -58.4532,
  },

  // --- GBA SUR ---
  {
    name: 'Showcase Quilmes',
    webName: 'Showcase Quilmes',
    url: 'https://entradas.todoshowcase.com',
    address: 'Humberto Primo 250',
    zone: 'GBA Sur',
    city: 'Quilmes',
    lat: -34.7251,
    lng: -58.2556,
  },

  // --- INTERIOR ---
  {
    name: 'Showcase Rosario',
    webName: 'Showcase Rosario',
    url: 'https://entradas.todoshowcase.com',
    address: 'Junín 501',
    zone: 'Interior',
    city: 'Rosario',
    lat: -32.928,
    lng: -60.6678,
  },
  {
    name: 'Showcase Córdoba',
    webName: 'Villa Cabrera',
    url: 'https://entradas.todoshowcase.com',
    address: 'José de Goyechea 2851',
    zone: 'Interior',
    city: 'Córdoba',
    lat: -31.3965,
    lng: -64.2163,
  },
  {
    name: 'Showcase Villa Allende',
    webName: 'Showcase Villa Allende',
    url: 'https://entradas.todoshowcase.com',
    address: 'Río de Janeiro 1725',
    zone: 'Interior',
    city: 'Villa Allende',
    lat: -31.2953,
    lng: -64.2957,
  },
];
