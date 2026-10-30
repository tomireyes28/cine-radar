# 🎬 Cine Radar — Agregador de Cartelera de Cines en Tiempo Real

**Cine Radar** es una plataforma Full-Stack que unifica en un solo lugar la cartelera, horarios, formatos (`2D`, `3D`, `IMAX`, `4D`, `XD`, `D-BOX`, `VIP`) y geolocalización de **65 complejos de las 6 cadenas de cine más grandes de Argentina** (*Cinemark Hoyts, Cinépolis, Showcase, Atlas Cines, Multiplex y Cinema Center*), enriqueciendo cada título con metadata oficial de **TMDB**.

---

## 🏗️ Arquitectura del Sistema

```mermaid
flowchart LR
    subgraph GH["GitHub Actions (Cron Diario 04:00 AM ARG)"]
        CLI["CLI Runner (run-scrapers.ts)"]
        Orch["ScraperOrchestratorService"]
        HTTP["Scrapers HTTP/JSON Directo:\n• Cinemark (BFF API)\n• Showcase (VoyAlCine API)\n• Atlas (REST JSON)\n• Multiplex (Cheerio SSR)\n• Cinema Center (AJAX POST)"]
        GQL["Scraper Stealth GraphQL:\n• Cinépolis (GraphQL v2)"]
        CLI --> Orch --> HTTP & GQL
    end

    subgraph Cloud["Infraestructura Productiva"]
        DB[("Supabase PostgreSQL\nSupavisor Pooler (6543)")]
        API["NestJS 11 REST API\n(Railway ~50 MB RAM)"]
        Web["Next.js 16 App Router\n(Vercel ISR + SSR)"]
    end

    Orch -->|Batch createMany + Upsert| DB
    Orch <-->|In-Memory Cache + Metadata| TMDB["TMDB API v3"]
    Web <-->|REST + ISR Revalidation| API
    API <-->|Prisma ORM| DB
```

---

## 🧠 Decisiones de Ingeniería y Optimización de Costos

### 1. Reducción del ~90% en Consumo de RAM/CPU en la Nube
Originalmente, ejecutar múltiples instancias de Chromium (`Puppeteer`) dentro del contenedor web de la API generaba picos de **600–900 MB de RAM**. Se rediseñó la arquitectura en dos niveles:
- **Ingeniería inversa de APIs y BFFs**: Se reemplazó la automatización de navegador en **5 de las 6 cadenas** (*Cinemark, Showcase, Cinema Center, Atlas y Multiplex*) por peticiones HTTP directas a sus APIs internas JSON/AJAX + `cheerio`, reduciendo el uso de Chromium en esas cadenas a **0 MB** y recolectando **+18.000 horarios multi-día en ~3 minutos**.
- **Desacoplamiento del Worker a GitHub Actions**: El proceso pesado de recolección corre de forma desatendida en runners gratuitos de **GitHub Actions** ([`.github/workflows/daily-scraper.yml`](./.github/workflows/daily-scraper.yml)), mientras que el contenedor en Railway ejecuta únicamente el servidor HTTP de NestJS sin Chrome ([`api/nixpacks.toml`](./api/nixpacks.toml)), manteniendo un consumo estable de **~50 MB de RAM**.

### 2. Principios SOLID y Patrones de Diseño (Backend NestJS)
- **Strategy Pattern (`ICinemaScraper`)**: Cada cadena de cine implementa el contrato único [`ICinemaScraper`](./api/src/scraper/interfaces/scraper.interface.ts) y se limita exclusivamente a extraer datos crudos (*Single Responsibility Principle*).
- **Orchestrator Pattern (`ScraperOrchestratorService`)**: [`ScraperOrchestratorService`](./api/src/scraper/services/scraper-orchestrator.service.ts) coordina todas las estrategias, deduplica llamadas a `TmdbService` mediante caché en memoria y realiza inserciones masivas por lote (`prisma.showtime.createMany({ skipDuplicates: true })`), evitando el problema de queries *N+1*.
- **Normalización Centralizada (`TitleNormalizerService`)**: [`TitleNormalizerService`](./api/src/scraper/services/title-normalizer.service.ts) limpia tokens técnicos (`2D`, `3D`, `IMAX`, `48FPS`, `ANIVERSARIO`), corrige codificaciones `ISO-8859-1` y resuelve alias locales antes de consultar TMDB.

### 3. Seguridad y Rendimiento en Base de Datos
- **Defensa en profundidad**: Cabeceras HTTP seguras con `Helmet`, *Rate Limiting* global con `@nestjs/throttler` (100 req/min), validación estricta de DTOs con `class-validator` (`whitelist` + `forbidNonWhitelisted`), y protección de endpoints administrativos mediante [`ApiKeyGuard`](./api/src/common/guards/api-key.guard.ts) con comparación en tiempo constante (`crypto.timingSafeEqual`).
- **Modelado e Indexación SQL ([`schema.prisma`](./api/prisma/schema.prisma))**:
  - Constraint compuesto `@@unique([movieId, locationId, dateTime, format, language])` que garantiza idempotencia y cero funciones duplicadas.
  - Índices compuestos `@@index([dateTime])`, `@@index([movieId, dateTime])` y `@@index([locationId, dateTime])` para consultas de cartelera en milisegundos.
  - Separación de `DATABASE_URL` (Transaction Pooler puerto `6543`) y `DIRECT_URL` (Session/Migrations puerto `5432`) en Supabase.

---

## 🛠️ Stack Tecnológico

| Capa | Tecnologías |
| :--- | :--- |
| **Frontend (`/web`)** | Next.js 16 (App Router, Server Components, ISR), React 19, TypeScript 5, Tailwind CSS v4, Framer Motion, Lucide Icons, `date-fns` |
| **Backend (`/api`)** | NestJS 11, TypeScript 5, Prisma ORM 6, Axios, Cheerio, Puppeteer Stealth (lazy-loaded), Helmet, `@nestjs/throttler`, Jest |
| **Base de Datos & Infra** | PostgreSQL 15 (Supabase), GitHub Actions (Cron Worker), Railway (API), Vercel (Web) |

---

## 🚀 Ejecución Local

### 1. Clonar y configurar variables de entorno
Crear `api/.env` basándose en [`api/.env.example`](./api/.env.example) y `web/.env.local`:

```bash
# api/.env
DATABASE_URL="postgresql://postgres.[REF]:[PASS]@aws-0-us-east-1.pooler.supabase.com:6543/postgres?pgbouncer=true"
DIRECT_URL="postgresql://postgres.[REF]:[PASS]@aws-0-us-east-1.pooler.supabase.com:5432/postgres"
TMDB_API_KEY="tu_api_key_de_tmdb"
ADMIN_API_KEY="tu_clave_secreta_admin"
FRONTEND_URL="http://localhost:3000"
```

```bash
# web/.env.local
NEXT_PUBLIC_API_URL="http://localhost:3000"
```

### 2. Iniciar Backend (`/api`)
```bash
cd api
npm install
npx prisma db push
npm run db:seed       # Carga declarativa de las 6 cadenas y 65+ complejos geolocalizados
npm run scrape:prod   # Pobla la cartelera completa (oej: node dist/cli/run-scrapers.js cinemark)
npm run start:dev
```

### 3. Iniciar Frontend (`/web`)
```bash
cd web
npm install
npm run dev
```
