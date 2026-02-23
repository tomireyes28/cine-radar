
export interface CinemarkLocationConfig {
  name: string;
  url: string;
  address: string;
  lat: number;
  lng: number;
}

export const CINEMARK_LOCATIONS: CinemarkLocationConfig[] = [
  { 
    name: 'Cinemark Abasto', 
    url: 'https://www.cinemark.com.ar/cartelera/abasto', 
    address: 'Av. Corrientes 3247', 
    lat: -34.6037, lng: -58.4106 
  },
  { 
    name: 'Cinemark Caballito', 
    url: 'https://www.cinemark.com.ar/cartelera/caballito', 
    address: 'Av. La Plata 96', 
    lat: -34.6166, lng: -58.4288 
  },
  { 
    name: 'Cinemark Alto Avellaneda', 
    url: 'https://www.cinemark.com.ar/cartelera/altoavellaneda', 
    address: 'Güemes 897', 
    lat: -34.6758, lng: -58.3667 
  },
  { 
    name: 'Cinemark DOT', 
    url: 'https://www.cinemark.com.ar/cartelera/dot', 
    address: 'Vedia 3600', 
    lat: -34.5456, lng: -58.4883 
  },
  { 
    name: 'Cinemark Malvinas Argentinas', 
    url: 'https://www.cinemark.com.ar/cartelera/malvinasargentinas', 
    address: 'Ruta 8 y 202', 
    lat: -34.5025, lng: -58.6947 
  }
];