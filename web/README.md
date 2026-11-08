# Cine Radar — Frontend Web (`/web`)

Aplicación web construida con **Next.js 16 (App Router)**, **React 19**, **Tailwind CSS v4** y **Radix UI**. Consume la API REST de Cine Radar con validación estricta de parámetros de URL, preservación del contexto de navegación (fecha y complejo seleccionado) y manejo explícito de errores upstream.

## Variables de Entorno

Copiar [`web/.env.example`](./.env.example) a `web/.env.local`:

| Variable | Requerida | Descripción |
| :--- | :---: | :--- |
| `NEXT_PUBLIC_API_URL` | Sí | URL base de la API NestJS (en local `http://localhost:3001`). |
| `NEXT_PUBLIC_SITE_URL` | No | URL pública canónica para metadatos OpenGraph/SEO (`http://localhost:3000` en local). |

## Comandos Principales

```bash
npm ci                                  # Instalación reproducible
npm run dev                             # Servidor de desarrollo en http://localhost:3000
npm run lint                            # ESLint (Next.js Core Web Vitals + TypeScript)
npx next typegen && npx tsc --noEmit    # Verificación estricta de tipos y rutas
npm test                                # Tests nativos de Node (API client, fechas, navegación y journey)
npm run build                           # Build optimizado de producción
npm run start                           # Servidor de producción de Next.js
```

## Rutas de la Aplicación

- `/` — Cartelera general con filtros combinables por zona, cadena y búsqueda instantánea.
- `/theaters` — Directorio de los 68 complejos agrupados por cadena y búsqueda geolocalizada (*Cines cerca de mí*).
- `/theaters/[id]` — Cartelera de un complejo específico con selector de 7 días que preserva `cinemaId` y `date` hacia el detalle de película.
- `/movie/[id]` — Ficha técnica, sinopsis, selector de fecha/complejo y enlaces directos de compra de entradas.
- `/proximamente` — Próximos estrenos y reestrenos en Argentina con diálogo accesible (`Radix Dialog`).
