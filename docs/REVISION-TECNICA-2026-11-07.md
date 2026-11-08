# Revisión técnica de Cine Radar

Fecha: 7 de noviembre de 2026. Base revisada: `78fab`, rama `main`, árbol inicialmente limpio.

## Dictamen

El proyecto tiene una base interesante para portfolio: separación de scrapers por estrategia, extracción HTTP en cinco cadenas, frontend con componentes de servidor, índices declarados y protección administrativa. Los problemas más importantes están en la confiabilidad de la actualización, la reproducibilidad de la base y las dependencias. Conviene resolverlos antes de presentarlo como preparado para producción.

Esta es una auditoría inicial de código y verificaciones locales. No es una certificación de seguridad ni una comprobación de que los seis proveedores estén funcionando actualmente. No se ejecutaron scrapers, seeds, migraciones ni escrituras contra la base configurada. No se hicieron commits ni pushes.

## Verificaciones realizadas

| Verificación | Resultado |
| --- | --- |
| Backend: `npm run build` | Pasa |
| Backend: Jest | 2 suites, 8 pruebas, todas pasan |
| Backend: ESLint, sin `--fix` | Falla: 14 errores y 3 advertencias |
| Prisma: `prisma validate` | Pasa; esto no comprueba que las migraciones reproduzcan el esquema |
| Frontend: ESLint | Pasa |
| Frontend: TypeScript sin emisión | Pasa |
| Frontend: build predeterminado, Turbopack | Falla al crear/conectar un subproceso de PostCSS en el entorno restringido; requiere reproducción fuera de este entorno |
| Frontend: build con `--webpack` | Pasa; una consulta a `/movies/upcoming` falla por acceso de red y se genera igualmente la página estática vacía |
| `npm audit --omit=dev`, consulta al registro | API: 37 paquetes afectados (2 críticos, 26 altos, 5 moderados, 4 bajos). Web: 9 (1 crítico, 6 altos, 2 moderados) |
| Simulaciones con servicios compilados y dependencias falsas | Confirman pérdida de datos al fallar la inserción, conservación de horarios obsoletos con resultado vacío, éxito aunque fallen todas las estrategias, colisión de IDs y validación insuficiente |
| Catálogo declarativo | 68 sedes únicas por cadena; 69 entradas porque Showcase comparte nombre de sede con IMAX |

Las alertas de npm incluyen dependencias transitivas y severidades heredadas. No equivalen a 46 vulnerabilidades independientes explotables. Los mismos paquetes pueden aparecer en ambos árboles. Los recuentos corresponden a los lockfiles y al registro consultados en esta fecha.

Los E2E existentes no se ejecutaron: importan `AppModule`, que conecta a la base real configurada. Se comprobó por lectura que todavía esperan `Hello World!`, mientras el controlador devuelve un objeto de estado.

## Hallazgos y correcciones propuestas

P1: resolver antes de presentar/desplegar como producción. P2: corregir en las siguientes etapas. P3: presentación y mantenimiento. La severidad de un advisory de npm se trata por separado de esta prioridad de ingeniería.

### F01 — P1: reemplazo de horarios sin transacción

Referencia: `api/src/scraper/services/scraper-orchestrator.service.ts:186`.

Se hace `deleteMany` y luego `createMany` en operaciones independientes. Una falla de inserción, desconexión o terminación entre ambas elimina la cartelera anterior. Reproducido con un Prisma simulado: después de un error en `createMany`, la colección previa quedó vacía.

Corrección: preparar y validar los datos fuera de la transacción; reemplazar los horarios dentro de una transacción corta por sede y ventana de fechas. Prueba: provocar el error de inserción y comprobar que la transacción conserva la cartelera anterior en PostgreSQL de prueba.

### F02 — P1: un resultado parcial puede borrar funciones válidas; uno vacío conserva funciones canceladas

Referencias: `api/src/scraper/services/scraper-orchestrator.service.ts:186`, `api/src/scraper/showcase/showcase.service.ts:152`, contrato en `api/src/scraper/interfaces/scraper.interface.ts`.

Showcase ignora errores individuales de películas y devuelve el resto. El orquestador no sabe si la extracción es completa y borra todas las funciones futuras de la sede, incluso las películas o fechas ausentes por error. A la inversa, si una sede devuelve correctamente cero funciones, el guard `showtimesBatch.length > 0` impide limpiar la cartelera anterior. Varios scrapers omiten las sedes vacías por completo.

Corrección: el contrato debe distinguir éxito completo, vacío confirmado y falla parcial, además de la ventana temporal cubierta. Reemplazar únicamente la ventana completa confirmada; preservar datos ante fallas. No deducir un cierre real a partir de un HTTP 200 vacío sin validar estructura/cobertura. Pruebas: película fallida, sede sin funciones y horizonte más corto que el anterior.

### F03 — P1: el cron puede quedar verde aunque no recolecte nada

Referencias: `api/src/scraper/services/scraper-orchestrator.service.ts:66`, `api/src/cli/run-scrapers.ts:32`, bloques `catch` de los scrapers.

Los proveedores transforman muchos errores en resultados vacíos; `runAll` también captura fallas de estrategias sin incluirlas en el resultado. El CLI termina con código cero cuando la promesa se resuelve. Reproducido: las seis estrategias lanzaron errores y `runAll` devolvió éxito con `chains: []`.

Corrección: devolver estados y errores por cadena/sede, diferenciar cartelera vacía legítima y extracción fallida, y propagar un estado no exitoso al CLI para fallas definidas como críticas. Registrar cobertura, descartes y última actualización válida. Prueba: proveedor caído y esquema de respuesta cambiado deben producir un resultado verificable y un exit code acorde.

### F04 — P1: las migraciones no crean la base que necesita el código

Referencias: `api/prisma/schema.prisma` y `api/prisma/migrations/20260222170935_init_cinema_schema/migration.sql`.

La única migración no incluye columnas actuales como `Movie.genres`, `backdropUrl`, `overview`, `releaseDate`, timestamps ni `CinemaLocation.zone`, `city`, `externalId`, `url`. Tampoco crea los índices/constraints nuevos ni refleja las cascadas. Una base nueva construida solo con `migrate deploy` no puede ejecutar correctamente la aplicación ni el seed actual. `prisma validate` no detecta esta divergencia.

Corrección: agregar migraciones incrementales, sin reescribir una migración ya aplicada. Comprobar duplicados antes de crear constraints. Validar en PostgreSQL desechable tanto una instalación nueva como una actualización desde el esquema inicial. Definir un procedimiento separado para reconciliar una base existente que se haya actualizado con `db push`.

### F05 — P1: dependencias con alertas de seguridad altas y críticas

Referencias: ambos `package-lock.json`. Versiones bloqueadas relevantes: Next `16.1.6`, sharp `0.34.5`, Axios `1.13.5`, Nest core `11.1.14`, Puppeteer `24.37.5`, Prisma `6.19.2`.

El frontend usa optimización de imágenes y tiene versiones incluidas en avisos de Next/sharp. El advisory [GHSA-2464-fhr4-w9xw del mantenedor de Next](https://github.com/vercel/next.js/security/advisories/GHSA-2464-fhr4-w9xw) describe posible ejecución remota en Linux con glibc bajo condiciones concretas. No se verificó que esas condiciones sean alcanzables en el despliegue de este proyecto.

En API los paquetes marcados críticos incluyen `basic-ftp` y `proxy-addr`. El código propio no usa FTP y no configura `trust proxy`: corresponde revisar las rutas transitivas y condiciones de explotación, sin afirmar que exista un endpoint público vulnerable a cada alerta. El [aviso de proxy-addr](https://github.com/advisories/GHSA-jqcg-44mw-7w3h) documenta la condición de confianza de subredes IPv4 mapeadas.

Corrección: actualizar familias compatibles por separado, verificar cambios de Node/ESM y repetir build, contratos y audit. Eliminar Axios del frontend si se confirma que sigue sin uso. No ejecutar `npm audit fix --force`: las sugerencias incluyen cambios mayores de Prisma/Puppeteer y aparentes retrocesos de puppeteer-extra. Evaluar esos cambios como migraciones propias.

### F06 — P1: ejecución de shell construida con input de Actions

Referencia: `.github/workflows/daily-scraper.yml:54`.

`${{ inputs.chain }}` se inserta directamente en un script Bash sin validación ni quoting. Un input con metacaracteres puede convertirse en comandos dentro de un job que recibe secretos. El origen es `workflow_dispatch`, así que requiere permisos para despachar el workflow; no es una vía anónima desde la web.

Corrección: usar input de tipo choice y pasar el valor por una variable de entorno citada, además de validar las claves admitidas. Reducir permisos del job. Prueba: entradas con espacios/metacaracteres deben rechazarse o llegar como un único argumento literal, sin ejecutarse.

### F07 — P1: ejecuciones solapadas pueden competir por la misma cartelera

Referencias: orquestador; `api/src/scraper/scraper.controller.ts`; workflow sin `concurrency`; `api/src/cron/cron.service.ts`.

No hay exclusión entre un disparo manual, el cron interno y Actions. Dos ejecuciones pueden intercalar borrados/inserciones, publicar un snapshot antiguo o lanzar varios navegadores. La API de Railway sigue teniendo endpoints que ejecutan el trabajo pesado, aunque el README la describe como servidor liviano.

Corrección: serializar Actions sin cancelar una actualización a mitad de persistencia y definir exclusión compartida por cadena para todas las vías habilitadas. Preferir el worker como único ejecutor productivo; deshabilitar los disparos pesados en el servidor HTTP si no forman parte del diseño deseado. Prueba: dos disparos concurrentes y vencimiento/recuperación del bloqueo. Una bandera en memoria no basta entre procesos.

### F08 — P1: identidad de respaldo colisionable y duplicación ante fallas de TMDB

Referencia: `api/src/scraper/services/scraper-orchestrator.service.ts:230`.

Un hash de 32 bits se usa como `tmdbId` negativo y clave única. Reproducido: títulos distintos `an` y `c0` generan `-3117`, por lo que un upsert puede mezclar películas y funciones. Además, TMDB devuelve `null` tanto por ausencia real como por una falla temporal: se crea una película sintética y en una ejecución posterior puede crearse otra con ID real, sin reconciliación.

Corrección: separar identidad interna/de proveedor y TMDB opcional, distinguir error transitorio de ausencia confirmada y reconciliar el enriquecimiento. Incluir esta evolución en una migración independiente. Pruebas: colisión, caída temporal y recuperación de TMDB sin duplicación ni cambio de asociaciones.

### F09 — P2: pérdida de la fecha al navegar de cine a película

Referencias: `web/src/app/theaters/[id]/page.tsx:129`, `web/src/components/movies/MovieCard.tsx:23`.

La cartelera del cine consulta `selectedDate`, pero la tarjeta solo transmite `cinemaId`. Elegir mañana y abrir una película muestra las funciones de hoy, posiblemente ninguna.

Corrección: propagar la fecha seleccionada al enlace de la tarjeta. Prueba: cine → día futuro → película conserva cine y día.

### F10 — P2: IDs y fechas aceptan valores que no representan la consulta deseada

Referencias: `api/src/movies/dto/get-movie.dto.ts:15`, `api/src/movies/movies.service.ts:70`, páginas dinámicas de cine/película.

La validación acepta `chainId=1.5`, luego `parseInt` consulta la cadena 1. También acepta números fuera del rango de un Int de Prisma y `2026-02-30`; este último se convierte en 2 de marzo al construir el rango. Todo esto fue reproducido con el ValidationPipe real y los DTO compilados. En el frontend, una fecha arbitraria puede alcanzar `format(parseISO(...))` y provocar una excepción.

Corrección: enteros positivos dentro de rango; fechas de calendario válidas, estrictamente `YYYY-MM-DD`; validar también search params antes de renderizar. Probar decimales, overflow, arrays, fechas inexistentes y año bisiesto. Responder 400 o mostrar una selección válida, según la capa.

### F11 — P2: normalización inconsistente de títulos e idiomas

Referencias: `api/src/scraper/services/title-normalizer.service.ts:18`, `api/src/tmdb/tmdb.service.ts:52`.

`D-BOX` pierde el guion antes de eliminar el token: `Film D-BOX` queda `Film D BOX`, confirmado. El idioma solo reconoce ciertos textos: `EN ENGLISH` y combinaciones como `EN SUB` caen en castellano. Debe verificarse qué etiquetas devuelve cada proveedor antes de asumir su significado. TMDB mantiene otra limpieza independiente y siempre elige `results[0]`; homónimos/remakes pueden resolverse incorrectamente.

Corrección: una normalización común con fixtures reales por proveedor, preservar sufijos legítimos, mapear idiomas de forma explícita y usar año/ID del proveedor o criterios de coincidencia cuando existan. Agregar casos que no estén presentes en los tests actuales.

### F12 — P2: errores de infraestructura se presentan como ausencia de contenido

Referencias: `web/src/lib/api.ts:49`, `api/src/tmdb/tmdb.service.ts`, `web/src/app/movie/[id]/page.tsx:67`.

HTTP 500, timeout, rate limit, falta de configuración y 404 terminan en `null`/`[]`. Las pantallas de error no reciben esas fallas. Se observó durante el build Webpack: falló la API de próximos estrenos y se prerenderizó una página vacía, con revalidación de una hora. La vista de película inexistente tampoco llama a `notFound()`.

Corrección: distinguir no encontrado, resultado vacío y servicio no disponible; lanzar errores controlados para activar boundaries y evitar publicar/cachear vacíos por fallas transitorias. Agregar timeout explícito al fetch del servidor. Probar 200 vacío, 404, 429, 500 y timeout por separado.

### F13 — P2: configuración CORS más amplia que la allowlist declarada

Referencia: `api/src/main.ts:36`.

Se acepta cualquier origen terminado en `.vercel.app`, incluyendo proyectos de terceros, con `credentials: true`. La clave administrativa sigue siendo necesaria: CORS no evita ni reemplaza la autenticación y este hallazgo no implica por sí solo acceso administrativo.

Corrección: orígenes exactos de producción y previews autorizados; habilitar credenciales solo si se necesitan. Verificar por separado comportamiento de orígenes aceptados, rechazados y llamadas servidor a servidor.

### F14 — P2: las descargas de Chromium no están deshabilitadas como se declara

Referencias: `api/nixpacks.toml:14`, `.github/workflows/daily-scraper.yml:25`.

Se configura `PUPPETEER_SKIP_CHROMIUM_DOWNLOAD`, que no aparece entre las variables consultadas por `puppeteer/lib/cjs/puppeteer/getConfiguration.js` instalado. La versión actual usa `PUPPETEER_SKIP_DOWNLOAD` y opciones específicas de navegador. En Actions, `PUPPETEER_EXECUTABLE_PATH` puede evitar la descarga por otra vía; Railway no tiene esa misma configuración, por lo que hay riesgo de descargar Chrome durante la instalación.

Corrección: variable compatible y comprobación en instalación limpia. Separar dependencias de worker y API cuando resulte práctico. La importación dinámica evita cargar Chrome al arrancar, pero no impide su descarga en postinstall.

### F15 — P2: reloj local del host en cron y borrado

Referencias: `api/src/cron/cron.service.ts:13`, `api/src/scraper/services/scraper-orchestrator.service.ts:137`.

El cron interno no declara zona horaria; `setHours(0,0,0,0)` usa la del host, mientras los horarios extraídos y las consultas públicas usan Argentina. En un host UTC las 04:00 del cron no son las 04:00 de Argentina y el límite del reemplazo puede empezar a las 21:00 argentinas del día previo.

Corrección: compartir utilidades de fechas argentinas, fijar zona del cron si se conserva y alinear los límites con la ventana de extracción. Probar cambio de día con host UTC y Argentina.

### F16 — P2: Cinépolis carece de límites y validación de respuesta completos

Referencia: `api/src/scraper/cinepolis/cinepolis.service.ts:101`.

Los `fetch` dentro de `page.evaluate` no tienen AbortController/timeout propio ni comprueban `response.ok` o errores GraphQL. El timeout de navegación no limita esas consultas. Además se carga la página completa sin bloquear medios ni analítica, y Chrome se lanza con `--no-sandbox`.

Corrección: timeouts por petición y por ejecución, validación HTTP/GraphQL, reporte de errores parciales y cierre garantizado. Medir antes de bloquear recursos; mantener los necesarios para el flujo. Evaluar HTTP directo con evidencia de que funcione estable. Revisar aislamiento del navegador y permisos del runner. La clave de cliente incrustada no se considera automáticamente un secreto propio filtrado: verificar su naturaleza y parametrizarla para mantenimiento.

### F17 — P2: faltan checks de calidad que protejan las partes críticas

Referencias: `api/test/app.e2e-spec.ts:23`, `api/eslint.config.mjs`, `.github/workflows`.

Los 8 tests se limitan al guard y normalizador. No hay pruebas del orquestador, parsers, persistencia ni recorrido de navegación. El E2E generado espera una respuesta obsoleta y no cierra la app. El workflow diario compila pero no ejecuta lint/tests; no hay workflow de CI de pull requests. ESLint backend falla en `main.ts`, `movies.service.ts` y `cinepolis.service.ts`.

Corrección: CI de PR con instalaciones reproducibles, lint sin modificar archivos, build y tests relevantes. PostgreSQL temporal para integración; fixtures locales para cada scraper; un recorrido web de fecha/cine/película. Reutilizar la configuración de bootstrap en tests y cerrar recursos. No llamar a servicios reales en los tests habituales.

## Mejoras de consumo y operación

1. **Leer menos datos para la cartelera.** `MoviesService.getNowPlaying` obtiene todas las funciones del día con sus campos, para luego devolver una por película. Reducir columnas con `select` y evaluar agregación SQL para disponibilidad/próxima función. Medir consultas y memoria; la reducción de transferencias será más relevante que microoptimizar el filtro de texto del frontend.
2. **Evitar reescritura completa de snapshots sin cambios.** Tras resolver F01/F02, comparar snapshots o hashes y actualizar diferencias cuando convenga. Reducir escrituras, WAL y rotación de IDs. Actualmente `createMany` reduce el número de statements, pero no elimina las operaciones repetidas por película/sede ni el costo de borrar y recrear.
3. **Caché con límites y vencimiento.** Los mapas de búsqueda/detalle de TMDB no tienen tamaño máximo ni TTL; resultados negativos pueden durar toda la vida del proceso. Evitar consultas duplicadas simultáneas con una promesa compartida por clave. En el worker diario el proceso termina, por lo que el crecimiento es menos preocupante que en la API persistente. Corregir claves `today` al cruzar medianoche e invalidación tras actualizaciones si continúan los disparos desde API. No introducir Redis para este volumen sin necesidad medida.
4. **Separar API y worker de forma efectiva.** El CLI usa `AppModule`, inicializando módulos de HTTP, cron y catálogo que no necesita. Un módulo propio para el worker reduce acoplamiento e inicialización. Separar instalación/despliegue permite evitar Puppeteer y herramientas de migración en el runtime HTTP.
5. **Reintentos acotados y concurrencia medida.** Para 429/5xx/timeouts usar backoff con jitter y respetar Retry-After; no reintentar errores de contrato. Una concurrencia pequeña puede reducir duración, pero aumenta pico de memoria y tráfico: establecer límites por proveedor y probarlos. No lanzar todas las cadenas en paralelo por defecto.
6. **Observabilidad útil.** Registrar duración, sedes esperadas/exitosas/fallidas, funciones vistas/válidas/guardadas, llamadas TMDB y última corrida exitosa. Separar liveness de readiness de base y frescura de cartelera. El `/health` actual solo informa que el proceso responde. Verificar IP real y throttling detrás del proxy del hosting antes de confiar en el límite por usuario.
7. **Frontend liviano y accesible.** Medir el bundle de Framer Motion y cantidad de imágenes priorizadas. El modal de estrenos necesita semántica de diálogo, Escape, control/restauración de foco y nombre accesible para cerrar; usar un componente de diálogo existente resulta más mantenible. Agregar etiquetas accesibles a búsqueda y selector.

Para comparar consumo: mismo dataset y misma máquina, al menos tres corridas; registrar RSS de Node y Chrome por separado, CPU acumulada, duración, cantidad/bytes de requests y consultas/escrituras SQL. Para API, latencia p50/p95 con caché fría/caliente y concurrencia fija. No se midió el hosting ni se verificaron las cifras actuales de RAM o ahorro del README.

## Lectura como revisor técnico de contratación

Lo que ayuda: problema real y demostrable, arquitectura comprensible, uso razonable de HTTP frente a navegador y catálogo declarativo. Lo que hoy debilita la presentación: el scraper puede mentir sobre su éxito, una instalación por migraciones no es reproducible y las pruebas no cubren el principal riesgo del negocio.

El README debería explicar el alcance diario de actualización en lugar de prometer tiempo real; respaldar con metodología las cifras de RAM, velocidad y ahorro; actualizar el catálogo de 65 a las 68 sedes configuradas si esa cobertura se verifica; y quitar referencias a `DIRECT_URL` que el schema ya no usa. También hay conflicto entre API y web al usar ambas el puerto 3000; `scrape:prod` se documenta antes de compilar. Agregar un camino local completo usando el PostgreSQL de Docker y puertos distintos, `.env.example` del frontend, requisitos de Node y comandos verificados. Los README internos siguen siendo plantillas de Nest/Next. Declarar limitaciones de cobertura y revisar atribución de TMDB y condiciones de las fuentes sin afirmar cumplimiento no comprobado.

No hace falta agregar microservicios, colas o infraestructura nueva para que resulte profesional. La evidencia de corrección, fallos explícitos, instalación reproducible y decisiones medidas pesa más que enumerar patrones.

## Etapas y política de Git

Usar una rama `codex/revision-cine-radar`, commits pequeños y una entrega por etapa. Un commit por problema debe incluir implementación, prueba de regresión y documentación que corresponda; no separar el test de la corrección. Los cambios de una misma familia de dependencias se agrupan por compatibilidad. Hacer un solo push de la rama al cerrar la etapa, con todos sus commits; el push no es la unidad de revisión, lo es el PR. Evitar squash si interesa conservar el historial por hallazgo.

| Etapa | Alcance | Ejemplos de commits | Criterio de cierre |
| --- | --- | --- | --- |
| 0. Diagnóstico | Este informe; capturar baseline | `docs: record technical audit and remediation plan` | Hallazgos con evidencia y límites explícitos |
| 1. Seguridad y base reproducible | F04, F05, F06, F13; CI mínimo y lint de F17 | `fix(db): add missing schema migrations`; `fix(web): update vulnerable framework dependencies`; `fix(api): update compatible security dependencies`; `fix(ci): pass scraper input safely`; `fix(api): restrict CORS origins`; `ci: validate pull requests` | Base nueva por migraciones; lint/build/tests; alertas críticas resueltas o evaluadas con condiciones documentadas; un push |
| 2. Integridad y ejecución confiable | F01, F02, F03, F07, F08, F15, F16 | `fix(scraper): replace showtimes atomically`; `fix(scraper): preserve data on partial extraction`; `fix(cli): report failed scraping runs`; `fix(scraper): prevent overlapping updates`; `fix(movies): separate fallback identity from TMDB`; `fix(scraper): use Argentina day boundaries`; `fix(cinepolis): bound GraphQL requests` | Fixtures de seis proveedores; integración con rollback, vacío y parcial; CLI falla cuando corresponde; concurrencia controlada; un push |
| 3. Funcionamiento visible | F09, F10, F11, F12; completar F17 | `fix(web): preserve selected showtime date`; `fix(api): validate calendar dates and integer IDs`; `fix(scraper): normalize titles consistently`; `fix(web): distinguish outages from empty results` | Recorrido cine/día/película, inputs inválidos y fallas de proveedor cubiertos; un push |
| 4. Consumo y portfolio | F14 y mejoras medidas; README y accesibilidad | `perf(api): reduce billboard query payload`; `perf(tmdb): bound and deduplicate cache entries`; `build: isolate scraper worker dependencies`; `fix(build): skip browser download with supported configuration`; `docs: document verified setup and benchmarks` | Comparación antes/después, instalación limpia, documentación reproducible, sin pérdida de cobertura; un push |

Dependencias entre cambios: F02 requiere mejorar el contrato de F03 antes de permitir reemplazos de vacíos; F08 puede necesitar una segunda migración después de F04. Separar esos commits cuando cada estado sea válido. La migración mayor de Prisma/Puppeteer se gestiona de forma propia si las actualizaciones compatibles no resuelven las alertas.

## Pendiente de validar con un entorno aislado

- Comportamiento vivo y contratos actuales de los seis proveedores, incluyendo interpretación de fechas de Cinemark y etiquetas de idioma.
- Aplicación real y rollback de migraciones sobre PostgreSQL, sin usar la base configurada durante la auditoría.
- E2E actualizado y recorrido visual en navegador con API controlada.
- Build predeterminado de Next fuera de las restricciones de subprocesos del entorno actual.
- Consumo real, límites del pool, política de proxy y despliegue productivo; no se infieren de comentarios o del README.
- Historial completo y escaneo especializado de secretos: la búsqueda acotada de patrones en archivos actuales no sustituye un secret scanner.
