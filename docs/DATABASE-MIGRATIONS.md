# Procedimiento de Migraciones y Reconciliación de Base de Datos

Este documento describe cómo inicializar una base de datos limpia mediante migraciones reproducibles de Prisma y cómo reconciliar una base existente que haya sido actualizada previamente con `prisma db push` (por ejemplo, en Supabase).

## 1. Instalación limpia (Desarrollo, CI o Nuevo Entorno)

Nunca utilizar `prisma db push` para aprovisionar entornos reproducibles. Ejecutar las migraciones versionadas y el catálogo declarativo:

```bash
cd api
npx prisma migrate deploy
npm run db:seed
```

> **Nota sobre Supabase Pooler:** `prisma migrate deploy` requiere una conexión directa o en modo sesión (puerto `5432`) si el pooler de transacciones (`6543` con `?pgbouncer=true`) bloquea sentencias DDL o bloqueos de migración. Para la ejecución normal de la API y del scraper basta la URL configurada en `DATABASE_URL`.

## 2. Reconciliación de una Base Existente creada con `db push`

Si una base de datos existente ya posee las tablas, columnas e índices actuales porque fue sincronizada con `npx prisma db push`, **no** se debe reejecutar el DDL desde cero sin antes marcar las migraciones base como aplicadas.

### Paso 2.1 — Verificar que el esquema vivo coincida con `schema.prisma`

```bash
cd api
npx prisma migrate diff \
  --from-url "$DATABASE_URL" \
  --to-schema-datamodel prisma/schema.prisma \
  --exit-code
```

- Código de salida `0`: no hay diferencias pendientes entre la base y `schema.prisma`.
- Código de salida `2`: existen diferencias; revisar el SQL con `--script` antes de reconciliar.

### Paso 2.2 — Marcar migraciones históricas como aplicadas (Baseline)

Si la base ya refleja el estado actual del esquema pero no registra las migraciones en `_prisma_migrations`, registrar ambas sin reejecutar su SQL:

```bash
cd api
npx prisma migrate resolve --applied 20260222170935_init_cinema_schema
npx prisma migrate resolve --applied 20261108020300_sync_billboard_schema_and_indexes
npx prisma migrate deploy
```

*(Las dos primeras órdenes registran la línea base anterior a las evoluciones nuevas; `npx prisma migrate deploy` aplica las migraciones incrementales posteriores, como la separación de `Movie.normalizedKey` / `tmdbId` nullable y la tabla `ScraperLock` de bloqueos distribuidos).*

### Paso 2.3 — Confirmar estado final

```bash
npx prisma migrate status
```

A partir de este punto, toda evolución posterior del esquema (por ejemplo, nuevas tablas o columnas) se aplica únicamente con `npx prisma migrate deploy`.


## Etapa 1, R03: alias de películas

`20261111143000_add_movie_source_aliases` es aditiva y debe aplicarse antes de ejecutar el worker de la etapa 1. Agrega `MovieAlias` con clave de origen, título original y FK a Movie. No modifica migraciones anteriores ni reasigna funciones heredadas. Validar primero en una copia aislada y seguir el procedimiento de despliegue descrito arriba.

## Etapa 4, R09: frescura por cadena

`20261113170000_chain_scrape_state` agrega únicamente `ChainScrapeState`. Aplicar con `npx prisma migrate deploy` antes de iniciar el worker actualizado. No borra ni reconstruye películas, funciones o corridas anteriores. La suite PostgreSQL ensaya el DDL sobre un esquema previo poblado con datos sintéticos y comprueba que conserva esos datos, además de aplicar las siete migraciones desde cero.

Los checkpoints comienzan vacíos: `/health` informa frescura `unknown` hasta recibir evidencia de las nuevas corridas; no convierte un `ScrapeRun` global histórico en éxito de todas las cadenas. Un esquema sin la tabla nueva informa `metricsStatus: unavailable` mientras readiness siga comprobando conexión. Esta verificación local no aplica migraciones sobre la base configurada ni reemplaza el ensayo de despliegue sobre una copia de producción.
