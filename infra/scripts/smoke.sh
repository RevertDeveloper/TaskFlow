#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${TASKFLOW_PUBLIC_URL:-https://taskflow.carlosrevert.es}"
BASE_URL="${BASE_URL%/}"

curl --fail --silent --show-error --location --max-time 10 "$BASE_URL/login" -o /dev/null
curl --fail --silent --show-error --location --max-time 10 "$BASE_URL/api/health" -o /dev/null
curl --fail --silent --show-error --location --max-time 10 "$BASE_URL/api/ready" -o /dev/null
printf 'Smoke público correcto: %s\n' "$BASE_URL"
