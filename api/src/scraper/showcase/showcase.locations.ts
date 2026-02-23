export interface ShowcaseLocationConfig {
  name: string;      // Nombre para nuestra DB
  webName: string;   // Texto EXACTO del <h3> en la web (incluyendo mayúsculas/tildes)
  url: string;       // URL base
}

export const SHOWCASE_LOCATIONS: ShowcaseLocationConfig[] = [
  {
    name: 'Showcase Belgrano',
    webName: 'Showcase Belgrano', // Confirmado por tu captura
    url: 'https://entradas.todoshowcase.com'
  },
  {
    name: 'Showcase Haedo',
    webName: 'Showcase Haedo',
    url: 'https://entradas.todoshowcase.com'
  },
  {
    name: 'Showcase Norcenter',
    webName: 'Showcase Norcenter', // Confirmado por tu captura
    url: 'https://entradas.todoshowcase.com'
  },
  {
    name: 'Showcase Norte',
    webName: 'Showcase Norte', // (Chequear si existe o es el mismo que Norcenter)
    url: 'https://entradas.todoshowcase.com'
  },
  {
    name: 'Showcase Córdoba',
    webName: 'Showcase Cordoba (Villa Cabrera)', // Ojo: Probablemente sea sin tilde en web o con paréntesis
    url: 'https://entradas.todoshowcase.com'
  },
  {
    name: 'Showcase Rosario',
    webName: 'Showcase Rosario',
    url: 'https://entradas.todoshowcase.com'
  },
  {
    name: 'Showcase Quilmes',
    webName: 'Showcase Quilmes',
    url: 'https://entradas.todoshowcase.com'
  },
  {
    name: 'Showcase Villa Allende',
    webName: 'Showcase Villa Allende',
    url: 'https://entradas.todoshowcase.com'
  }
];