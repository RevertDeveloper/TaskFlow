# TaskFlow

TaskFlow es un gestor personal de tareas web/PWA. La foundation inicial usa
Next.js + TypeScript en `apps/web` y Django + Django REST Framework en
`apps/api`, con PostgreSQL, Redis y un worker preparado para fases posteriores.

## Desarrollo local

Requisitos: Docker Compose, Node.js 24 y Python 3.12.

```bash
cp .env.example .env
docker compose --env-file .env -f compose.yaml -f compose.dev.yaml up --build
```

Servicios locales:

- Web: http://localhost:10700
- API health: http://localhost:10701/health/
- PostgreSQL: `127.0.0.1:10710`
- Redis: `127.0.0.1:10720`

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