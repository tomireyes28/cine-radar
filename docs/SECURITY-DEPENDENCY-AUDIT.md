# Evaluación de Dependencias y Alertas de Seguridad (`F05`)

Fecha de actualización: 7 de noviembre de 2026.

## Resumen de remediación (`npm audit --omit=dev`)

| Paquete / Árbol | Antes | Después | Estado |
| :--- | :--- | :--- | :--- |
| **`web/` (Producción)** | 9 afectadas (1 crítica, 6 altas, 2 moderadas) | **0 vulnerabilidades** | Resuelto al eliminar `axios` sin uso y actualizar `next` / `eslint-config-next` a `16.4.5` + `sharp`. |
| **`api/` (Producción)** | 37 afectadas (2 críticas, 26 altas, 5 moderadas, 4 bajas) | **0 críticas, 0 moderadas**, 3 altas (CLI build-time), 4 bajas | Resueltas todas las alertas críticas y de runtime HTTP (`@nestjs/*`, `axios`, `proxy-addr`, `basic-ftp`, `multer`, `body-parser`, `path-to-regexp`, `qs`, `undici`, `ws`, `puppeteer@25.16.0`). |

## Evaluación de alertas transitivas remanentes en `api/`

Siguiendo la recomendación de ingeniería de **no ejecutar `npm audit fix --force`** a ciegas cuando implica saltos mayores incompatibles o downgrades rotos:

1. **`deepmerge-ts` → `@prisma/config` → `prisma` (Severidad reportada: High)**
   - **Condición de explotación:** Afecta al parser de archivos de configuración de la herramienta CLI `prisma` ante grafos de objetos recursivos cíclicos.
   - **Impacto en Cine Radar:** **No explotable en ejecución.** El servidor HTTP y el worker usan únicamente `@prisma/client` con configuración estática del repositorio; ninguna entrada de usuario ni respuesta externa pasa por `@prisma/config`. La remediación upstream requiere migrar de Prisma 6 a Prisma 7+ (cambio mayor de arquitectura de `schema.prisma` / `prisma.config.ts`), planificable como actualización mayor independiente.

2. **`deepmerge` → `puppeteer-extra` / `puppeteer-extra-plugin-stealth` (Severidad reportada: Low)**
   - **Condición de explotación:** Contaminación de prototipo si se fusionan objetos controlados por un atacante en `mergeObject()`.
   - **Impacto en Cine Radar:** **No explotable en ejecución.** `puppeteer-extra` solo se instancia internamente en `CinepolisService` con opciones literales fijas y nunca recibe payloads externos. El comando sugerido por npm (`--force`) degrada `puppeteer-extra` a `2.1.3` rompiendo compatibilidad con Puppeteer moderno.
