# Etapa 1 — Integridad de datos

## R01: payloads parcialmente inválidos

Los seis adaptadores detectan registros internos inválidos y evitan declarar una extracción completa. Atlas y Cinemark conservan los registros válidos como extracción parcial; Showcase descarta árboles de película inválidos y conserva las otras películas; Cinépolis hace lo mismo por estructura de horarios. Multiplex valida las funciones antes de filtrar por complejo y Cinema Center registra enlaces/horarios AJAX inválidos.

Se validan fechas de calendario y límites de hora sin aceptar normalización automática de fechas imposibles. Las exclusiones de complejos ajenos al catálogo siguen siendo esperadas y no se consideran corrupción.

Verificación R01: 102 tests backend pasan, incluidas 9 regresiones nuevas; build backend pasa. No se consultaron proveedores reales.

## R02: cobertura explícita para borrar

El orquestador exige inicio y fin válidos y ordenados para eliminar funciones. Verifica además que los registros pertenezcan a la ventana declarada. Un snapshot completo o vacío sin cobertura se degrada a parcial: se agregan funciones válidas pero no se eliminan ausencias. Cinema Center no considera vacío verificado un HTML sin enlaces de películas.

**Limitación operativa explícita:** los adaptadores actuales no certifican aún un horizonte completo de borrado. Hasta verificar el contrato vivo de cada fuente, funcionan conservadoramente con inserción aditiva y reportan cobertura desconocida. El CLI mantiene su salida no exitosa para corridas parciales. No se inventan ventanas a partir de la última función ni se habilita un flag global que permita borrar sin evidencia. La limpieza de funciones ya vencidas continúa independiente.

Las pruebas de reemplazo/rollback anteriores ahora declaran sus ventanas sintéticas explícitamente. Ocho regresiones nuevas cubren límites faltantes/inválidos, vacío limitado a un día, snapshot aditivo y registros fuera de cobertura.

## R03: identidad de origen, año y alias persistentes

Cada adaptador conserva `originalTitle`; Atlas y Cinema Center agrupan por título normalizado con año cuando está presente. Cinemark, Showcase y Cinépolis conservan el ID de película de origen; Multiplex usa el enlace de película cuando existe. El resolutor recibe además la cadena, evitando colisiones de IDs entre proveedores. Variantes de formato del mismo ID continúan agrupadas.

La nueva tabla `MovieAlias` relaciona esas claves de origen con la película canónica. Al reconciliar una película temporal con una existente se trasladan tanto funciones como alias dentro de la transacción. El año original llega a TMDB; un resultado de otro año se rechaza. Si hay varios homónimos exactos y falta el año, se conserva la identidad de origen sin adivinar un enriquecimiento.

**Migración requerida antes de ejecutar el worker actualizado:** aplicar `20261111143000_add_movie_source_aliases` mediante el procedimiento existente de `prisma migrate deploy`. La migración agrega la tabla, su FK con cascada y un índice; no transforma los datos históricos. Los alias se van registrando durante las próximas extracciones. Los casos mezclados por versiones anteriores no se pueden separar automáticamente sin evidencia de origen; no se reasignan horarios históricos por heurística.

Verificación SQL: se aplicaron las seis migraciones en orden sobre PostgreSQL embebido aislado (PGlite), y se comprobaron homónimos, FK de alias y cascada sin afectar la otra película. Esto verifica el SQL, pero no sustituye las pruebas de Prisma, pooling y concurrencia en PostgreSQL 15 previstas para la etapa 2. Docker no estaba iniciado y no se tocó la base configurada.

Regresiones R03: títulos con años distintos, IDs iguales de proveedores distintos, IDs distintos con título idéntico, agrupación de formatos, propagación de título original, alias temporal reconciliado y recordado durante una nueva caída de TMDB, y rechazo de candidatos de otro año o ambiguos.

Límite de la fuente: si el proveedor no entrega ID ni año y dos películas tienen exactamente el mismo título, no hay evidencia suficiente para distinguirlas. Se evita enriquecimiento ambiguo; la cobertura viva por proveedor sigue pendiente.

## Cierre de verificación de la etapa

- Backend: 26 suites y 118 tests unitarios; 5 tests HTTP con Prisma/TMDB simulados.
- Frontend: 14 tests, lint, TypeScript y build Turbopack.
- Build backend, lint con cero advertencias y `prisma validate`: pasan.
- SQL: seis migraciones aplicadas en una base embebida temporal; FK, cascada y conservación del homónimo comprobadas.
- No se ejecutaron escrituras sobre la base configurada ni consultas de scraping a proveedores reales. Las pruebas de Prisma/pooling/concurrencia sobre PostgreSQL 15 y el recorrido en navegador pertenecen al siguiente plan.
