#!/usr/bin/env bash
set -Eeuo pipefail

RELEASE_DIR="${RELEASE_DIR:-/opt/srv/current}"
COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME:-srv-staging}"
CREDENTIAL_FILE="${CREDENTIAL_FILE:-/opt/srv/secrets/staging-admin.txt}"
ADMIN_EMAIL="${ADMIN_EMAIL:-admin@srvelectricals.com}"
PUBLIC_API_URL="${PUBLIC_API_URL:-http://139.59.52.48/api/v1}"

if [[ -e "${CREDENTIAL_FILE}" ]]; then
  echo "${CREDENTIAL_FILE} already exists; refusing to rotate credentials implicitly." >&2
  exit 2
fi

admin_password="$(openssl rand -base64 36 | tr -d '\n')"
cd "${RELEASE_DIR}/srv-new-app-backend"

sudo --preserve-env=PUBLIC_API_URL docker compose --project-name "${COMPOSE_PROJECT_NAME}" \
  --file docker-compose.production.yml exec --no-TTY \
  --env DEFAULT_ADMIN_PASSWORD="${admin_password}" \
  --env DEFAULT_ADMIN_EMAIL="${ADMIN_EMAIL}" \
  backend node dist/database/seeds/seed.js

umask 077
{
  printf 'ADMIN_EMAIL=%s\n' "${ADMIN_EMAIL}"
  printf 'ADMIN_PASSWORD=%s\n' "${admin_password}"
} >"${CREDENTIAL_FILE}"
chmod 0600 "${CREDENTIAL_FILE}"
unset admin_password

echo "Initial staging admin created. Credentials are stored in ${CREDENTIAL_FILE}."
