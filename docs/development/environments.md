# Entornos

TaskFlow separa cuatro entornos. Ninguno comparte secretos ni volúmenes con
otro.

| Entorno | Configuración | Datos | Objetivo |
| --- | --- | --- | --- |
| development | `compose.yaml` + `compose.dev.yaml` | PostgreSQL/Redis locales | Desarrollo rápido y debugging |
| test | `config.settings.test`, Vitest, fixtures | Base efímera o SQLite de tests | Tests deterministas |
| staging | `compose.production.yaml` + `infra/compose/staging.yaml` | Volúmenes de staging | Smoke real de Accounts, cookies y despliegue |
| production | `compose.production.yaml` | Volúmenes de producción | Servicio público |

## Secretos

Los archivos `.env` de staging y producción viven fuera de Git y tienen permisos
`0600`. Son obligatorios: `DJANGO_SECRET_KEY`, `POSTGRES_PASSWORD`,
`ACCOUNTS_TASKFLOW_SERVICE_KEY` y `TASKFLOW_METRICS_TOKEN`. La clave de Accounts
se rota una sola vez desde Django Admin y sólo se guarda en el entorno del API y
worker. No se copia a `NEXT_PUBLIC_*`, imágenes, logs ni capturas.

## Producción local del host

El bloque reservado por el roadmap es:

- frontend público: `10700`;
- API sólo loopback: `10701`;
- PostgreSQL y Redis: sólo red interna de Compose.

Desarrollo local usa puertos distintos, ligados a loopback:

- web: `10730`;
- API: `10731`;
- PostgreSQL: `10740`;
- Redis: `10750`.

Los volúmenes dev tienen el prefijo `taskflow-development_`. Producción conserva
los volúmenes que ya están montados (`taskflow-dev_postgres_data` y
`taskflow-dev_redis_data`) para proteger los datos existentes; sus nombres no se
cambian sin una migración de datos y un backup probado.

Usa `.env.dev` para overrides locales. `make dev-up`, `make dev-rebuild` y
`make dev-down` operan únicamente sobre el proyecto `taskflow-dev`.

El proxy HTTPS debe apuntar únicamente a `127.0.0.1:10700`. La aplicación web
reenvía `/api/*` al API interno; el navegador no contacta directamente con
Django ni con Accounts.

## Secuencia segura

```bash
export TASKFLOW_ENV_FILE=/ruta/segura/.env.production
./infra/scripts/migrate.sh
docker compose --project-name taskflow-production --env-file "$TASKFLOW_ENV_FILE" \
  -f compose.production.yaml up -d --build
./infra/scripts/smoke.sh
```

En el host local, el atajo equivalente que construye y despliega las imágenes
de los cambios actuales es:

```bash
TASKFLOW_ENV_FILE=/ruta/segura/.env.production make rebuild
```

El target recrea sólo `web`, `api` y `worker`; nunca elimina ni recrea los
volúmenes de datos.

Las migraciones son explícitas y se ejecutan antes de recrear la aplicación. No
se ejecuta `down -v` en producción.
