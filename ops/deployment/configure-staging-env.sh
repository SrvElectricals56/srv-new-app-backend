#!/usr/bin/env bash
set -Eeuo pipefail

SECRETS_DIR="${SECRETS_DIR:-/opt/srv/secrets}"
SOURCE_ENV="${SECRETS_DIR}/managed-postgres.env"
TARGET_ENV="${SECRETS_DIR}/migration.env"

test -r "${SOURCE_ENV}"
umask 077

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

{
  printf 'DB_HOST=%s\n' "$(read_env_value DB_HOST)"
  printf 'DB_PORT=%s\n' "$(read_env_value DB_PORT)"
  printf 'DB_USERNAME=%s\n' "$(read_env_value DB_USERNAME)"
  printf 'DB_PASSWORD=%s\n' "$(read_env_value DB_PASSWORD)"
  printf 'DB_DATABASE=srv_staging\n'
  printf 'DB_SSL=true\n'
  printf 'DB_SSL_REJECT_UNAUTHORIZED=true\n'
  printf 'DB_SSL_CA_PATH=/run/secrets/managed-postgres-ca.crt\n'
  printf 'DB_SYNCHRONIZE=false\n'
  printf 'DB_LOGGING=false\n'
} > "${TARGET_ENV}"

chmod 0640 "${TARGET_ENV}"
echo "Created protected migration environment for srv_staging."
