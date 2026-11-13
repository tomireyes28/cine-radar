# Etapa 4 — Operación y evidencia

Base: `main` en `831721d`. R09 era el único defecto confirmado pendiente del plan del 11/11. Su corrección, pruebas y evidencia quedan en un commit; las optimizaciones adicionales continúan condicionadas a mediciones específicas.

## R09: readiness, frescura y costo de monitoreo

`GET /` es liveness sin consultas. `GET /health` ejecuta `SELECT 1` en cada solicitud y devuelve 503 si falla o no existe cliente de base de datos. La calidad de cartelera es independiente: una API con conexión y datos parciales puede seguir sirviendo respuestas con HTTP 200.

La tabla compacta `ChainScrapeState` conserva por cadena el último intento, último éxito, estado y cantidad de sedes verificadas. Un éxito requiere `complete` o `empty_verified`, todas las sedes esperadas verificadas y ninguna parcial/fallida. Un vacío verificado cuenta como éxito aunque no existan horarios futuros. Un intento parcial o fallido conserva el último éxito anterior. Se guardan marcas UTC explícitas; las actualizaciones antiguas no sobrescriben un checkpoint más reciente. Las marcas corresponden a la finalización de la corrida que publica el resumen.

Política inicial fija: frescura por menos de **36 horas**, acorde al scraping diario con margen operativo; no es una garantía contractual del proveedor. Cada una de las seis cadenas expone:

- `fresh`: último intento verificado y éxito dentro del umbral.
- `partial`: éxito todavía reciente, pero último intento parcial/fallido.
- `stale`: hubo intento, sin éxito válido reciente.
- `unknown`: no hay evidencia en los nuevos checkpoints.

El agregado es `fresh` solo si lo son todas; es `partial` si al menos una conserva datos recientes y otra está degradada/desconocida. Si todas son desconocidas, es `unknown`; de lo contrario, sin ninguna reciente, es `stale`. `billboard.isStale` se conserva por compatibilidad y vale `freshness !== 'fresh'`; ya no significa simplemente ausencia de horarios futuros. Para alertas nuevas usar `freshness`, el detalle por cadena y `metricsStatus`.

Un agregado SQL obtiene cantidad y horizonte juntos. Las tres consultas de métricas (agregado, seis checkpoints y resumen escalar de última corrida) se reutilizan durante **15 segundos por proceso**. Las solicitudes concurrentes comparten una renovación; los fallos de métricas también esperan ese TTL antes de reintentar. `metricsAsOf` identifica la captura; la edad de los éxitos se recalcula en cada respuesta. Si fallan las métricas tras un ping válido, se responde `metricsStatus: unavailable`, frescura `unknown` y `metricsAsOf: null`. En ese caso los contadores cero no son evidencia de una cartelera vacía. La caché nunca omite el ping ni oculta una caída de conexión.

## Retención y migración

El worker guarda `ScrapeRun`, checkpoints y depuración en la misma transacción, bajo el fence vigente cuando hay lease. Retiene **30 días** de corridas, eliminando como máximo **500 filas por registro de corrida**. Usa el índice de `completedAt`; un backlog grande se drena en corridas sucesivas. Health no hace escrituras ni elimina historial. Los checkpoints sobreviven a esa retención para que un éxito antiguo continúe apareciendo como antiguo, en lugar de desaparecer o refrescarse artificialmente. Si no corre el worker no hay depuración; no se promete un máximo absoluto de filas.

La migración `20261113170000_chain_scrape_state` es aditiva; requiere `prisma migrate deploy` antes del worker. No infiere éxitos desde el historial viejo. Se probaron las siete migraciones desde cero, ausencia de diferencias de esquema y aplicación del nuevo DDL a tablas previas con datos sintéticos, conservándolos. No se modificó la base configurada de la aplicación. Ver [procedimiento de migraciones](DATABASE-MIGRATIONS.md).

## Benchmark reproducible

Desde `api/`, configurar `TEST_POSTGRES_URL` a un PostgreSQL descartable de localhost y ejecutar:

```sh
npm run test:integration -- --testPathPatterns=health-benchmark
```

El runner crea una base con nombre aleatorio, aplica migraciones y la elimina al terminar. El benchmark inserta **10.000 funciones sintéticas**, calienta la conexión, cuenta consultas físicas mediante eventos Prisma y compara las cuatro operaciones anteriores con `AppService` actualizado. No mide tráfico HTTP, CPU o memoria del despliegue. El resultado completo se guarda en `api/.tmp/health-benchmark.json`.

Medición local del 13/11/2026, Windows, Node 22, PostgreSQL 15.19, 100 sondeos dentro del TTL:

| Escenario | Consultas SQL | Tiempo total observado |
| --- | ---: | ---: |
| Antes, serie | 400 | 327 ms |
| Después, serie, caché inicialmente fría | 103 | 54 ms |
| Después, concurrentes, caché inicialmente fría | 103 | 96 ms |

**74,25 % menos consultas** en este escenario; se verifica el conteo en el test. Los tiempos son una observación local, no un SLO ni una proyección de ahorro de recursos en producción. Esto justifica el agregado combinado y la caché de health. No se modifican las consultas de cartelera, TTL de contenido ni arquitectura del worker: requieren sus propios perfiles antes de optimizarlos.

## Navegador real y controles

Desde `api/`, con dependencias instaladas en `api/` y `web/`:

```sh
npx puppeteer browsers install chrome
npm run test:browser
```

También admite `PUPPETEER_EXECUTABLE_PATH` para usar Chrome instalado; en Windows se verificó con Chrome local. CI usa `/usr/bin/google-chrome-stable`, ya incluido en la imagen del runner, y comprueba su versión antes del recorrido. Así evita descargar otro navegador e instalar dependencias del sistema con `--install-deps`, operación que requiere root y causó el primer fallo remoto de CI. En un Linux propio podrían hacer falta paquetes del sistema, que debe instalar su administrador. El script inicia Next y una API de fixtures en `127.0.0.1:33440/33441`, bloquea solicitudes externas del navegador y cierra sus procesos al terminar. Requiere esos puertos libres. No usa Prisma, proveedores de cine ni TMDB.

Recorrido aprobado: cartelera, búsqueda/limpieza, filtro de zona conservando fecha, detalle y selector de cine conservando fecha, enlace de entradas con `noopener`, estreno en diálogo móvil, foco dentro del diálogo y devolución al disparador con Escape, ausencia de desborde horizontal móvil, vacío válido, 404 y error de proveedor 503 llegando al error boundary. Se inspeccionaron las capturas de detalle de escritorio y diálogo móvil, disponibles localmente en `api/.tmp/browser-journey/`. Es una prueba funcional en navegador con fixtures, no una prueba de los proveedores vivos ni una auditoría completa de accesibilidad. CI incorpora el mismo recorrido.

Cierre local: **161 tests unitarios backend, 37 de PostgreSQL (incluido benchmark y ensayo de migración), 5 contratos HTTP y 25 tests frontend**, más recorrido Chrome; lint, TypeScript de ambos proyectos, builds y validación Prisma pasan. Los dobles de TMDB de tres suites anteriores recibieron casts explícitos para que también pase la comprobación TypeScript completa de tests.

## Riesgos que siguen bajo seguimiento

`npm audit --omit=dev`, consultado nuevamente el 13/11: frontend 0 alertas; API 7 paquetes afectados (3 altas y 4 bajas), mismos árboles transitivos que la revisión anterior. No se hicieron upgrades forzados. [Evaluación y seguimiento](SECURITY-DEPENDENCY-AUDIT.md).

Persisten verificaciones de entorno: proveedores vivos y ventanas reales de cobertura, compatibilidad de Puppeteer/stealth en scraping de Cinépolis, topología productiva de proxy, aplicación de migraciones al despliegue y perfiles de consumo reales. El recorrido de navegador usa Chrome/Puppeteer sin stealth y no demuestra que Cinépolis acepte la automatización. La ejecución local tampoco afirma que la nueva corrida remota de CI ya haya terminado. No se agregan Redis, paginación o refresco de metadata sin evidencia específica que los justifique.
