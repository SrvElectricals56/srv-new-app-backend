#!/usr/bin/env bash
set -Eeuo pipefail

SECRETS_DIR="${SECRETS_DIR:-/opt/srv/secrets}"
TARGET_DATABASE="${TARGET_DATABASE:-srv_staging}"
CONNECTION_ENV="${SECRETS_DIR}/managed-postgres.env"
CA_FILE="${SECRETS_DIR}/managed-postgres-ca.crt"

if [[ ! "${TARGET_DATABASE}" =~ ^[a-z][a-z0-9_]*$ ]]; then
  echo "Invalid PostgreSQL database name: ${TARGET_DATABASE}" >&2
  exit 1
fi

test -r "${CONNECTION_ENV}"
test -r "${CA_FILE}"

read_env_value() {
  local key="$1"
  local value
  value="$(grep -m1 -E "^${key}=" "${CONNECTION_ENV}" | cut -d= -f2-)"
  value="${value%\"}"
  value="${value#\"}"
  value="${value%\'}"
  value="${value#\'}"
  printf '%s' "${value}"
}

DB_HOST="$(read_env_value DB_HOST)"
DB_PORT="$(read_env_value DB_PORT)"
DB_USERNAME="$(read_env_value DB_USERNAME)"
DB_PASSWORD="$(read_env_value DB_PASSWORD)"

export PGHOST="${DB_HOST}"
export PGPORT="${DB_PORT}"
export PGUSER="${DB_USERNAME}"
export PGPASSWORD="${DB_PASSWORD}"
export PGDATABASE="defaultdb"
export PGSSLMODE="verify-full"
export PGSSLROOTCERT="${CA_FILE}"

existing="$(psql -X -tAc "SELECT 1 FROM pg_database WHERE datname = '${TARGET_DATABASE}'" | xargs)"
if [[ "${existing}" == "1" ]]; then
  echo "Database ${TARGET_DATABASE} already exists; refusing to overwrite it." >&2
  exit 2
fi

psql -X -v ON_ERROR_STOP=1 -c "CREATE DATABASE \"${TARGET_DATABASE}\""
echo "Created ${TARGET_DATABASE} with verified TLS."
