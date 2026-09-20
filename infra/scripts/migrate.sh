#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
ENV_FILE="${TASKFLOW_ENV_FILE:-${ROOT_DIR}/.env.production}"
COMPOSE=(docker compose --project-name "${TASKFLOW_PROJECT_NAME:-taskflow-production}" --env-file "$ENV_FILE" -f "$ROOT_DIR/compose.production.yaml")

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Falta el archivo de entorno seguro: $ENV_FILE" >&2
  exit 1
fi

"${COMPOSE[@]}" run --rm api python manage.py check --deploy
"${COMPOSE[@]}" run --rm api python manage.py migrate --noinput
"${COMPOSE[@]}" run --rm api python manage.py collectstatic --noinput
