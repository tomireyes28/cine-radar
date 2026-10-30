export interface CinemarkLocationConfig {
  name: string;
  url: string;
  address: string;
  zone: string;
  city: string;
  lat: number;
  lng: number;
}

export const CINEMARK_LOCATIONS: CinemarkLocationConfig[] = [
  // --- CAPITAL FEDERAL ---
  {
    name: 'Cinemark Palermo',
    url: 'https://www.cinemarkhoyts.com.ar/cartelera/palermo',
    address: 'Beruti 3399',
    zone: 'CABA',
    city: 'CABA',
    lat: -34.5886,
    lng: -58.4113,
  },
  {
    name: 'Cinemark Puerto Madero',
    url: 'https://www.cinemarkhoyts.com.ar/cartelera/puertomadero',
    address: 'Alicia Moreau de Justo 1920',
    zone: 'CABA',
    city: 'CABA',
    lat: -34.6186,
    lng: -58.3638,
  },
  {
    name: 'Cinemark Caballito',
    url: 'https://www.cinemarkhoyts.com.ar/cartelera/caballito',
    address: 'Av. La Plata 96',
    zone: 'CABA',
    city: 'CABA',
    lat: -34.6166,
    lng: -58.4288,
  },
  {
    name: 'Cinemark Abasto',
    url: 'https://www.cinemarkhoyts.com.ar/cartelera/abasto',
    address: 'Av. Corrientes 3247',
    zone: 'CABA',
    city: 'CABA',
    lat: -34.6037,
    lng: -58.4106,
  },
  {
    name: 'Cinemark DOT',
    url: 'https://www.cinemarkhoyts.com.ar/cartelera/dot',
    address: 'Vedia 3600',
    zone: 'CABA',
    city: 'CABA',
    lat: -34.5456,
    lng: -58.4883,
  },

  // --- GBA NORTE ---
  {
    name: 'Cinemark Unicenter',
    url: 'https://www.cinemarkhoyts.com.ar/cartelera/unicenter',
    address: 'Paraná 3745',
    zone: 'GBA Norte',
    city: 'Martínez',
    lat: -34.5085,
    lng: -58.5236,
  },
  {
    name: 'Cinemark Tortugas',
    url: 'https://www.cinemarkhoyts.com.ar/cartelera/tortugas',
    address: 'Panamericana Km 36.5',
    zone: 'GBA Norte',
    city: 'Tortuguitas',
    lat: -34.4642,
    lng: -58.7332,
  },
  {
    name: 'Cinemark Soleil',
    url: 'https://www.cinemarkhoyts.com.ar/cartelera/soleil',
    address: 'Bernardo de Irigoyen 2647',
    zone: 'GBA Norte',
    city: 'Boulogne',
    lat: -34.4851,
    lng: -58.5632,
  },
  {
    name: 'Cinemark Malvinas Argentinas',
    url: 'https://www.cinemarkhoyts.com.ar/cartelera/malvinasargentinas',
    address: 'Ruta 8 y 202',
    zone: 'GBA Norte',
    city: 'Los Polvorines',
    lat: -34.5025,
    lng: -58.6947,
  },

  // --- GBA OESTE ---
  {
    name: 'Cinemark Morón',
    url: 'https://www.cinemarkhoyts.com.ar/cartelera/moron',
    address: 'Av. Gral. Juan Manuel de Rosas 658',
    zone: 'GBA Oeste',
    city: 'Morón',
    lat: -34.6366,
    lng: -58.6253,
  },
  {
    name: 'Cinemark San Justo',
    url: 'https://www.cinemarkhoyts.com.ar/cartelera/sanjusto',
    address: 'Av. Brig. Gral. Juan Manuel de Rosas 3910',
    zone: 'GBA Oeste',
    city: 'San Justo',
    lat: -34.6865,
    lng: -58.5623,
  },
  {
    name: 'Cinemark Moreno',
    url: 'https://www.cinemarkhoyts.com.ar/cartelera/moreno',
    address: 'Av. Victorica 1128',
    zone: 'GBA Oeste',
    city: 'Moreno',
    lat: -34.6322,
    lng: -58.7915,
  },

  // --- GBA SUR ---
  {
    name: 'Cinemark Alto Avellaneda',
    url: 'https://www.cinemarkhoyts.com.ar/cartelera/altoavellaneda',
    address: 'Güemes 897',
    zone: 'GBA Sur',
    city: 'Avellaneda',
    lat: -34.6758,
    lng: -58.3667,
  },
  {
    name: 'Cinemark Quilmes',
    url: 'https://www.cinemarkhoyts.com.ar/cartelera/quilmes',
    address: 'Av. Calchaquí 3950',
    zone: 'GBA Sur',
    city: 'Quilmes',
    lat: -34.7572,
    lng: -58.2778,
  },
  {
    name: 'Cinemark Temperley',
    url: 'https://www.cinemarkhoyts.com.ar/cartelera/temperley',
    address: 'Av. Hipólito Yrigoyen 10699',
    zone: 'GBA Sur',
    city: 'Temperley',
    lat: -34.7936,
    lng: -58.4069,
  },

  // --- INTERIOR DEL PAÍS ---
  {
    name: 'Cinemark Rosario',
    url: 'https://www.cinemarkhoyts.com.ar/cartelera/rosario',
    address: 'Nansen 255',
    zone: 'Interior',
    city: 'Rosario',
    lat: -32.928,
    lng: -60.6678,
  },
  {
    name: 'Cinemark Mendoza',
    url: 'https://www.cinemarkhoyts.com.ar/cartelera/mendoza',
    address: 'Ruta Panamericana 2650',
    zone: 'Interior',
    city: 'Mendoza',
    lat: -32.9566,
    lng: -68.8475,
  },
  {
    name: 'Cinemark Patio Olmos',
    url: 'https://www.cinemarkhoyts.com.ar/cartelera/patioolmos',
    address: 'Av. Vélez Sarsfield 361',
    zone: 'Interior',
    city: 'Córdoba',
    lat: -31.4196,
    lng: -64.1883,
  },
  {
    name: 'Cinemark Nuevo Centro',
    url: 'https://www.cinemarkhoyts.com.ar/cartelera/nuevocentro',
    address: 'Duarte Quirós 1400',
    zone: 'Interior',
    city: 'Córdoba',
    lat: -31.4116,
    lng: -64.2045,
  },
  {
    name: 'Cinemark Salta Alto NOA',
    url: 'https://www.cinemarkhoyts.com.ar/cartelera/saltaaltonoa',
    address: 'Av. del Bicentenario de la Batalla de Salta 702',
    zone: 'Interior',
    city: 'Salta',
    lat: -24.7821,
    lng: -65.4103,
  },
  {
    name: 'Cinemark Neuquen',
    url: 'https://www.cinemarkhoyts.com.ar/cartelera/neuquen',
    address: 'Dr. Ramón y Ruta 7',
    zone: 'Interior',
    city: 'Neuquén',
    lat: -38.9472,
    lng: -68.0581,
  },
  {
    name: 'Cinemark Santa Fe',
    url: 'https://www.cinemarkhoyts.com.ar/cartelera/santafe',
    address: 'Dique 1, Puerto Santa Fe',
    zone: 'Interior',
    city: 'Santa Fe',
    lat: -31.6433,
    lng: -60.7028,
  },
];
