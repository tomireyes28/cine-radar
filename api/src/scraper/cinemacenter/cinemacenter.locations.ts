export interface CinemaCenterCityConfig {
  name: string;
  cityId: number; 
  slug: string;   
  address: string;
  lat: number;     
  lng: number;     
}

export const CINEMACENTER_CITIES: CinemaCenterCityConfig[] = [
  // --- LOS QUE YA ESTABAN ---
  { name: 'Cinema Center Alta Gracia', cityId: 1, slug: 'alta-gracia', address: 'Av. Belgrano 450', lat: -31.6528, lng: -64.4284 },
  { name: 'Cinema Center Bahía Blanca', cityId: 2, slug: 'bahia-blanca', address: 'Sarmiento 2153', lat: -38.7187, lng: -62.2666 },
  { name: 'Cinema Center Catamarca', cityId: 3, slug: 'catamarca', address: 'Av. Acosta Villafañe 2450', lat: -28.4687, lng: -65.8016 },
  { name: 'Cinema Center Corrientes', cityId: 4, slug: 'corrientes', address: 'Av. Dr. Raúl Alfonsín 3525', lat: -27.4852, lng: -58.8033 },
  { name: 'Cinema Center Florencio Varela', cityId: 5, slug: 'florencio-varela', address: 'Av. San Martín 2599', lat: -34.8093, lng: -58.2694 },
  { name: 'Cinema Center Mar del Plata', cityId: 6, slug: 'mar-del-plata', address: 'Diagonal Pueyrredon 3050', lat: -37.9991, lng: -57.5456 },
  { name: 'Cinema Center Resistencia', cityId: 7, slug: 'resistencia', address: 'Av. Avalos 1400', lat: -27.4374, lng: -58.9836 },
  { name: 'Cinema Center San Juan', cityId: 9, slug: 'san-juan', address: 'Av. Circunvalación 105', lat: -31.5543, lng: -68.5284 },
  { name: 'Cinema Center San Luis', cityId: 10, slug: 'san-luis', address: 'Av. del Fundador 1450', lat: -33.3030, lng: -66.3356 },
  { name: 'Cinema Center Tandil', cityId: 12, slug: 'tandil', address: 'Panamá 351', lat: -37.3134, lng: -59.1292 },
  { name: 'Cinema Center Tucumán', cityId: 13, slug: 'tucuman', address: 'Av. Néstor Kirchner 3450', lat: -26.8335, lng: -65.2045 },
  { name: 'Cinema Center La Rioja', cityId: 15, slug: 'la-rioja', address: 'Av. Ortiz de Ocampo 1850', lat: -29.4131, lng: -66.8558 },
  { name: 'Cinema Center Río Cuarto', cityId: 16, slug: 'rio-cuarto', address: 'Av. Marcelo T. de Alvear 1250', lat: -33.1235, lng: -64.3486 },
  { name: 'Cinema Center Mendoza', cityId: 17, slug: 'mendoza', address: 'Las Cañas 1833', lat: -32.9162, lng: -68.8222 },

  // --- LOS CORREGIDOS (Gracias a tu captura) ---
  { 
    name: 'Cinema Center Córdoba', 
    cityId: 23, // ✅ Corregido (era 999)
    slug: 'cordoba', 
    address: 'Ricardo Rojas 9200', lat: -31.3283, lng: -64.2638 
  },
  { 
    name: 'Cinema Center Miramar', 
    cityId: 18, // ✅ Corregido (era 999)
    slug: 'miramar', 
    address: 'Calle 21 N 1546', lat: -38.2713, lng: -57.8385 
  },
  { 
    name: 'Cinema Center Río Segundo', 
    cityId: 24, // ✅ Corregido (era 999)
    slug: 'rio-segundo', 
    address: 'Bv. Lavalle 650', lat: -31.6515, lng: -63.9083 
  }
];