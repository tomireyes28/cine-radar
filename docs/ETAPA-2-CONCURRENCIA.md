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

## R05: renovación, plazo total y rechazo de escritores vencidos

Cada ejecución vigila su lease: heartbeat cada 30 segundos como máximo, plazo de 10 minutos por cadena y 12 minutos para la corrida global. Los valores se pueden ajustar mediante el proveedor de configuración `SCRAPER_LOCK_OPTIONS`; los tests usan plazos cortos. Las leases globales y sus hijas se renuevan sin permitir que una ejecución externa se incorpore a la corrida. La admisión y renovación comparten un gate transaccional para evitar carreras entre corridas globales e individuales.

La autoridad de escritura se valida mediante propietario, vencimiento con `clock_timestamp()` y `SELECT ... FOR UPDATE` dentro de la misma transacción de los cambios. La fila queda bloqueada hasta commit/rollback y se vuelve a validar al terminar. Se protegen tanto horarios como identidad/alias, creación de cadenas/sedes, limpieza y telemetría. Una renovación fallida cancela la ejecución; un dueño antiguo no puede renovar, publicar ni liberar la lease de su sucesor. Los locks de admisión/renovación tienen también límites SQL de espera y ejecución.

El plazo cancela las solicitudes Axios, sus reintentos/esperas y el navegador de Cinépolis. Una consulta compartida a TMDB que ya estaba en curso puede finalizar después: no se cancela la petición de otros consumidores, pero su continuación queda sin permiso de escritura. Las pruebas cubren expresamente ese resultado tardío y el de un proveedor que ignore la cancelación. Cerrar una lease detiene y espera su renovación pendiente, elimina temporizadores y deja su guard inutilizable.

En PostgreSQL real se verifican heartbeat más allá de la expiración inicial, renovación de padre/hijo, propietario reemplazado, rollback al vencer dentro de una transacción, admisión global/individual y ausencia de publicaciones tardías. No se alteran migraciones ni se introduce una nueva dependencia productiva.

Al desplegar, deben terminarse los workers de la versión anterior antes de habilitar los nuevos: las garantías de escritura requieren que todas las vías de scraping usen el guard actualizado. No cubren SQL externo ni procesos con código anterior que omitan esa comprobación. La renovación y liberación incluyen tiempos máximos de espera SQL; el cierre puede consumir ese breve margen de limpieza después del plazo de trabajo.

## Verificación final

- 125 tests unitarios backend y 20 tests de integración con PostgreSQL 15.19 real, incluyendo la corrida global con seis estrategias.
- 5 contratos HTTP con servicios simulados y 14 tests frontend.
- Lint backend/frontend, TypeScript frontend, ambos builds y validación de Prisma: pasan.
- Las seis migraciones se aplican desde cero y `migrate diff --exit-code` no encuentra diferencias.
- Cada corrida usa su propia base temporal y la elimina al finalizar. No se ejecutaron migraciones, seeds ni scraping contra la base configurada de la aplicación.
- Al cerrar la etapa se comprobó que no quedaban bases `cine_radar_test_*` y se detuvo correctamente el servidor PostgreSQL temporal.
- No se verificó un pooler externo ni se desplegaron cambios productivos. La etapa queda preparada en una rama basada en la etapa 1.
