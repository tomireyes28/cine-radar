# Evaluación de Dependencias y Alertas de Seguridad (`F05`)

Última consulta: 13 de noviembre de 2026. Evidencia original de remediación: 7 de noviembre.

Revalidación con `npm audit --omit=dev`: frontend 0 alertas; API 7 paquetes afectados, 3 altos y 4 bajos, en los mismos árboles listados abajo. No son siete explotaciones demostradas. Responsable de seguimiento: mantenimiento del repositorio; próxima revisión prevista: 13 de diciembre de 2026, o antes ante cambios de dependencias/exposición. La evaluación está limitada al código y entradas actuales; no acredita seguridad absoluta del entorno desplegado.

## Resumen de remediación (`npm audit --omit=dev`)

| Paquete / Árbol | Antes | Después | Estado |
| :--- | :--- | :--- | :--- |
| **`web/` (Producción)** | 9 afectadas (1 crítica, 6 altas, 2 moderadas) | **0 vulnerabilidades** | Resuelto al eliminar `axios` sin uso y actualizar `next` / `eslint-config-next` a `16.4.5` + `sharp`. |
| **`api/` (Producción)** | 37 afectadas (2 críticas, 26 altas, 5 moderadas, 4 bajas) | **0 críticas, 0 moderadas**, 3 altas (CLI build-time), 4 bajas | Resueltas todas las alertas críticas y de runtime HTTP (`@nestjs/*`, `axios`, `proxy-addr`, `basic-ftp`, `multer`, `body-parser`, `path-to-regexp`, `qs`, `undici`, `ws`, `puppeteer@25.16.0`). |

## Evaluación de alertas transitivas remanentes en `api/`

Siguiendo la recomendación de ingeniería de **no ejecutar `npm audit fix --force`** a ciegas cuando implica saltos mayores incompatibles o downgrades rotos:

1. **`deepmerge-ts` → `@prisma/config` → `prisma` (Severidad reportada: High)**
   - **Condición de explotación:** Afecta al parser de archivos de configuración de la herramienta CLI `prisma` ante grafos de objetos recursivos cíclicos.
   - **Exposición observada:** Prisma CLI está en devDependencies. El servidor HTTP y el worker usan `@prisma/client` con configuración estática; no se identificó un recorrido desde entradas de usuario o respuestas externas a `@prisma/config`. Mantener la alerta bajo seguimiento y evaluar una actualización mayor de Prisma por separado, con sus migraciones y pruebas de compatibilidad.

2. **`deepmerge` → `puppeteer-extra` / `puppeteer-extra-plugin-stealth` (Severidad reportada: Low)**
   - **Condición de explotación:** Contaminación de prototipo si se fusionan objetos controlados por un atacante en `mergeObject()`.
   - **Exposición observada:** `puppeteer-extra` se instancia en `CinepolisService` con opciones internas fijas; no se identificó una fusión de opciones controladas por usuarios o proveedores en ese recorrido. Esto reduce la exposición observada, pero no elimina el aviso transitivo ni sustituye revisar cambios futuros. Evitar `npm audit fix --force` sin verificar el árbol resultante y la compatibilidad del navegador.
