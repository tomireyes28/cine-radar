export interface CinepolisLocationConfig {
  name: string;
  complexId: number; 
  url: string;       
  lat: number;
  lng: number;
}

export const CINEPOLIS_LOCATIONS: CinepolisLocationConfig[] = [
  {
    name: 'Cinépolis Recoleta',
    complexId: 1, 
    url: 'https://www.cinepolis.com.ar/cartelera/recoleta',
    lat: -34.5966,
    lng: -58.3934
  },
  {
    name: 'Cinépolis Avellaneda',
    complexId: 5, 
    url: 'https://www.cinepolis.com.ar/cartelera/avellaneda',
    lat: -34.6623,
    lng: -58.3646
  }
];