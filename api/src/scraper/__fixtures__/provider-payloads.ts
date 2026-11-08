/**
 * Local deterministic fixtures representing upstream HTML/JSON/ArrayBuffer responses
 * for each Argentine cinema chain scraper. Zero live network requests are made in tests.
 */

export const ATLAS_CABALLITO_FIXTURE = [
  {
    codFuncion: 9001,
    codComplejo: 191,
    horaComienzo: '19:30',
    fecha: '2026-11-08T00:00:00',
    cachePeliculas: {
      titulo: 'GLADIADOR 2 D-BOX 2D SUBTITULADA',
      tituloOriginal: 'GLADIATOR II',
    },
    codTecnologia: 4,
  },
  {
    codFuncion: 9002,
    codComplejo: 191,
    horaComienzo: '22:10',
    fecha: '2026-11-08T00:00:00',
    cachePeliculas: {
      titulo: 'SPIDER-MAN: SIN CAMINO A CASA - 2D CASTELLANO',
      tituloOriginal: 'SPIDER-MAN: NO WAY HOME',
    },
    codTecnologia: 1,
  },
];

export const MULTIPLEX_HOME_HTML_FIXTURE = `<!DOCTYPE html>
<html lang="es">
<body>
  <div class="cartelera">
    <div class="funcion-item" data-funciones='[{"complejo":"182","dia":"11.08.2026","hora":"18:45","formato":"2D","idioma":"SUBTITULADO"},{"complejo":"184","dia":"11.08.2026","hora":"21:00","formato":"3D","idioma":"CASTELLANO"}]'>
      <a class="portada-link" href="https://multiplex.com.ar/pelicula/duna-parte-2">
        <img alt="Duna: Parte Dos" />
      </a>
      <a class="titulo-link" href="https://multiplex.com.ar/pelicula/duna-parte-2">DUNA: PARTE DOS (2D SUB)</a>
    </div>
  </div>
</body>
</html>`;

export const MULTIPLEX_PARTIAL_CORRUPT_HTML_FIXTURE = `<!DOCTYPE html>
<html lang="es">
<body>
  <div class="cartelera">
    <div class="funcion-item" data-funciones='[{"complejo":"182","dia":"11.08.2026","hora":"20:15","formato":"4D","idioma":"CASTELLANO"}]'>
      <a class="titulo-link" href="https://multiplex.com.ar/pelicula/wicked">WICKED</a>
    </div>
    <div class="funcion-item" data-funciones='{broken-json'>
      <a class="titulo-link" href="https://multiplex.com.ar/pelicula/rota">PELICULA ROTA</a>
    </div>
  </div>
</body>
</html>`;

export const SHOWCASE_HOME_HTML_FIXTURE = `<!DOCTYPE html>
<html>
<body>
  <a href="/showcase/pelicula.aspx?filmid=101">Gladiador 2</a>
  <a href="/showcase/pelicula.aspx?filmid=102">Misión Imposible</a>
  <a href="/showcase/pelicula.aspx?filmid=101">Duplicado</a>
</body>
</html>`;

export const SHOWCASE_VOYALCINE_TREE_101_FIXTURE = {
  id: 101,
  name: 'Gladiador 2',
  days: {
    '2026-11-08': [
      {
        id: 1,
        name: 'Showcase Belgrano',
        formats: [
          {
            formatDescription: '2D-Subtitulado',
            performances: [{ performanceId: 501, showTime: '20:30' }],
          },
        ],
      },
      {
        id: 2,
        name: 'IMAX THEATRE Showcase',
        formats: [
          {
            formatDescription: '3D-Castellano',
            performances: [{ performanceId: 502, showTime: '22:45' }],
          },
        ],
      },
    ],
  },
};

export const SHOWCASE_VOYALCINE_TREE_102_FIXTURE = {
  id: 102,
  name: 'Misión Imposible - Sentencia Final',
  days: {
    '2026-11-08': [
      {
        id: 3,
        name: 'Showcase Córdoba Villa Cabrera',
        formats: [
          {
            formatDescription: '2D-Castellano',
            performances: [{ performanceId: 503, showTime: '19:00' }],
          },
        ],
      },
    ],
  },
};

export const CINEMARK_THEATERS_BFF_FIXTURE = {
  data: [
    { id: 701, name: 'Cinemark Palermo', slug: 'palermo' },
    { id: 702, name: 'Cinemark Abasto', slug: 'abasto' },
  ],
};

export const CINEMARK_SHOWTIMES_PALERMO_FIXTURE = {
  data: [
    {
      movieId: 'HO00001234',
      movieName: 'NOSFERATU XD D-BOX',
      language: { name: 'INGLÉS', shortName: 'EN' },
      sessionFormat: 'XD 2D D-BOX',
      sessionDateTime: '2026-11-08T21:40:00.000Z',
      sessionDisplayDate: '2026-11-08',
    },
  ],
};

export function encodeIso88591ArrayBuffer(text: string): ArrayBuffer {
  const bytes = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i++) {
    bytes[i] = text.charCodeAt(i) & 0xff;
  }
  return bytes.buffer;
}

export const CINEMACENTER_HORARIOS_HTML_FIXTURE = `<!DOCTYPE html>
<html>
<head><title>CinemaCenter Horarios</title></head>
<body>
  <ul class="movies">
    <li class="movieLink">
      <a href="javascript:seleccionarMovie('1','1','10','500')">MISIÓN IMPOSIBLE - SENTENCIA FINAL (2D SUB)</a>
    </li>
  </ul>
</body>
</html>`;

export const CINEMACENTER_EMPTY_HORARIOS_HTML_FIXTURE = `<!DOCTYPE html>
<html>
<head><title>CinemaCenter Sin Funciones</title></head>
<body>
  <ul class="movies"></ul>
</body>
</html>`;

export const CINEMACENTER_AJAX_SHOWTIMES_HTML_FIXTURE = `
<li>
  <ul class="hours">
    <li>
      <a href="javascript:comprar('10','500','Sala 1','2D SUB','2026-11-08T22:15:00')">22:15</a>
    </li>
  </ul>
</li>`;
