# Cine Radar — Backend API & Scraper Worker (`/api`)

Servicio backend construido con **NestJS 11**, **Prisma 6** y **PostgreSQL 15**. Expone la API REST pública de cartelera y provee el worker CLI desacoplado (`ScraperWorkerModule`) encargado de sincronizar las 6 cadenas de cine configuradas (68 complejos).

## Variables de Entorno

Copiar [`api/.env.example`](./.env.example) a `api/.env`:

| Variable | Requerida | Descripción |
| :--- | :---: | :--- |
| `DATABASE_URL` | Sí | Cadena de conexión PostgreSQL (`localhost:5434` en Docker local o `:6543?pgbouncer=true` en Supabase). |
| `TMDB_API_KEY` | Sí | API Key v3 de The Movie Database para resolución de títulos y próximos estrenos. |
| `ADMIN_API_KEY` | Sí | Clave secreta validada en tiempo constante (`x-api-key`) para endpoints administrativos. |
| `PORT` | No | Puerto HTTP del servidor (por defecto `3001`). |
| `FRONTEND_URL` | No | Lista separada por comas de orígenes CORS exactos permitidos. |
| `ENABLE_HTTP_SCRAPER` | No | Mantener en `"false"` en contenedores HTTP; habilita `POST /scraper/*` solo si es `"true"`. |
| `DISABLE_INTERNAL_CRON` | No | En `"true"` desactiva el `@Cron` interno cuando la ejecución corre en GitHub Actions. |
| `TRUST_PROXY` | No | Saltos de proxy reverso para `@nestjs/throttler` (`1` por defecto en `production`, `false` en local). |
| `CINEPOLIS_PUBLIC_API_KEY` | No | Permite sobreescribir la clave pública de storefront GraphQL de Cinépolis si rota en origen. |

## Comandos Principales

```bash
npm ci                        # Instalación reproducible
npx prisma migrate deploy     # Aplica las migraciones SQL versionadas
npm run db:seed               # Carga declarativa de 6 cadenas y 68 complejos
npm run build                 # Compila TypeScript en dist/
npm run start:dev             # Levanta la API en modo watch (http://localhost:3001)
npm run start:prod            # Ejecuta node dist/src/main.js

# Ejecución del Worker CLI (requiere haber ejecutado npm run build antes para scrape:prod)
npm run scrape                # Desarrollo (ts-node): todas las cadenas
npm run scrape -- atlas       # Desarrollo: una sola cadena (atlas|multiplex|showcase|cinemark|cinemacenter|cinepolis)
npm run scrape:prod           # Producción (node dist/cli/run-scrapers.js)

# Calidad y pruebas
npm run lint:check            # ESLint estricto (--max-warnings=0)
npm test                      # Suite unitaria con fixtures locales
npm run test:e2e              # Contratos HTTP, CORS, validación y /health
```

## Endpoints Principales

- `GET /` — Liveness ligero del proceso.
- `GET /health` — Readiness de PostgreSQL (`SELECT 1`), frescura de funciones futuras y último `ScrapeRun` (`503` si la base no responde).
- `GET /docs` — Documentación interactiva OpenAPI / Swagger.
- `GET /movies/now-playing` — Cartelera filtrable por `date` (`YYYY-MM-DD`), `zone` y `chainId`.
- `GET /movies/:id` — Detalle de película y horarios agrupados por complejo para una `date`.
- `GET /movies/cinemas` · `GET /movies/cinemas/:id` · `GET /movies/cinemas/:id/movies` — Catálogo y cartelera por sede.
- `GET /movies/nearby?lat=...&lng=...` — Complejos cercanos ordenados por distancia Haversine.
- `GET /movies/upcoming` — Próximos estrenos en Argentina vía TMDB (`503` explícito ante falla upstream).
