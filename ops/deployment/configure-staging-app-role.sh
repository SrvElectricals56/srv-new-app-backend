#!/usr/bin/env bash
set -Eeuo pipefail

SECRETS_DIR="${SECRETS_DIR:-/opt/srv/secrets}"
MIGRATION_ENV="${SECRETS_DIR}/migration.env"
CA_FILE="${SECRETS_DIR}/managed-postgres-ca.crt"
BACKEND_ENV="${SECRETS_DIR}/backend.env"
APP_ROLE="${APP_ROLE:-srv_app}"
PUBLIC_APP_URL="${PUBLIC_APP_URL:-http://139.59.52.48}"
PUBLIC_ADMIN_URL="${PUBLIC_ADMIN_URL:-http://139.59.52.48}"

if [[ ! "${APP_ROLE}" =~ ^[a-z][a-z0-9_]*$ ]]; then
  echo "Invalid PostgreSQL role name: ${APP_ROLE}" >&2
  exit 1
fi
for public_url in "${PUBLIC_APP_URL}" "${PUBLIC_ADMIN_URL}"; do
  if [[ ! "${public_url}" =~ ^https?://[A-Za-z0-9.-]+(:[0-9]{1,5})?$ ]]; then
    echo "Public URLs must be HTTP(S) origins without paths." >&2
    exit 1
  fi
done

test -r "${MIGRATION_ENV}"
test -r "${CA_FILE}"
if [[ -e "${BACKEND_ENV}" ]]; then
  echo "${BACKEND_ENV} already exists; refusing to overwrite it." >&2
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
export PGDATABASE="srv_staging"
export PGSSLMODE="verify-full"
export PGSSLROOTCERT="${CA_FILE}"

if [[ ! "${PGUSER}" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]]; then
  echo "Invalid PostgreSQL owner role name from migration environment." >&2
  exit 1
fi

migration_status="$(psql -X -tAc \
  'SELECT status FROM migration_runs ORDER BY "startedAt" DESC LIMIT 1' | xargs)"
if [[ "${migration_status}" != "completed" ]]; then
  echo "Latest migration status is ${migration_status:-missing}; refusing to create app credentials." >&2
  exit 1
fi

role_exists="$(psql -X -tAc "SELECT 1 FROM pg_roles WHERE rolname='${APP_ROLE}'" | xargs)"
if [[ "${role_exists}" == "1" ]]; then
  echo "Role ${APP_ROLE} already exists; refusing to rotate it implicitly." >&2
  exit 2
fi

app_password="$(openssl rand -base64 48 | tr -d '\n')"
jwt_secret="$(openssl rand -hex 64)"
jwt_refresh_secret="$(openssl rand -hex 64)"

psql -X -v ON_ERROR_STOP=1 \
  -v app_role="${APP_ROLE}" \
  -v owner_role="${PGUSER}" \
  -v app_password="${app_password}" <<'SQL'
SELECT format('CREATE ROLE %I LOGIN PASSWORD %L', :'app_role', :'app_password') \gexec
GRANT CONNECT ON DATABASE srv_staging TO :"app_role";
GRANT USAGE ON SCHEMA public TO :"app_role";
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO :"app_role";
GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO :"app_role";
ALTER DEFAULT PRIVILEGES FOR ROLE :"owner_role" IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO :"app_role";
ALTER DEFAULT PRIVILEGES FOR ROLE :"owner_role" IN SCHEMA public
  GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO :"app_role";
REVOKE ALL ON SCHEMA legacy_mysql FROM :"app_role";
REVOKE ALL ON SCHEMA migration_support FROM :"app_role";
SQL

umask 077
{
  printf 'NODE_ENV=production\n'
  printf 'HOST=0.0.0.0\n'
  printf 'PORT=3001\n'
  printf 'APP_URL=%s\n' "${PUBLIC_APP_URL}"
  printf 'DB_HOST=%s\n' "${PGHOST}"
  printf 'DB_PORT=%s\n' "${PGPORT}"
  printf 'DB_USERNAME=%s\n' "${APP_ROLE}"
  printf 'DB_PASSWORD=%s\n' "${app_password}"
  printf 'DB_DATABASE=srv_staging\n'
  printf 'DB_SSL=true\n'
  printf 'DB_SSL_REJECT_UNAUTHORIZED=true\n'
  printf 'DB_SSL_CA_PATH=/run/secrets/managed-postgres-ca.crt\n'
  printf 'DB_SYNCHRONIZE=false\n'
  printf 'DB_MIGRATIONS_RUN=false\n'
  printf 'DB_LOGGING=false\n'
  printf 'JWT_SECRET=%s\n' "${jwt_secret}"
  printf 'JWT_EXPIRES_IN=15m\n'
  printf 'JWT_REFRESH_SECRET=%s\n' "${jwt_refresh_secret}"
  printf 'JWT_REFRESH_EXPIRES_IN=30d\n'
  printf 'CORS_ORIGIN=%s\n' "${PUBLIC_ADMIN_URL}"
  printf 'CORS_CREDENTIALS=true\n'
  printf 'API_PREFIX=api/v1\n'
  printf 'BODY_LIMIT=10mb\n'
  printf 'SWAGGER_ENABLED=true\n'
  printf 'THROTTLE_TTL=60\n'
  printf 'THROTTLE_LIMIT=100\n'
  printf 'RAZORPAY_KEY_ID=\n'
  printf 'RAZORPAY_KEY_SECRET=\n'
  printf 'RAZORPAY_WEBHOOK_SECRET=\n'
} > "${BACKEND_ENV}"

chmod 0640 "${BACKEND_ENV}"
unset app_password jwt_secret jwt_refresh_secret
echo "Created restricted ${APP_ROLE} role and protected staging backend environment."
