# TaskFlow

TaskFlow es un gestor personal de tareas web/PWA. La foundation inicial usa
Next.js + TypeScript en `apps/web` y Django + Django REST Framework en
`apps/api`, con PostgreSQL, Redis y un worker preparado para fases posteriores.

## Desarrollo local

Requisitos: Docker Compose, Node.js 24 y Python 3.12.

```bash
cp .env.example .env.dev
make dev-up
```

Servicios locales:

- Web: http://localhost:10730
- API health: http://localhost:10731/health/
- PostgreSQL: `127.0.0.1:10740`
- Redis: `127.0.0.1:10750`

Los puertos de desarrollo están fijados en loopback y no compiten con la
instancia pública. Para detenerla usa `make dev-down`; para reconstruirla usa
`make dev-rebuild`. PostgreSQL, Redis y cachés de desarrollo usan volúmenes
`taskflow-development_*`, distintos de los volúmenes persistentes de producción.
No copies el entorno productivo a `.env.dev`.

## Aplicar cambios en producción

En el host productivo, el comando habitual reconstruye las imágenes web/API,
valida Django, aplica migraciones, actualiza `web`, `api` y `worker`, y ejecuta
el smoke HTTP. Conserva los volúmenes existentes de PostgreSQL, Redis y audio.

```bash
make rebuild
```

Make usa por defecto el `.env` de la raíz del repositorio. Si el entorno de
producción está guardado fuera del checkout, indícalo con
`TASKFLOW_ENV_FILE=/ruta/segura/.env.production make rebuild` o expórtalo antes.
El archivo debe tener permisos restrictivos e incluir las variables requeridas
por `compose.production.yaml`. Para reconstruir sin caché usa
`make rebuild-no-cache`. No uses `make dev-rebuild` para publicar.
El rebuild conserva los volúmenes productivos actuales; no cambies sus nombres
sin una migración de datos y un backup verificado.

`make help` muestra los comandos separados de producción y desarrollo. Los
targets antiguos `make up`, `make up-app` y `make up-web-api` siguen apuntando a
desarrollo; `make up-public` es alias de `make rebuild`.

La clave interna de Accounts y cualquier credencial de proveedor viven sólo en
el entorno de API/worker. No se deben colocar en variables `NEXT_PUBLIC_*`, Git
ni logs.

## Checks

```bash
cd apps/web && npm ci && npm run lint && npm run typecheck && npm test && npm run build
cd apps/api && python -m pytest && ruff check . && python manage.py check
```

El workflow de GitHub Actions ejecuta estos checks en cada pull request y en
`main`. El dominio, la autenticación delegada a Accounts y el modelo de tareas
se implementan en las fases siguientes según `docs/ROADMAP.md`.