# Etapa 3 — Red y filtros

Base: `main` en `503e0`. Un commit por hallazgo y un push al cerrar la etapa.

## R07: timeout hasta terminar el cuerpo

El cliente API mantiene el AbortController y su temporizador durante la recepción y lectura del JSON. El temporizador se limpia en un único `finally`, tanto en éxito como en error. Un aborto por plazo durante la lectura se reporta como `timeout`; un cuerpo JSON mal formado sigue siendo `invalid_json` y un corte de transferencia se reporta como `network`. Los estados 404, 429 y otros errores HTTP conservan su tratamiento anterior.

Además se comprueba el plazo con reloj monotónico antes de devolver datos, para no publicar un éxito tardío si un adaptador ignoró la señal. El transporte real debe respetar AbortSignal para interrumpir su descarga; no se utiliza un Promise.race que deje una lectura nativa abierta. Se rechazan duraciones de timer inválidas antes de enviar la solicitud.

Verificación R07: 22 tests frontend pasan, incluyendo ocho regresiones nuevas. Se usa un servidor HTTP real de localhost que envía encabezados y deja el cuerpo abierto; se comprueba que el cliente aborte y el servidor observe el cierre. También se comprueban JSON inválido, conexión cortada, limpieza de timer, éxito tardío y configuración inválida. No se consultan servicios externos.
