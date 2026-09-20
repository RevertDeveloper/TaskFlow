#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
ENV_FILE="${TASKFLOW_ENV_FILE:-${ROOT_DIR}/.env.production}"
BACKUP_ROOT="${TASKFLOW_BACKUP_ROOT:-${ROOT_DIR}/var/backups}"
RETENTION_DAYS="${TASKFLOW_BACKUP_RETENTION_DAYS:-7}"
COMPOSE=(docker compose --project-name "${TASKFLOW_PROJECT_NAME:-taskflow-production}" --env-file "$ENV_FILE" -f "$ROOT_DIR/compose.production.yaml")

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Falta el archivo de entorno seguro: $ENV_FILE" >&2
  exit 1
fi

set -a
source "$ENV_FILE"
set +a

stamp="$(date -u +%Y%m%dT%H%M%SZ)"
target="$BACKUP_ROOT/$stamp"
umask 077
mkdir -p "$target"

"${COMPOSE[@]}" exec -T db pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --no-owner --no-privileges | gzip -9 > "$target/postgres.sql.gz"
gzip -t "$target/postgres.sql.gz"
(cd "$target" && sha256sum postgres.sql.gz > SHA256SUMS)

cat > "$target/metadata.txt" <<META
created_at_utc=$(date -u +%Y-%m-%dT%H:%M:%SZ)
project=${TASKFLOW_PROJECT_NAME:-taskflow-production}
database=${POSTGRES_DB}
retention_days=${RETENTION_DAYS}
META
chmod 600 "$target/postgres.sql.gz" "$target/SHA256SUMS" "$target/metadata.txt"
find "$BACKUP_ROOT" -mindepth 1 -maxdepth 1 -type d -mtime +"$RETENTION_DAYS" -exec rm -rf -- {} +
printf 'Backup creado: %s\n' "$target"
