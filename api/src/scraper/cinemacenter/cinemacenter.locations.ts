export interface CinemaCenterCityConfig {
  name: string;
  cityId: number; // El value del select
  slug: string;   // Para la URL principal (ej: mar-del-plata)
}

export const CINEMACENTER_CITIES: CinemaCenterCityConfig[] = [
  { name: 'Cinema Center Alta Gracia', cityId: 1, slug: 'alta-gracia' },
  { name: 'Cinema Center Bahía Blanca', cityId: 2, slug: 'bahia-blanca' },
  { name: 'Cinema Center Catamarca', cityId: 3, slug: 'catamarca' },
  { name: 'Cinema Center Corrientes', cityId: 4, slug: 'corrientes' },
  { name: 'Cinema Center Florencio Varela', cityId: 5, slug: 'florencio-varela' },
  { name: 'Cinema Center Mar del Plata', cityId: 6, slug: 'mar-del-plata' },
  { name: 'Cinema Center Resistencia', cityId: 7, slug: 'resistencia' },
  { name: 'Cinema Center San Juan', cityId: 9, slug: 'san-juan' },
  { name: 'Cinema Center San Luis', cityId: 10, slug: 'san-luis' },
  { name: 'Cinema Center Tandil', cityId: 12, slug: 'tandil' },
  { name: 'Cinema Center Tucumán', cityId: 13, slug: 'tucuman' },
  { name: 'Cinema Center La Rioja', cityId: 15, slug: 'la-rioja' },
  { name: 'Cinema Center Río Cuarto', cityId: 16, slug: 'rio-cuarto' },
  { name: 'Cinema Center Mendoza', cityId: 17, slug: 'mendoza' },
];