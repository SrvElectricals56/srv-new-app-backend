#!/usr/bin/env bash
set -Eeuo pipefail

SECRETS_DIR="${SECRETS_DIR:-/opt/srv/secrets}"
MIGRATION_ENV="${MIGRATION_ENV:-${SECRETS_DIR}/migration.env}"
CA_FILE="${CA_FILE:-${SECRETS_DIR}/managed-postgres-ca.crt}"
OUTPUT_FILE="${OUTPUT_FILE:-${SECRETS_DIR}/pgadmin-database-readonly.env}"
TARGET_DATABASE="${TARGET_DATABASE:-srv_staging}"
READONLY_ROLE="${READONLY_ROLE:-srv_pgadmin_readonly}"

for identifier in "${TARGET_DATABASE}" "${READONLY_ROLE}"; do
  if [[ ! "${identifier}" =~ ^[a-z][a-z0-9_]*$ ]]; then
    echo "Invalid PostgreSQL identifier: ${identifier}" >&2
    exit 1
  fi
done
test -r "${MIGRATION_ENV}"
test -r "${CA_FILE}"
if [[ -e "${OUTPUT_FILE}" ]]; then
  echo "${OUTPUT_FILE} already exists; refusing to overwrite it." >&2
  exit 2
fi

read_env_value() {
  local key="$1"
  local value
  value="$(grep -m1 -E "^${key}=" "${MIGRATION_ENV}" | cut -d= -f2-)"
  value="${value%\"}"
  value="${value#\"}"
  value="${value%\'}"
  value="${value#\'}"
  printf '%s' "${value}"
}

export PGHOST="$(read_env_value DB_HOST)"
export PGPORT="$(read_env_value DB_PORT)"
export PGUSER="$(read_env_value DB_USERNAME)"
export PGPASSWORD="$(read_env_value DB_PASSWORD)"
export PGDATABASE="${TARGET_DATABASE}"
export PGSSLMODE='verify-full'
export PGSSLROOTCERT="${CA_FILE}"

if [[ ! "${PGUSER}" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]]; then
  echo 'Invalid database owner role in migration environment.' >&2
  exit 1
fi
role_exists="$(psql -X -tAc "SELECT 1 FROM pg_roles WHERE rolname='${READONLY_ROLE}'" | xargs)"
if [[ "${role_exists}" == '1' ]]; then
  echo "Role ${READONLY_ROLE} already exists; rotate it explicitly instead." >&2
  exit 2
fi

readonly_password="$(openssl rand -base64 48 | tr -d '\n')"
psql -X -v ON_ERROR_STOP=1 \
  -v readonly_role="${READONLY_ROLE}" \
  -v owner_role="${PGUSER}" \
  -v readonly_password="${readonly_password}" \
  -v target_database="${TARGET_DATABASE}" <<'SQL'
SELECT format('CREATE ROLE %I LOGIN PASSWORD %L', :'readonly_role', :'readonly_password') \gexec
SELECT format('ALTER ROLE %I NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS CONNECTION LIMIT 5', :'readonly_role') \gexec
SELECT format('ALTER ROLE %I SET default_transaction_read_only = on', :'readonly_role') \gexec
SELECT format('ALTER ROLE %I SET statement_timeout = %L', :'readonly_role', '30s') \gexec
SELECT format('ALTER ROLE %I SET idle_in_transaction_session_timeout = %L', :'readonly_role', '30s') \gexec
SELECT format('GRANT CONNECT ON DATABASE %I TO %I', :'target_database', :'readonly_role') \gexec
GRANT USAGE ON SCHEMA public TO :"readonly_role";
GRANT SELECT ON ALL TABLES IN SCHEMA public TO :"readonly_role";
ALTER DEFAULT PRIVILEGES FOR ROLE :"owner_role" IN SCHEMA public
  GRANT SELECT ON TABLES TO :"readonly_role";
SQL

umask 077
{
  printf 'DB_HOST=%s\n' "${PGHOST}"
  printf 'DB_PORT=%s\n' "${PGPORT}"
  printf 'DB_DATABASE=%s\n' "${TARGET_DATABASE}"
  printf 'DB_USERNAME=%s\n' "${READONLY_ROLE}"
  printf 'DB_PASSWORD=%s\n' "${readonly_password}"
  printf 'DB_SSL_MODE=verify-full\n'
  printf 'DB_SSL_CA_PATH=/certs/managed-postgres-ca.crt\n'
} >"${OUTPUT_FILE}"
chmod 0640 "${OUTPUT_FILE}"
unset readonly_password

echo "Created restricted read-only role ${READONLY_ROLE}."
echo "Credentials were written to ${OUTPUT_FILE}."
