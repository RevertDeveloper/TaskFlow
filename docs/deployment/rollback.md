# Rollback de producción

## Principios

Cada despliegue usa `TASKFLOW_RELEASE` como versión de imagen. Las migraciones
nuevas deben ser aditivas y compatibles con la versión anterior. Nunca se borra
un volumen para corregir un fallo de aplicación.

## Rollback de aplicación

1. Identificar el release anterior conocido y conservar el `X-Request-ID` de los
   fallos.
2. Ejecutar `docker compose ... pull` o reconstruir las imágenes de ese release.
3. Recrear sólo `web`, `api` y `worker` con el tag anterior.
4. Ejecutar `infra/scripts/smoke.sh` y revisar `/api/ready`.
5. Verificar login, logout, creación de tarea y healthcheck.

## Rollback de base de datos

Sólo se ejecuta si el cambio de schema no es compatible con la versión anterior:

1. Detener `web`, `api` y `worker`.
2. Elegir un backup probado de los últimos 7 días.
3. Ejecutar `infra/scripts/restore.sh <backup> --confirm` en el proyecto de
   producción.
4. Ejecutar `infra/scripts/migrate.sh` con la versión objetivo.
5. Arrancar la aplicación y repetir el smoke.

La restauración tiene pérdida máxima esperada de 24 horas según el RPO aprobado
y debe completarse en menos de 4 horas según el RTO. El drill se realiza primero
en staging o en un proyecto Compose aislado.

## Rollback de prompts y schemas AI

Los prompts y schemas versionados forman parte de la imagen. Se vuelve al tag
anterior junto con el código que los consume; nunca se modifica una respuesta
persistida manualmente.

## Accounts

No se revierte ni se modifica el mecanismo de sesión de Accounts durante un
rollback de TaskFlow. Si una clave interna se sospecha comprometida, se rota en
Accounts Admin, se actualiza el secret manager y se recrean API/worker.
