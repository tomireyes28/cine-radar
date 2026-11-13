# Migración y verificación operativa — 13/11/2026

## Base Supabase

La base configurada contenía las cuatro tablas de catálogo/cartelera y el esquema exacto de las dos primeras migraciones, sin `_prisma_migrations`. Antes de cambiarla se guardó, con autorización explícita, una copia consistente de esas tablas, su esquema, constraints y estado de secuencias en `api/.tmp/deploy-stage4/`, fuera de Git. La copia contiene datos completos: conservarla como respaldo local y no publicarla.

Se restauraron sus 116 películas, 6 cadenas, 68 sedes y 18.253 funciones en PostgreSQL temporal. Se ensayaron las cinco migraciones pendientes y se comparó cada fila: películas y funciones conservaron IDs y relaciones. El único cambio previsto en columnas anteriores fue convertir 42 IDs TMDB sintéticos negativos en `null`, como exige la migración histórica de identidad.

Después se registraron las dos migraciones base mediante `prisma migrate resolve --applied`, sin reejecutar su SQL, y se aplicaron las cinco restantes mediante la conexión de sesión `DIRECT_URL`. `migrate status` y `migrate diff` confirmaron las siete migraciones y ausencia de diferencias. La comparación posterior con el respaldo confirmó la preservación esperada del inventario antes de ejecutar scraping.

## API y worker

Se arrancó la API compilada localmente contra el pooler transaccional de Supabase, con cron y scraping HTTP deshabilitados. Respondió 200 en liveness, health (`metricsStatus: ok`), filtros, cartelera y detalle; respondió 400 ante fecha inválida. El módulo worker pudo inicializarse y consultar las tablas de leases, corridas y frescura. No se encontró un backend remoto configurado: esta prueba acredita arranque local y conectividad real, no un despliegue público de NestJS.

El último fallo del worker programado anterior a la migración fue `relation "ScraperLock" does not exist`; esa tabla ya está creada. Una prueba posterior de Atlas descubrió otro problema: el heartbeat podía esperar el bloqueo de fila que mantenía una transacción propia y abortar por `lock_timeout` antes de que esa escritura terminara. Se reprodujo de forma determinista en PostgreSQL temporal con una escritura de 2,5 segundos.

La corrección aplaza únicamente el error SQL de contención `55P03` envuelto por Prisma como `P2010`. No lo trata como renovación exitosa ni extiende el plazo local. Cada escritura sigue comprobando propietario y expiración antes de confirmar; errores de conexión y pérdida de propiedad siguen abortando. Las regresiones verifican escritura larga individual, jerarquía global/cadena, rollback si realmente vence la lease, error de conexión y vencimiento del plazo total pese a contención repetida.

Verificación local posterior a esa corrección: 163 pruebas unitarias backend, 40 pruebas PostgreSQL y lint, TypeScript y build del backend pasan. Las pruebas de integración crean y eliminan exclusivamente sus propias bases temporales de localhost.

## CI y alcance de hosting

El primer CI remoto de la etapa 4 pasó migraciones, lint, build, pruebas unitarias, PostgreSQL y contratos HTTP; falló al instalar dependencias de Chrome sin privilegios root. Se reemplazó esa instalación por Chrome preinstalado del runner. El PR operativo ejecutó exitosamente ambas tareas de CI, incluido el recorrido real de navegador en Linux.

Una repetición de CI expuso una carrera en la instrumentación del benchmark: un evento de consulta Prisma podía llegar a JavaScript después de resolverse la promesa y registrar 102 consultas antes de recibir la número 103. El benchmark ahora sincroniza la entrega mediante una consulta barrera, excluida del conteo y tiempo del trabajo medido; conserva la comprobación exacta 400/103/103.

La ejecución controlada de Atlas en GitHub Actions después de migrar logró arrancar, conectarse y registrar su corrida y checkpoint; el proveedor respondió HTTP 403 en las siete sedes desde ese runner. El job falló de forma explícita y conservó los horarios anteriores. Esto es una restricción externa pendiente: no se acredita una sincronización exitosa de Atlas desde los runners alojados de GitHub ni de las seis cadenas completas. Hará falta acceso permitido por el proveedor o un entorno de ejecución admitido; no se añaden proxies ni se oculta el fallo.

GitHub Actions ya puede ejecutar el worker directamente contra Supabase sin un servidor NestJS permanente. El frontend actual todavía solicita datos a una API HTTP (`NEXT_PUBLIC_API_URL` local apunta a `localhost:3001`). Para eliminar ese servicio de producción hace falta adaptar la lectura de datos del lado servidor de Next.js o usar una API de Supabase con permisos/políticas adecuados. No exponer la contraseña de Postgres ni credenciales administrativas en el navegador. Esta migración no modifica esa arquitectura ni demuestra completitud de los seis proveedores vivos.
