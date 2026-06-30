#!/usr/bin/env bash
set -Eeuo pipefail

SECRETS_DIR="${SECRETS_DIR:-/opt/srv/secrets}"
SOURCE_ENV="${SECRETS_DIR}/managed-postgres.env"
CA_FILE="${SECRETS_DIR}/managed-postgres-ca.crt"
LOAD_FILE="${SECRETS_DIR}/legacy-to-postgres.load"
NETWORK="${MIGRATION_NETWORK:-srv-migration-network}"
MYSQL_CONTAINER="${MYSQL_CONTAINER:-srv-legacy-mysql}"
PGLOADER_IMAGE="${PGLOADER_IMAGE:-dimitri/pgloader:latest}"

test -r "${SOURCE_ENV}"
test -r "${CA_FILE}"
sudo docker container inspect "${MYSQL_CONTAINER}" >/dev/null
sudo docker network inspect "${NETWORK}" >/dev/null

read_env_value() {
  local key="$1"
  local value
  value="$(grep -m1 -E "^${key}=" "${SOURCE_ENV}" | cut -d= -f2-)"
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
export DB_PASSWORD
encoded_password="$(python3 -c 'import os, urllib.parse; print(urllib.parse.quote(os.environ["DB_PASSWORD"], safe=""))')"
unset DB_PASSWORD

umask 077
cat > "${LOAD_FILE}" <<EOF
LOAD DATABASE
  FROM mysql://root@${MYSQL_CONTAINER}:3306/legacy
  INTO postgresql://${DB_USERNAME}:${encoded_password}@${DB_HOST}:${DB_PORT}/srv_staging?sslmode=require

WITH include drop, create tables, create indexes, reset sequences,
     no foreign keys, downcase identifiers

CAST type datetime to timestamptz drop default drop not null using zero-dates-to-null,
     type date to date drop default drop not null using zero-dates-to-null

ALTER TABLE NAMES MATCHING ~/./ SET SCHEMA 'legacy_mysql'

BEFORE LOAD DO
\$\$ CREATE SCHEMA IF NOT EXISTS legacy_mysql; \$\$;
EOF
unset encoded_password

cleanup() {
  rm -f "${LOAD_FILE}"
}
trap cleanup EXIT

sudo docker pull "${PGLOADER_IMAGE}" >/dev/null
sudo docker run --rm \
  --name srv-pgloader \
  --network "${NETWORK}" \
  --memory 4g \
  --cpus 3 \
  -e SSL_CERT_FILE=/run/secrets/managed-postgres-ca.crt \
  -e PGSSLROOTCERT=/run/secrets/managed-postgres-ca.crt \
  -v "${LOAD_FILE}:/run/secrets/migration.load:ro" \
  -v "${CA_FILE}:/run/secrets/managed-postgres-ca.crt:ro" \
  "${PGLOADER_IMAGE}" pgloader /run/secrets/migration.load

export PGHOST="${DB_HOST}"
export PGPORT="${DB_PORT}"
export PGUSER="${DB_USERNAME}"
export PGPASSWORD="$(read_env_value DB_PASSWORD)"
export PGDATABASE="srv_staging"
export PGSSLMODE="verify-full"
export PGSSLROOTCERT="${CA_FILE}"

table_count="$(psql -X -tAc \
  "SELECT count(*) FROM information_schema.tables WHERE table_schema='legacy_mysql'" | xargs)"
source_qr_count="$(sudo docker exec "${MYSQL_CONTAINER}" mysql -N -uroot legacy -e \
  'SELECT COUNT(*) FROM tbl_redeem_codes_details')"
target_qr_count="$(psql -X -tAc \
  'SELECT count(*) FROM legacy_mysql.tbl_redeem_codes_details' | xargs)"
if [[ "${target_qr_count}" != "${source_qr_count}" ]]; then
  echo "Raw QR count mismatch: source=${source_qr_count}, target=${target_qr_count}" >&2
  exit 1
fi
echo "Loaded raw legacy_mysql schema; tables=${table_count}."
echo "Raw QR count verified: ${target_qr_count}."
