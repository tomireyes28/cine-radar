# Etapa 1 â€” Integridad de datos

## R01: payloads parcialmente invÃ¡lidos

Los seis adaptadores detectan registros internos invÃ¡lidos y evitan declarar una extracciÃ³n completa. Atlas y Cinemark conservan los registros vÃ¡lidos como extracciÃ³n parcial; Showcase descarta Ã¡rboles de pelÃ­cula invÃ¡lidos y conserva las otras pelÃ­culas; CinÃ©polis hace lo mismo por estructura de horarios. Multiplex valida las funciones antes de filtrar por complejo y Cinema Center registra enlaces/horarios AJAX invÃ¡lidos.

Se validan fechas de calendario y lÃ­mites de hora sin aceptar normalizaciÃ³n automÃ¡tica de fechas imposibles. Las exclusiones de complejos ajenos al catÃ¡logo siguen siendo esperadas y no se consideran corrupciÃ³n.

VerificaciÃ³n R01: 102 tests backend pasan, incluidas 9 regresiones nuevas; build backend pasa. No se consultaron proveedores reales.

## R02: cobertura explícita para borrar

El orquestador exige inicio y fin válidos y ordenados para eliminar funciones. Verifica además que los registros pertenezcan a la ventana declarada. Un snapshot completo o vacío sin cobertura se degrada a parcial: se agregan funciones válidas pero no se eliminan ausencias. Cinema Center no considera vacío verificado un HTML sin enlaces de películas.

**Limitación operativa explícita:** los adaptadores actuales no certifican aún un horizonte completo de borrado. Hasta verificar el contrato vivo de cada fuente, funcionan conservadoramente con inserción aditiva y reportan cobertura desconocida. El CLI mantiene su salida no exitosa para corridas parciales. No se inventan ventanas a partir de la última función ni se habilita un flag global que permita borrar sin evidencia. La limpieza de funciones ya vencidas continúa independiente.

Las pruebas de reemplazo/rollback anteriores ahora declaran sus ventanas sintéticas explícitamente. Ocho regresiones nuevas cubren límites faltantes/inválidos, vacío limitado a un día, snapshot aditivo y registros fuera de cobertura.
