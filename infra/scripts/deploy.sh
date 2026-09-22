#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 1 || ("$1" != "staging" && "$1" != "production") ]]; then
  echo "Uso: $0 <staging|production>" >&2
  exit 2
fi

environment="$1"
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
ENV_FILE="${TASKFLOW_ENV_FILE:?TASKFLOW_ENV_FILE debe apuntar al env seguro del host}"
PROJECT_NAME="${TASKFLOW_PROJECT_NAME:-taskflow-$environment}"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Falta el archivo de entorno seguro: $ENV_FILE" >&2
  exit 1
fi

set -a
source "$ENV_FILE"
set +a

: "${TASKFLOW_RELEASE:?TASKFLOW_RELEASE es obligatorio}"
COMPOSE=(docker compose --project-name "$PROJECT_NAME" --env-file "$ENV_FILE" -f "$ROOT_DIR/compose.production.yaml")

web_config="$("${COMPOSE[@]}" config)"
if ! grep -q 'NODE_ENV: production' <<<"$web_config" || ! grep -q 'command: node server.js' <<<"$web_config"; then
  echo "La configuracion de release no parece de produccion: revisa compose.production.yaml" >&2
  exit 1
fi

"${COMPOSE[@]}" pull web api worker
"${COMPOSE[@]}" up -d --wait db redis
"${COMPOSE[@]}" run --rm --no-deps api python manage.py check --deploy
"${COMPOSE[@]}" run --rm --no-deps api python manage.py migrate --noinput
"${COMPOSE[@]}" run --rm --no-deps api python manage.py collectstatic --noinput
"${COMPOSE[@]}" up -d web api worker
"${COMPOSE[@]}" ps

TASKFLOW_PUBLIC_URL="${TASKFLOW_PUBLIC_URL:?TASKFLOW_PUBLIC_URL es obligatorio}" \
  "$ROOT_DIR/infra/scripts/smoke.sh"
