# Etapa 1 — Integridad de datos

## R01: payloads parcialmente inválidos

Los seis adaptadores detectan registros internos inválidos y evitan declarar una extracción completa. Atlas y Cinemark conservan los registros válidos como extracción parcial; Showcase descarta árboles de película inválidos y conserva las otras películas; Cinépolis hace lo mismo por estructura de horarios. Multiplex valida las funciones antes de filtrar por complejo y Cinema Center registra enlaces/horarios AJAX inválidos.

Se validan fechas de calendario y límites de hora sin aceptar normalización automática de fechas imposibles. Las exclusiones de complejos ajenos al catálogo siguen siendo esperadas y no se consideran corrupción.

Verificación R01: 102 tests backend pasan, incluidas 9 regresiones nuevas; build backend pasa. No se consultaron proveedores reales.
