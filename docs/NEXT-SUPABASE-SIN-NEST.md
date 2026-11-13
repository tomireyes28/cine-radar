# Next.js + Supabase sin servidor NestJS permanente

El despliegue web solo necesita `web/`, en un hosting de Next.js con runtime Node.js 22 y renderizado de servidor. Usar raíz `web`, instalación `npm ci` y build `npm run build`; el hosting debe recibir las variables privadas indicadas abajo. Next.js consulta PostgreSQL desde sus Server Components y consulta TMDB para próximos estrenos. El navegador recibe datos públicos renderizados; no recibe conexiones SQL ni claves. El worker sigue en `.github/workflows/daily-scraper.yml`, usando sus propias credenciales de escritura y sin depender de que la web esté encendida.

## Configuración y credenciales

Con las migraciones aplicadas, instalar dependencias en `api/` y `web/`, configurar `api/.env` y ejecutar desde `api/`:

```sh
node scripts/setup-web-reader.cjs
```

El script crea un login `cine_radar_web` con contraseña aleatoria, sin superusuario, creación de roles/bases, replicación ni bypass de RLS. Solo concede SELECT sobre las columnas públicas necesarias de Movie, CinemaChain, CinemaLocation y Showtime. No concede escritura, secuencias ni lectura de tablas internas del worker. Comprueba privilegios y denegación de escritura. No rota una contraseña existente implícitamente. Una configuración interrumpida conserva la credencial nueva en un archivo `.env.local.reader-pending` ignorado, que se elimina al completar el proceso.

Configura `web/.env.local` sin imprimir secretos. Para desplegar, cargar **como variables privadas del servidor del hosting**:

| Variable | Uso |
| --- | --- |
| `SUPABASE_DATABASE_URL` | URL del lector, transaction pooler `:6543`; nunca la del propietario `postgres` |
| `SUPABASE_CA_CERT` | PEM de la CA pública de Supabase para verificar certificado y hostname |
| `TMDB_API_KEY` | Clave v3 para próximos estrenos, utilizada únicamente en el servidor |
| `NEXT_PUBLIC_SITE_URL` | URL canónica pública del sitio; única configuración pública de esta lista |

No copiar las credenciales de escritura del worker al frontend. `NEXT_PUBLIC_API_URL` ya no se usa. La URL del lector usa `cine_radar_web.PROJECT_REF` en Supavisor; preparada la configuración, ejecutar `npm run dev` en `web/` sin iniciar `api/`.

El certificado público versionado en `web/certs/supabase-ca.crt` se obtuvo por HTTPS de la [distribución de Supabase](https://supabase-downloads.s3-ap-southeast-1.amazonaws.com/prod/ssl/prod-ca-2021.crt). Fingerprint SHA-256: `80:70:25:AD:50:D4:ED:21:9D:2C:9C:7D:29:9C:00:4F:82:4E:B0:0C:F7:F6:5A:FE:F6:07:D0:7B:72:E6:CA:FA`; vence el 26/04/2031. Actualizarlo desde una fuente autenticada cuando Supabase rote la CA; no desactivar `rejectUnauthorized`. Referencias: [conexiones Supabase](https://supabase.com/docs/guides/database/connecting-to-postgres), [TLS](https://supabase.com/docs/guides/platform/ssl-enforcement).

## Consultas y consumo

`server-only` impide importar el acceso a datos desde componentes cliente. El driver Postgres.js se carga solo en el servidor Node de Next; no se instala NestJS, Prisma ni Puppeteer en el paquete web. La conexión reutiliza como máximo dos conexiones por proceso, cierra las inactivas tras 20 segundos y no usa prepared statements en el pooler transaccional. Cada lectura corre en una transacción READ ONLY con `statement_timeout` de ocho segundos y espera de locks limitada a dos. El login tiene un límite de diez conexiones; esos límites no son una garantía de capacidad y deben revisarse según la cantidad de instancias del hosting.

La cartelera se agrega en SQL: cantidad de cines, formatos, cadenas y una función representativa por película, en lugar de transferir todas las funciones del día a Next. Las fechas mantienen el día de Argentina (`-03:00`), con extremo superior exclusivo. Los filtros se parametrizan, incluidos patrones literales de ciudad/nombre; nunca se concatena input de usuario al SQL. El detalle agrupa por ID de sede para no mezclar sedes homónimas.

La caché de Next reutiliza cartelera/detalle durante cinco minutos y catálogo/estrenos durante una hora. El día argentino forma parte de la clave para evitar arrastrar el día anterior a medianoche. Las actualizaciones del scraper se ven tras la revalidación; la caché puede servir el último resultado durante una revalidación fallida. Una falla inicial de base/TMDB llega al error boundary; no se convierte en una colección vacía ni en un 404. Los errores publicados no incluyen la excepción original de conexión ni credenciales. El hosting puede aportar límites de tráfico/WAF: los límites SQL no reemplazan esa protección.

## Pruebas y evidencia

Desde `api/`, con un PostgreSQL de localhost descartable y Chrome instalado:

```sh
# Exportar TEST_POSTGRES_URL con la conexión administrativa del servidor local.
node test/run-postgres-tests.cjs --web --browser
```

El runner ignora la base configurada del desarrollador, crea una base aleatoria `cine_radar_test_*`, aplica las migraciones y crea un lector exclusivo de prueba. Al terminar elimina base y rol. Siete pruebas verifican límites de fecha, filtros combinados/literales/inyección, ausencia vs error, agrupaciones, permisos, rechazo del propietario, transacciones acotadas de solo lectura y que el CLI no imprima una URL privada mal formada.

El recorrido Chrome usa esa base real y únicamente un fixture HTTP de TMDB: búsqueda, filtros, fecha, detalle, cine, entradas, diálogo móvil/foco, vacío válido, 404 y error de base provocado revocando un permiso **solo en la base temporal**. No arranca NestJS. Revisa que HTML, respuestas RSC y JavaScript no contengan la contraseña de prueba o la clave TMDB. CI ejecuta el mismo recorrido y las pruebas previas del worker. El antiguo journey que simulaba respuestas de Nest fue reemplazado por este recorrido y las consultas reales; se mantienen las regresiones HTTP de timeout para TMDB.

Además se verificó localmente el build de producción contra el Supabase configurado con el lector restringido: cartelera, catálogo, cercanía, detalle y próximos estrenos respondieron correctamente sin API en localhost:3001. El análisis de HTML y bundles cliente no encontró las credenciales utilizadas. Esta comprobación no despliega el sitio ni configura automáticamente variables en un hosting externo.

## Límite pendiente del scraper

Atlas respondió HTTP 403 desde los runners alojados de GitHub en la verificación previa. Esta adaptación no elude esa restricción ni acredita la actualización viva de los seis proveedores. El workflow conserva el fallo explícito y los datos anteriores. Para Atlas hace falta acceso autorizado por el proveedor o un entorno de ejecución admitido; cambiar la lectura web a Supabase no resuelve ese bloqueo externo.
