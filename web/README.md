# Cine Radar — Frontend Web (`/web`)

Aplicación web construida con **Next.js 16 (App Router)**, **React 19**, **Tailwind CSS v4** y **Radix UI**. Consulta Supabase desde Server Components con un lector dedicado de solo lectura y consulta TMDB desde el servidor, sin necesitar una API NestJS desplegada. [Configuración completa](../docs/NEXT-SUPABASE-SIN-NEST.md). Conserva con validación estricta de parámetros de URL, preservación del contexto de navegación (fecha y complejo seleccionado) y manejo explícito de errores upstream.

## Variables de Entorno

Copiar [`web/.env.example`](./.env.example) a `web/.env.local`:

| Variable | Requerida | Descripción |
| :--- | :---: | :--- |
| `SUPABASE_DATABASE_URL` | Sí | Conexión privada del lector dedicado por pooler transaccional; nunca usuario propietario. |
| `SUPABASE_CA_CERT` | Sí en Supabase | CA pública para validar certificado y hostname del servidor SQL. |
| `TMDB_API_KEY` | Para estrenos | Clave privada v3 utilizada exclusivamente en el servidor. |
| `NEXT_PUBLIC_SITE_URL` | No | URL pública canónica para metadatos OpenGraph/SEO (`http://localhost:3000` en local). |

## Comandos Principales

```bash
npm ci                                  # Instalación reproducible
npm run dev                             # Servidor de desarrollo en http://localhost:3000
npm run lint                            # ESLint (Next.js Core Web Vitals + TypeScript)
npx next typegen && npx tsc --noEmit    # Verificación estricta de tipos y rutas
npm test                                # Tests nativos de Node (transporte TMDB, fechas y navegación)
npm run build                           # Build optimizado de producción
npm run start                           # Servidor de producción de Next.js
```

## Rutas de la Aplicación

- `/` — Cartelera general con filtros combinables por zona, cadena y búsqueda instantánea.
- `/theaters` — Directorio de los 68 complejos agrupados por cadena y búsqueda geolocalizada (*Cines cerca de mí*).
- `/theaters/[id]` — Cartelera de un complejo específico con selector de 7 días que preserva `cinemaId` y `date` hacia el detalle de película.
- `/movie/[id]` — Ficha técnica, sinopsis, selector de fecha/complejo y enlaces directos de compra de entradas.
- `/proximamente` — Próximos estrenos y reestrenos en Argentina con diálogo accesible (`Radix Dialog`).
