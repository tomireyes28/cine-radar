# Etapa 2 — PostgreSQL, concurrencia y bloqueos

## R06: probar la ruta productiva de persistencia

`npm run test:integration` crea una base de nombre aleatorio `cine_radar_test_<uuid>`, aplica las migraciones, compara el esquema resultante con Prisma y ejecuta los tests. La base se elimina al finalizar. El runner requiere explícitamente `TEST_POSTGRES_URL` y rechaza servidores que no sean localhost; nunca recurre a `DATABASE_URL` ni a `.env`.

Ejemplo con un PostgreSQL local desechable (usuario con permiso para crear bases):

```powershell
cd api
$env:TEST_POSTGRES_URL = 'postgresql://postgres:password@127.0.0.1:5432/postgres'
npm run test:integration
```

En CI se usa el servicio PostgreSQL 15 existente y una base distinta a la del seed. Las pruebas simulan únicamente las respuestas de TMDB/proveedores, con Prisma real para las lecturas, escrituras y transacciones. Se quitaron del código productivo las ramas de reemplazo alternativas que dependían de los métodos implementados por los mocks.

Verificación local R06: PostgreSQL nativo 15.19 en `127.0.0.1:55439`, clúster temporal en `api/.tmp`, sin Docker y sin tocar la base configurada. Siete pruebas verifican sesiones independientes, IDs y deduplicación, actualización diferencial, rollback real por trigger, preservación de fechas, lease exclusiva y reconciliación con FK/alias.

Estas pruebas no simulan un pooler Supabase: comprueban PostgreSQL y Prisma mediante conexiones independientes. La topología y límites del pooler productivo requieren una comprobación separada en staging.
