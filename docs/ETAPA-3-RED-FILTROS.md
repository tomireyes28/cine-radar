# Etapa 3 — Red y filtros

Base: `main` en `503e0`. Un commit por hallazgo y un push al cerrar la etapa.

## R07: timeout hasta terminar el cuerpo

El cliente API mantiene el AbortController y su temporizador durante la recepción y lectura del JSON. El temporizador se limpia en un único `finally`, tanto en éxito como en error. Un aborto por plazo durante la lectura se reporta como `timeout`; un cuerpo JSON mal formado sigue siendo `invalid_json` y un corte de transferencia se reporta como `network`. Los estados 404, 429 y otros errores HTTP conservan su tratamiento anterior.

Además se comprueba el plazo con reloj monotónico antes de devolver datos, para no publicar un éxito tardío si un adaptador ignoró la señal. El transporte real debe respetar AbortSignal para interrumpir su descarga; no se utiliza un Promise.race que deje una lectura nativa abierta. Se rechazan duraciones de timer inválidas antes de enviar la solicitud.

Verificación R07: 22 tests frontend pasan, incluyendo ocho regresiones nuevas. Se usa un servidor HTTP real de localhost que envía encabezados y deja el cuerpo abierto; se comprueba que el cliente aborte y el servidor observe el cierre. También se comprueban JSON inválido, conexión cortada, limpieza de timer, éxito tardío y configuración inválida. No se consultan servicios externos.

## R08: Retry-After y presupuesto de espera

El límite del backoff exponencial (`maxDelayMs`) ya no recorta el mínimo indicado por el servidor. El nuevo `maxTotalDelayMs`, cuyo valor por defecto es `maxDelayMs`, limita la espera acumulada entre intentos. Si la siguiente espera no cabe, se abandona esa consulta con `HttpRetryDeferredError`, conservando el error original como causa y exponiendo espera requerida y presupuesto restante. No se agenda un job nuevo ni se envía un reintento anticipado.

Por defecto, un `Retry-After: 120` se difiere sin dormir 120 segundos y sin reintentar a los ocho segundos. Un consumidor puede permitir una espera mayor mediante un presupuesto explícito. Las duraciones inválidas y el overflow no llegan al temporizador. La cancelación de la etapa 2 continúa interrumpiendo las esperas y evita solicitudes posteriores.

Se aceptan segundos y las tres formas HTTP-date, interpretadas en UTC; los valores mal formados recurren al backoff. Referencia de semántica: [RFC 9110, Retry-After](https://www.rfc-editor.org/rfc/rfc9110.html#section-10.2.3). El presupuesto cuenta esperas asignadas, no el tiempo de cada solicitud: los timeouts HTTP y el plazo de la lease siguen limitando esas operaciones por separado.

Las regresiones usan reloj falso y esperas inyectadas para comprobar el instante del siguiente request, fechas UTC/formatos antiguos, presupuesto acumulado, espera superior al backoff, overflow, errores originales y cancelación, sin esperas reales largas ni proveedores externos.
