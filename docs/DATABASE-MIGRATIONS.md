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

*(Las dos primeras órdenes registran la línea base anterior a las evoluciones nuevas; `npx prisma migrate deploy` aplica las migraciones incrementales posteriores, como la separación de `Movie.normalizedKey` y `tmdbId` nullable).*

### Paso 2.3 — Confirmar estado final

```bash
npx prisma migrate status
```

A partir de este punto, toda evolución posterior del esquema (por ejemplo, nuevas tablas o columnas) se aplica únicamente con `npx prisma migrate deploy`.
