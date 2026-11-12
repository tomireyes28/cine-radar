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

## R04: resolución concurrente de identidad

Se reprodujeron conflictos de unicidad reales por clave de origen y por TMDB antes de la corrección. Ahora las consultas externas se completan antes de iniciar la transacción; dentro de ella se toman advisory locks transaccionales por origen y TMDB en orden estable, se releen los registros y se actualizan película/funciones/alias en conjunto. El mapa de la corrida no reemplaza la consulta de alias persistente, porque un ID temporal puede haber sido reconciliado por otra ejecución.

La resolución reintenta como máximo tres transacciones ante conflictos de unicidad, deadlocks/conflictos de escritura o un registro concurrentemente eliminado; no repite consultas externas ni oculta otros errores. Las pruebas de PostgreSQL usan barreras para que ambos clientes lleguen a la carrera a la vez, incluyendo dos cadenas con el mismo TMDB, el mismo origen sin TMDB, reconciliación de dos temporales y rollback completo cuando falla el alias.

El advisory lock se libera al terminar la transacción, no depende de conservar la misma conexión después del commit. La integración sigue ejecutándose sobre PostgreSQL directo; no certifica la configuración de un pooler externo.
