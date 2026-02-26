export interface CinepolisLocationConfig {
  name: string;
  complexId: number; 
  url: string;       
  address: string; // <--- Agregamos esto
  lat: number;
  lng: number;
}

export const CINEPOLIS_LOCATIONS: CinepolisLocationConfig[] = [
  // --- CABA ---
  {
    name: 'Cinépolis Recoleta',
    complexId: 1, 
    url: 'https://www.cinepolis.com.ar/cines/cinepolis-recoleta',
    address: 'Vicente López 2050',
    lat: -34.5966, lng: -58.3934
  },
  {
    name: 'Cinépolis Houssay',
    complexId: 11, 
    url: 'https://www.cinepolis.com.ar/cines/cinepolis-houssay',
    address: 'Av. Córdoba 2135',
    lat: -34.5995, lng: -58.3975
  },

  // --- GBA ---
  {
    name: 'Cinépolis Avellaneda',
    complexId: 5, 
    url: 'https://www.cinepolis.com.ar/cines/cinepolis-avellaneda',
    address: 'Autopista Bs.As.-La Plata Km 9',
    lat: -34.6623, lng: -58.3646
  },
  {
    name: 'Cinépolis Pilar',
    complexId: 6, 
    url: 'https://www.cinepolis.com.ar/cines/cinepolis-pilar',
    address: 'Panamericana Km 50',
    lat: -34.4542, lng: -58.9138
  },
  {
    name: 'Cinépolis Merlo',
    complexId: 9, 
    url: 'https://www.cinepolis.com.ar/cines/cinepolis-merlo',
    address: 'Av. Pres. Juan Domingo Perón 24098',
    lat: -34.6675, lng: -58.7288
  },
  {
    name: 'Cinépolis Luján',
    complexId: 10, 
    url: 'https://www.cinepolis.com.ar/cines/cinepolis-lujan',
    address: 'Tucumán 500', // Luján Walk
    lat: -34.5574, lng: -59.1102
  },

  // --- INTERIOR ---
  {
    name: 'Cinépolis Rosario',
    complexId: 4, 
    url: 'https://www.cinepolis.com.ar/cines/cinepolis-rosario',
    address: 'Eva Perón 5856',
    lat: -32.9248, lng: -60.6725
  },
  {
    name: 'Cinépolis Mendoza Shopping',
    complexId: 3, 
    url: 'https://www.cinepolis.com.ar/cines/cinepolis-mendoza',
    address: 'Av. de Acceso Este 3280',
    lat: -32.9015, lng: -68.8005
  },
  {
    name: 'Cinépolis Arena Maipú',
    complexId: 8, 
    url: 'https://www.cinepolis.com.ar/cines/cinepolis-maipu',
    address: 'Emilio Civit 791',
    lat: -32.9568, lng: -68.7992
  },
  {
    name: 'Cinépolis Neuquén',
    complexId: 2, 
    url: 'https://www.cinepolis.com.ar/cines/cinepolis-neuquen',
    address: 'J. J. Lastra 2400',
    lat: -38.9472, lng: -68.0581
  }
];