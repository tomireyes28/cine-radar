# Segunda revisión técnica — Cine Radar

Fecha: 11 de noviembre de 2026. Base: `fb276`, rama `main`, árbol de trabajo inicialmente limpio. Contraste contra la revisión del 7 de noviembre. Esta revisión agrega documentación; no implementa correcciones ni hace commits/pushes.

## Resultado general

Las cuatro etapas anteriores tienen implementación real. Se corrigieron el reemplazo no transaccional, los fallos silenciosos del CLI, la validación básica, los enlaces de fecha/cine, la configuración CORS, el input de Actions y la descarga de Chromium. Hay nuevas migraciones, worker independiente, telemetría, cachés acotadas, sincronización diferencial y diálogo accesible. No corresponde repetir el plan anterior completo.

Sin embargo, varias garantías quedan incompletas: la transacción evita un borrado a medias, pero todavía puede confirmar un borrado incorrecto si el proveedor se clasifica como completo o vacío sin suficiente evidencia. La nueva identidad elimina el hash colisionable pero todavía mezcla homónimos. Los bloqueos tienen vencimiento sin renovación ni verificación del propietario al persistir.

## Verificación actual

| Control | Resultado |
| --- | --- |
| Backend unitario | 23 suites, 93 tests pasan |
| Contratos HTTP con dependencias simuladas | 5 tests pasan; fue necesario permitir conexiones locales fuera de la restricción del sandbox |
| Backend build y lint:check | Pasan |
| Frontend unitario | 14 tests pasan |
| Frontend lint y TypeScript | Pasan |
| Build predeterminado Next 16.4.5 / Turbopack | Pasa al habilitar subprocesos locales; ya no queda pendiente como en la primera revisión |
| npm audit --omit=dev, registro consultado nuevamente | Web: 0. API: 7 paquetes afectados, 3 altos y 4 bajos; 0 críticos y 0 moderados |
| Diagnósticos adicionales sin base ni proveedores reales | Cinco comportamientos reproducidos, detallados abajo |

Las siete alertas API corresponden a `prisma`, `@prisma/config`, `deepmerge-ts`, `deepmerge`, `puppeteer-extra`, `puppeteer-extra-plugin-stealth` y `puppeteer-extra-plugin-user-preferences`. Son paquetes afectados, no siete exploits demostrados. Prisma CLI está ahora en devDependencies; algunas otras dependencias transitivas siguen instaladas con el worker. Conservar evaluación de exposición y fechas de revisión; evitar afirmar seguridad absoluta basándose solo en audit.

No se ejecutaron seeds, migraciones ni scraping contra la base configurada. Tampoco se verificaron los contratos vivos de los proveedores, el historial remoto de CI, la infraestructura productiva o benchmarks de consumo. Los E2E HTTP actuales sustituyen Prisma/TMDB por mocks. El test web llamado journey prueba utilidades y cliente API, no un navegador real.

## Hallazgos pendientes

P1: prioridad alta por riesgo de datos. P2: confiabilidad y funcionamiento. Cada R identifica una unidad de corrección con su propia prueba y commit.

### R01 — P1: todavía se declara extracción completa después de descartar registros inválidos

Referencias: `api/src/scraper/atlas/atlas.service.ts:75`, `api/src/scraper/cinemark/cinemark.service.ts:134`; revisar también los niveles internos de Showcase, Cinépolis y Multiplex.

Atlas/Cinemark detectan el cambio de contrato si cero registros son válidos. Si uno es válido y otro no, omiten el inválido y devuelven `complete`. La sincronización diferencial interpreta la ausencia como cancelación y puede eliminar funciones válidas anteriores. Multiplex cuenta bloques JSON corruptos, pero no todos los horarios descartados dentro de un bloque.

Reproducción realizada: simular Atlas con un elemento válido y otro `{ unexpected: 'schema drift' }`. Todas las sedes devolvieron `complete`. No se consultaron proveedores externos.

Corrección: registrar descartes relevantes en cada nivel, diferenciar exclusiones esperadas de corrupción y degradar a parcial cuando no se pueda garantizar completitud. En estado parcial conservar ausencias. Prueba de aceptación: payload mixto, falla de un registro interno y cambio parcial del esquema no borran funciones anteriores.

### R02 — P1: vacío sin ventana confirmada puede eliminar toda la cartelera futura

Referencias: `api/src/scraper/services/scraper-orchestrator.service.ts:610`, `api/src/scraper/interfaces/scraper.interface.ts:25`, `api/src/scraper/cinemacenter/cinemacenter.service.ts:81`.

Los proveedores no rellenan `coveredFrom`/`coveredUntil`. En `empty_verified`, el orquestador borra desde hoy sin límite superior si falta `coveredUntil`. Además, Cinema Center considera vacío confirmado que no se encuentren enlaces de película: un HTML de mantenimiento o un cambio de selector produce el mismo resultado. Las ventanas están en el contrato, pero no implementadas por los adaptadores.

Reproducción realizada: pasar una sede `empty_verified` sin cobertura a `persistChainData`, con Prisma falso. El filtro de borrado no contiene `lte`: elimina también fechas futuras que esa respuesta nunca confirmó.

Corrección: exigir límites válidos para cualquier eliminación y evidencia explícita del vacío del proveedor. Ante cobertura desconocida, conservar datos y reportar degradación. La ventana debe venir del contrato verificado del proveedor; no inferir su completitud únicamente de la última función presente. Aceptación: una respuesta limitada a hoy no borra mañana; mantenimiento/selector cambiado no simulan cierre.

### R03 — P1: homónimos y años distintos siguen compartiendo identidad

Referencias: `api/src/scraper/services/movie-identity.service.ts:16`, `api/src/common/utils/title-normalizer.util.ts:39` y llamadas al normalizador desde los scrapers.

La clave única se construye con el título normalizado sin año. `Batman (1989)` y `Batman (2022)` generan `batman`, confirmado con el servicio real. Además, los scrapers normalizan antes de entregar el título al resolutor y este llama a TMDB con `displayTitle`, ya sin el año. El soporte de `yearHint` de TMDB no recibe la pista por ese recorrido. Si ya existe una película enriquecida por esa clave, se retorna directamente sin consultar TMDB.

Corrección: conservar título de origen, año y/o ID estable de la película del proveedor; separar aliases de identidad canónica. Evitar usar únicamente un título para decidir que dos películas son la misma. Aceptación: dos versiones del mismo título mantienen películas y horarios separados; aliases de una misma película se reconcilian.

### R04 — P2: creación de películas no segura ante concurrencia entre cadenas

Referencia: `api/src/scraper/services/movie-identity.service.ts:45`, `:69`, `:153`.

Hay secuencias `findUnique` → HTTP → `create` y actualización de `tmdbId` sin manejo del conflicto único. Dos llamadas individuales de cadenas distintas están permitidas por los bloqueos por cadena. Si descubren la misma película simultáneamente, ambas pueden leer ausencia y una fallará con conflicto de unicidad, degradando la persistencia de la sede.

Estado de evidencia: carrera identificada por lectura del flujo; no se ejecutó concurrencia sobre PostgreSQL real. Corrección: creación/reconciliación atómica, relectura ante conflicto único y protección de la fusión de identidades. Aceptación: dos procesos independientes resuelven la misma película al mismo ID sin fallar ni duplicar funciones.

### R05 — P2: el bloqueo puede vencer mientras su propietario continúa trabajando

Referencias: `api/src/scraper/services/scraper-lock.service.ts`, `api/src/scraper/services/scraper-orchestrator.service.ts`.

La lease por cadena dura 20 minutos y la global 25. No hay heartbeat, límite total de ejecución ni comprobación de propiedad antes de escribir. El token solo protege el DELETE de liberación. Si el proceso tarda más o queda suspendido y luego vuelve, un segundo proceso puede reclamar el bloqueo mientras el anterior sigue habilitado para publicar su snapshot.

El timeout de 15 minutos de Actions limita ese canal, pero no todos los usos de CLI/HTTP/cron. Corrección: plazo total de ejecución, renovación de lease y rechazo de escrituras del propietario vencido mediante una comprobación atómica adecuada. Aceptación: el dueño antiguo que despierta después del vencimiento no publica datos ni libera el bloqueo nuevo. Revisar también el resultado del bloqueo global cuando ya hay una cadena individual activa: hoy puede devolver una corrida degradada en lugar de esperar/rechazarla.

### R06 — P2: los tests de atomicidad no recorren la rama diferencial que usa Prisma real

Referencias: `api/src/scraper/services/f01-atomic-replacement.spec.ts`, orquestador `:671`, `.github/workflows/ci.yml` y `api/test/app.e2e-spec.ts`.

El mock transaccional de la suite F01 implementa delete/create pero no `tx.showtime.findMany`. Por eso el código toma el fallback de reemplazo completo; en producción toma la rama diferencial. Los tests HTTP también usan Prisma falso. CI levanta PostgreSQL para migraciones/seed, pero no lo usa en estas pruebas de persistencia y bloqueo.

Corrección: pruebas de integración reales para el camino diferencial, rollback, cambio de ticketUrl, eliminación de cancelaciones, conservación de IDs, reconciliación y competencia por locks. Eliminar o justificar el fallback productivo dependiente de si el mock tiene un método. Aceptación: CI prueba PostgreSQL temporal con dos clientes/procesos cuando corresponde; ninguna prueba conecta a la base configurada del desarrollador.

### R07 — P2: el timeout del frontend termina antes de leer el cuerpo

Referencia: `web/src/lib/api.ts:159`, `:186`.

El `finally` limpia el timer cuando `fetch` devuelve encabezados, antes de `res.json()`. Un servidor que responde encabezados pero demora el cuerpo supera el límite anunciado. Reproducción realizada: `timeoutMs: 10`, respuesta inmediata con JSON demorado 90 ms; la operación finalizó correctamente después del límite.

Corrección: mantener el timeout hasta terminar la lectura y clasificar también abortos durante el cuerpo como timeout. Aceptación: servidor local que envía encabezados y deja el cuerpo pendiente produce el error esperado dentro del plazo. Un simple Promise.race sin cancelar la lectura no alcanza.

### R08 — P2: Retry-After se acorta y provoca reintentos antes de tiempo

Referencia: `api/src/common/utils/http-retry.util.ts`, `computeRetryDelayMs`.

El valor indicado por el servidor se limita con `Math.min(maxDelayMs, retryAfterMs)`. Reproducción realizada: respuesta 429 con `Retry-After: 120` produce una espera de 8.000 ms, no 120.000. Puede agravar rate limits del proveedor.

Corrección: si Retry-After excede el presupuesto del worker, posponer/abandonar la consulta con estado explícito; no reintentar antes del plazo. Aceptación: verificar segundos, fecha HTTP, plazo mayor al presupuesto y cancelación global, sin esperas reales largas en tests.

### R09 — P2: frescura global incorrecta y health costoso

Referencia: `api/src/app.service.ts`.

`isStale` equivale a no tener funciones futuras. Una sola función a futuro mantiene frescura aparente aunque el último scraping válido sea antiguo o varias cadenas fallen. El health ejecuta ping, count, aggregate y lectura de corrida en cada consulta; su frecuencia de monitoreo puede introducir carga evitable.

Corrección: separar readiness de disponibilidad/calidad de datos; calcular antigüedad y cobertura por cadena con última extracción exitosa, distinguiendo vacío válido de error. Cachear brevemente métricas costosas y establecer retención de `ScrapeRun`. Aceptación: una cadena fallida y otra con horarios futuros se refleja como frescura parcial, sin impedir automáticamente que una API capaz de servir datos arranque.

### R10 — P2: el filtro city todavía busca únicamente en el nombre de la sede

Referencias: `api/src/movies/movies.service.ts:65`, `:214`.

Existe un campo `CinemaLocation.city`, pero `city` se traduce exclusivamente a `name contains city`. Una sede cuyo nombre no contenga su ciudad queda fuera, aunque su campo city coincida. Afecta cartelera y detalle.

Corrección: acordar la semántica documentada y usar el campo city o un OR ciudad/nombre si se desea admitir ambos. Aceptación: sede con nombre y ciudad diferentes, mayúsculas/acentos y combinación con zona/cadena/cine. Una corrección lógica, un commit.

## Mejoras posteriores; requieren medición

- La consulta de cartelera ahora usa select, pero todavía carga todas las funciones del día para devolver una por película. Medir bytes/filas y evaluar agregación antes de añadir infraestructura.
- `MoviesService.invalidateCache()` no tiene llamadas; las actualizaciones se ven tras los TTL acumulados de API/web. Definir un objetivo de demora aceptable; no introducir Redis sin necesidad.
- La API aún importa ScraperModule/Core y comparte la instalación de dependencias con el worker; el módulo CLI separado mejora inicialización, pero no elimina Puppeteer del paquete productivo HTTP.
- `MovieIdentityService` retorna películas ya enriquecidas sin refrescar metadata. Un detalle de TMDB fallido inicialmente puede dejar duración/géneros vacíos indefinidamente. Definir refresco acotado y conservar metadata válida.
- Falta un recorrido en navegador real y validación periódica contra proveedores vivos con límites controlados. No confundir fixtures sintéticos o llamadas a utilidades con cobertura visual end-to-end.
- Agregar benchmarks reproducibles y ajustar afirmaciones del README a evidencia. Mantener las alertas transitivas bajo seguimiento, con responsable/plazo de revisión.

## Nuevo plan por etapas

Una rama de correcciones con prefijo `codex/`, un commit por R, con su prueba y documentación en el mismo commit. Push al terminar cada etapa, una vez que pase su criterio de cierre. No hacer squash si se desea conservar un commit por hallazgo. Las etapas siguientes no están implementadas por este informe.

| Etapa | Commits propuestos | Criterio de cierre antes del push |
| --- | --- | --- |
| 1. Proteger los datos | R01 `fix(scraper): downgrade malformed partial payloads`; R02 `fix(scraper): require verified bounded deletion windows`; R03 `fix(movies): preserve provider identity and release year` | Datos válidos preservados ante corrupción parcial y vacíos; homónimos separados; regresiones de los cinco proveedores HTTP y Cinépolis; migración de identidad revisada si corresponde |
| 2. Concurrencia y persistencia real | R06 `test(db): exercise differential sync against PostgreSQL`; R04 `fix(movies): handle concurrent identity resolution`; R05 `fix(scraper): renew leases and reject expired writers` | Tests en PostgreSQL temporal del camino productivo, rollback real, dos clientes y propietario vencido; lint/build/tests; un push |
| 3. Límites de red y consultas | R07 `fix(web): enforce timeout through response body`; R08 `fix(http): honor retry-after within execution budget`; R10 `fix(api): query cinema city correctly` | Servidor lento controlado, 429 y filtros combinados cubiertos; sin consultas a proveedores reales en CI; un push |
| 4. Operación y evidencia | R09 `fix(health): report per-chain freshness with bounded probe cost`; después mejoras de consumo independientes, solo si el benchmark justifica cada una | Frescura/retención definidas, recorrido de navegador, benchmark antes/después y actualización del documento de riesgos; un push |

Orden práctico: agregar R06 antes de modificar la lógica concurrente para contar con pruebas sobre PostgreSQL. Las regresiones unitarias específicas de R01–R03 se agregan junto a cada corrección desde la primera etapa. Cualquier despliegue/migración sobre datos existentes se prepara y valida primero en una copia aislada; este informe no verifica que las migraciones nuevas ya estén aplicadas en producción.

## Comprobaciones pendientes, separadas de defectos confirmados

- Instalación limpia y actualización de una copia con datos heredados mediante las migraciones actuales; validar también homónimos en el backfill de normalizedKey.
- Prueba viva de cada adaptador y semántica de fechas/idiomas; la revisión local no demuestra cobertura productiva de 68 sedes.
- Topología real del proxy y TRUST_PROXY. El valor por defecto de un salto en producción requiere comprobar las rutas de acceso del hosting.
- Compatibilidad real de lanzamiento de Chrome/Puppeteer/stealth en el runner de Actions tras la actualización mayor; los tests de Cinépolis sustituyen el navegador.

El principal trabajo pendiente ya no es agregar estructura general: es cerrar los casos que pueden publicar o borrar datos incorrectos y comprobarlos en el camino productivo real.
