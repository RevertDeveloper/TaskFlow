# Compose por entorno

`compose.production.yaml` es la composición productiva compatible con el
workflow actual del repositorio. Este directorio contiene overlays que no
comparten volúmenes ni puertos con producción.

## Staging

Usa un proyecto Compose distinto y un archivo de entorno fuera de Git:

```bash
docker compose --project-name taskflow-staging \
  --env-file /ruta/segura/.env.taskflow-staging \
  -f compose.production.yaml \
  -f infra/compose/staging.yaml \
  up -d --build
```

El dominio de staging debe apuntar al puerto `STAGING_WEB_PORT`. Debe conservar
el mismo origen HTTPS, `SESSION_COOKIE_DOMAIN`, CSRF trusted origin y proxy
same-origin que producción. Nunca se reutilizan los volúmenes de producción.
