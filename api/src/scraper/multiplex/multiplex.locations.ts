export interface MultiplexLocationConfig {
  name: string;
  complexId: string;
  address: string;
  zone: string;
  city: string;
  lat: number;
  lng: number;
}

export const MULTIPLEX_LOCATIONS: MultiplexLocationConfig[] = [
  {
    name: 'Multiplex Belgrano',
    complexId: '182',
    address: 'Vuelta de Obligado 2199',
    zone: 'CABA',
    city: 'CABA',
    lat: -34.5619,
    lng: -58.4563,
  },
  {
    name: 'Multiplex Lavalle',
    complexId: '184',
    address: 'Lavalle 780',
    zone: 'CABA',
    city: 'CABA',
    lat: -34.6022,
    lng: -58.3784,
  },
  {
    name: 'Multiplex Canning',
    complexId: '180',
    address: 'Formosa 653',
    zone: 'GBA Sur',
    city: 'Canning',
    lat: -34.8643,
    lng: -58.5042,
  },
  {
    name: 'Multiplex Pilar',
    complexId: '187',
    address: 'Las Magnolias 754',
    zone: 'GBA Norte',
    city: 'Pilar',
    lat: -34.444,
    lng: -58.854,
  },
  {
    name: 'Multiplex San Juan',
    complexId: '190',
    address: 'Av. Circunvalación 105',
    zone: 'Interior',
    city: 'San Juan',
    lat: -31.5543,
    lng: -68.5284,
  },
];
