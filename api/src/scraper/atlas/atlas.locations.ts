export interface AtlasLocationConfig {
  name: string;
  complexId: number;
  url: string;
  address: string;
  zone: string;
  city: string;
  lat: number;
  lng: number;
}

export const ATLAS_LOCATIONS: AtlasLocationConfig[] = [
  {
    name: 'Atlas Caballito',
    complexId: 191,
    url: 'https://www.atlascines.com/',
    address: 'Av. Rivadavia 5071',
    zone: 'CABA',
    city: 'CABA',
    lat: -34.6183,
    lng: -58.4374,
  },
  {
    name: 'Atlas Flores',
    complexId: 197,
    url: 'https://www.atlascines.com/',
    address: 'Av. Rivadavia 7850',
    zone: 'CABA',
    city: 'CABA',
    lat: -34.6292,
    lng: -58.4621,
  },
  {
    name: 'Atlas Liniers',
    complexId: 198,
    url: 'https://www.atlascines.com/',
    address: 'Av. Rivadavia 11650',
    zone: 'CABA',
    city: 'CABA',
    lat: -34.6399,
    lng: -58.5268,
  },
  {
    name: 'Atlas Patio Bullrich',
    complexId: 195,
    url: 'https://www.atlascines.com/',
    address: 'Posadas 1245',
    zone: 'CABA',
    city: 'CABA',
    lat: -34.5886,
    lng: -58.3842,
  },
  {
    name: 'Atlas Alcorta',
    complexId: 194,
    url: 'https://www.atlascines.com/',
    address: 'Jerónimo Salguero 3172',
    zone: 'CABA',
    city: 'CABA',
    lat: -34.5765,
    lng: -58.4042,
  },
  {
    name: 'Atlas Nordelta',
    complexId: 196,
    url: 'https://www.atlascines.com/',
    address: 'Av. De Los Lagos 7010',
    zone: 'GBA Norte',
    city: 'Tigre',
    lat: -34.3990,
    lng: -58.6531,
  },
  {
    name: 'Atlas Catan',
    complexId: 192,
    url: 'https://www.atlascines.com/',
    address: 'Juan Manuel de Rosas 14457',
    zone: 'GBA Oeste',
    city: 'González Catán',
    lat: -34.7632,
    lng: -58.6194,
  },
];
