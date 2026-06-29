#!/usr/bin/env bash
set -Eeuo pipefail

SECRETS_DIR="${SECRETS_DIR:-/opt/srv/secrets}"
MIGRATION_ENV="${SECRETS_DIR}/migration.env"
CA_FILE="${SECRETS_DIR}/managed-postgres-ca.crt"
MIGRATION_DIR="${MIGRATION_DIR:-/opt/srv/current/srv-new-app-backend/ops/migration}"
SOURCE_FILE="${SOURCE_FILE:-srvelectricals_app_2026-06-28_12-39.sql.gz}"
SOURCE_SHA256="${SOURCE_SHA256:-aea0bc83c05685c3062241769b7051d8446cc0c2dcba8d42ae8e6dd5f8a32fa8}"

test -r "${MIGRATION_ENV}"
test -r "${CA_FILE}"

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
export PGDATABASE="srv_staging"
export PGSSLMODE="verify-full"
export PGSSLROOTCERT="${CA_FILE}"
export PGAPPNAME="srv-legacy-rehearsal"

mark_failed() {
  psql -X -v ON_ERROR_STOP=1 -c \
    "UPDATE migration_runs SET status='failed', \"completedAt\"=now(), notes=concat_ws(E'\\n', notes, 'Transformation script failed') WHERE status='running'" \
    >/dev/null 2>&1 || true
}
trap mark_failed ERR

psql -X -v ON_ERROR_STOP=1 \
  -v source_file="${SOURCE_FILE}" \
  -v source_sha256="${SOURCE_SHA256}" \
  -f "${MIGRATION_DIR}/10-transform-core.sql"

psql -X -v ON_ERROR_STOP=1 -f "${MIGRATION_DIR}/20-transform-qr.sql"
psql -X -v ON_ERROR_STOP=1 -f "${MIGRATION_DIR}/30-transform-finance.sql"
psql -X -v ON_ERROR_STOP=1 -f "${MIGRATION_DIR}/35-remediate-unmapped.sql"
psql -X -v ON_ERROR_STOP=1 -f "${MIGRATION_DIR}/40-reconcile.sql"

trap - ERR
echo "Legacy transformation and reconciliation completed."
