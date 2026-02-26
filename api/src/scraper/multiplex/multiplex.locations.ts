export interface MultiplexLocationConfig {
  name: string;      
  complexId: string; 
  address: string;
  lat: number;
  lng: number;
}

export const MULTIPLEX_LOCATIONS: MultiplexLocationConfig[] = [
  {
    name: 'Multiplex Belgrano',
    complexId: '182', // ✅ Corregido según captura
    address: 'Vuelta de Obligado 2199',
    lat: -34.5619, lng: -58.4563
  },
  {
    name: 'Multiplex Lavalle',
    complexId: '184', // ✅ Confirmado
    address: 'Lavalle 780',
    lat: -34.6022, lng: -58.3784
  },
  {
    name: 'Multiplex Canning',
    complexId: '180', // ✅ Corregido según captura
    address: 'Formosa 653', 
    lat: -34.8643, lng: -58.5042
  },
  {
    name: 'Multiplex Pilar',
    complexId: '187', // ✅ Confirmado
    address: 'Las Magnolias 754', 
    lat: -34.4440, lng: -58.8540
  },
  {
    name: 'Multiplex San Juan',
    complexId: '190', // ✅ Nuevo detectado en captura
    address: 'Av. Circunvalación 105', // Espacio San Juan Shopping
    lat: -31.5543, lng: -68.5284
  }
];