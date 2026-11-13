# Etapa 3 — Red y filtros

Base: `main` en `503e0`. Un commit por hallazgo y un push al cerrar la etapa.

## R07: timeout hasta terminar el cuerpo

El cliente API mantiene el AbortController y su temporizador durante la recepción y lectura del JSON. El temporizador se limpia en un único `finally`, tanto en éxito como en error. Un aborto por plazo durante la lectura se reporta como `timeout`; un cuerpo JSON mal formado sigue siendo `invalid_json` y un corte de transferencia se reporta como `network`. Los estados 404, 429 y otros errores HTTP conservan su tratamiento anterior.

Además se comprueba el plazo con reloj monotónico antes de devolver datos, para no publicar un éxito tardío si un adaptador ignoró la señal. El transporte real debe respetar AbortSignal para interrumpir su descarga; no se utiliza un Promise.race que deje una lectura nativa abierta. Se rechazan duraciones de timer inválidas antes de enviar la solicitud.

Verificación R07: 25 tests frontend pasan, incluyendo once regresiones nuevas. Se usa un servidor HTTP real de localhost que envía encabezados y deja el cuerpo abierto; se comprueba que el cliente aborte y el servidor observe el cierre. Las respuestas 404/429/503 cuyo cuerpo no se lee se cancelan sin alterar su semántica. También se comprueban JSON inválido, conexión cortada, limpieza de timer, éxito tardío y configuración inválida. No se consultan servicios externos.

## R08: Retry-After y presupuesto de espera

El límite del backoff exponencial (`maxDelayMs`) ya no recorta el mínimo indicado por el servidor. El nuevo `maxTotalDelayMs`, cuyo valor por defecto es `maxDelayMs`, limita la espera acumulada entre intentos. Si la siguiente espera no cabe, se abandona esa consulta con `HttpRetryDeferredError`, conservando el error original como causa y exponiendo espera requerida y presupuesto restante. No se agenda un job nuevo ni se envía un reintento anticipado.

Por defecto, un `Retry-After: 120` se difiere sin dormir 120 segundos y sin reintentar a los ocho segundos. Un consumidor puede permitir una espera mayor mediante un presupuesto explícito. Las duraciones inválidas y el overflow no llegan al temporizador. La cancelación de la etapa 2 continúa interrumpiendo las esperas y evita solicitudes posteriores.

Se aceptan segundos y las tres formas HTTP-date, interpretadas en UTC; los valores mal formados recurren al backoff. Referencia de semántica: [RFC 9110, Retry-After](https://www.rfc-editor.org/rfc/rfc9110.html#section-10.2.3). El presupuesto cuenta esperas asignadas, no el tiempo de cada solicitud: los timeouts HTTP y el plazo de la lease siguen limitando esas operaciones por separado.

Las regresiones usan reloj falso y esperas inyectadas para comprobar el instante del siguiente request, fechas UTC/formatos antiguos, presupuesto acumulado, espera superior al backoff, overflow, errores originales y cancelación, sin esperas reales largas ni proveedores externos.

## R10: ciudad o complejo, con filtros consistentes

La cartelera y el detalle usan el mismo constructor de condiciones: coincidencia parcial en `CinemaLocation.city` **o** `name`, combinada con zona, cadena, cine y fecha. Se conserva así la búsqueda por nombre que ya estaba documentada, sin excluir sedes cuyo nombre no contenga la ciudad. Se recortan espacios exteriores; una ciudad en blanco no agrega restricción.

Las coincidencias no distinguen mayúsculas según la colación de PostgreSQL y preservan los acentos: no se implementa búsqueda sin diacríticos ni se requiere una extensión. `%`, `_` y `\` se buscan como texto literal, no como comodines SQL. La clave de caché serializa los campos por separado para que dos combinaciones con `:` no compartan un resultado incorrecto.

Nueve regresiones sobre PostgreSQL real verifican ambos endpoints, ciudad distinta al nombre del complejo, búsqueda parcial por nombre, filtros combinados, ausencia de resultados, fechas, acentos, caracteres de patrón y separación de caché. El SQL de Prisma se ejecuta contra datos de prueba, sin simular el resultado de la consulta.

## Cierre de verificación

- Backend: 152 tests unitarios y 5 contratos HTTP pasan.
- PostgreSQL 15.19 real: 29 tests de integración pasan; las seis migraciones se aplican desde cero y el esquema coincide con Prisma.
- Frontend: 25 tests pasan, incluidos servidores HTTP locales con cuerpos detenidos o cortados.
- Lint, TypeScript, ambos builds y validación Prisma pasan.
- La etapa no agrega migraciones ni dependencias productivas. No se consultaron proveedores reales ni se realizaron escrituras sobre la base configurada de la aplicación.
