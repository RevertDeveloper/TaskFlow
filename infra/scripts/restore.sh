#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
ENV_FILE="${TASKFLOW_ENV_FILE:-${ROOT_DIR}/.env.production}"
COMPOSE=(docker compose --project-name "${TASKFLOW_PROJECT_NAME:-taskflow-production}" --env-file "$ENV_FILE" -f "$ROOT_DIR/compose.production.yaml")

if [[ $# -ne 2 || "$2" != "--confirm" ]]; then
  echo "Uso: $0 <directorio-backup> --confirm" >&2
  exit 2
fi
backup_dir="$1"
if [[ ! -f "$ENV_FILE" || ! -f "$backup_dir/postgres.sql.gz" ]]; then
  echo "Entorno o backup incompleto." >&2
  exit 1
fi
if [[ ! -f "$backup_dir/SHA256SUMS" ]]; then
  echo "Falta el checksum del backup." >&2
  exit 1
fi
(cd "$backup_dir" && sha256sum --check SHA256SUMS)

set -a
source "$ENV_FILE"
set +a

"${COMPOSE[@]}" stop web api worker
"${COMPOSE[@]}" up -d db
"${COMPOSE[@]}" exec -T db psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c 'DROP SCHEMA public CASCADE; CREATE SCHEMA public;'
gunzip -c "$backup_dir/postgres.sql.gz" | "${COMPOSE[@]}" exec -T db psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"
printf 'Restore completado. Ejecuta migrate.sh y el smoke antes de arrancar la aplicación.\n'
