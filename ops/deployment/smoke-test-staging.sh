#!/usr/bin/env bash
set -Eeuo pipefail

ORIGIN="${ORIGIN:-http://127.0.0.1}"
CREDENTIAL_FILE="${CREDENTIAL_FILE:-/opt/srv/secrets/staging-admin.txt}"
MIGRATION_ENV="${MIGRATION_ENV:-/opt/srv/secrets/migration.env}"
CA_FILE="${CA_FILE:-/opt/srv/secrets/managed-postgres-ca.crt}"

test -r "${CREDENTIAL_FILE}"
test -r "${MIGRATION_ENV}"
test -r "${CA_FILE}"
set -a
# shellcheck disable=SC1090
. "${CREDENTIAL_FILE}"
set +a

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
export PGDATABASE='srv_staging'
export PGSSLMODE='verify-full'
export PGSSLROOTCERT="${CA_FILE}"

work_dir="$(mktemp -d)"
cleanup() { rm -rf "${work_dir}"; }
trap cleanup EXIT

curl --fail --silent --show-error \
  --header 'Content-Type: application/json' \
  --data "{\"email\":\"${ADMIN_EMAIL}\",\"password\":\"${ADMIN_PASSWORD}\"}" \
  "${ORIGIN}/api/v1/auth/login" >"${work_dir}/login.json"

token="$(python3 -c \
  'import json,sys; print(json.load(open(sys.argv[1], encoding="utf-8"))["accessToken"])' \
  "${work_dir}/login.json")"

auth_header="Authorization: Bearer ${token}"
curl --fail --silent --show-error --header "${auth_header}" \
  "${ORIGIN}/api/v1/auth/profile" >"${work_dir}/profile.json"
curl --fail --silent --show-error --header "${auth_header}" \
  "${ORIGIN}/api/v1/qr-codes/stats" >"${work_dir}/qr-stats.json"
curl --fail --silent --show-error --header "${auth_header}" \
  "${ORIGIN}/api/v1/qr-codes?page=1&limit=2" >"${work_dir}/qr-page.json"
curl --fail --silent --show-error \
  "${ORIGIN}/api/v1/mobile/products?page=1&limit=2" >"${work_dir}/products.json"
curl --fail --silent --show-error \
  "${ORIGIN}/api/v1/mobile/app-settings" >"${work_dir}/settings.json"

IFS='|' read -r test_user_id test_phone <<<"$(psql -X -AtF '|' -c \
  'SELECT id, phone FROM electricians WHERE status = $$active$$ ORDER BY id LIMIT 1')"
test -n "${test_user_id}"
test -n "${test_phone}"
qr_code="$(psql -X -Atc \
  'SELECT q.code FROM qr_codes q JOIN products p ON p.id=q."productId" WHERE NOT q."isScanned" AND q."isActive" AND p."isActive" ORDER BY q."legacyId" LIMIT 1')"
test -n "${qr_code}"

mobile_token="$(sudo docker exec \
  --env TEST_SUB="${test_user_id}" \
  --env TEST_PHONE="${test_phone}" \
  srv-staging-backend-1 \
  node -e 'const jwt=require("jsonwebtoken"); process.stdout.write(jwt.sign({sub:process.env.TEST_SUB,phone:process.env.TEST_PHONE,role:"electrician",tokenVersion:0},process.env.JWT_SECRET,{expiresIn:"5m"}))')"

QR_CODE="${qr_code}" python3 -c \
  'import json,os,sys; json.dump({"qrCode":os.environ["QR_CODE"]},sys.stdout)' \
  >"${work_dir}/preview-body.json"
curl --fail --silent --show-error \
  --header "Authorization: Bearer ${mobile_token}" \
  --header 'Content-Type: application/json' \
  --data-binary "@${work_dir}/preview-body.json" \
  "${ORIGIN}/api/v1/mobile/scan/preview" >"${work_dir}/scan-preview.json"

unauthorized_status="$(curl --silent --show-error --output /dev/null \
  --write-out '%{http_code}' "${ORIGIN}/api/v1/qr-codes/stats")"
admin_status="$(curl --silent --show-error --output /dev/null \
  --write-out '%{http_code}' "${ORIGIN}/")"

test "${unauthorized_status}" = '401'
test "${admin_status}" = '200'

python3 - "${work_dir}" <<'PY'
import json
import pathlib
import sys

root = pathlib.Path(sys.argv[1])
load = lambda name: json.loads((root / name).read_text(encoding='utf-8'))
profile = load('profile.json')
qr_stats = load('qr-stats.json')
qr_page = load('qr-page.json')
products = load('products.json')
settings = load('settings.json')
scan_preview = load('scan-preview.json')

def rows(value):
    if isinstance(value, list):
        return len(value)
    if isinstance(value, dict) and isinstance(value.get('data'), list):
        return len(value['data'])
    return None

print(json.dumps({
    'adminEmail': profile.get('email'),
    'adminRole': profile.get('role'),
    'qrStats': qr_stats,
    'qrPageRows': rows(qr_page),
    'productRows': rows(products),
    'settingsAvailable': isinstance(settings, dict),
    'scanPreviewSuccess': scan_preview.get('success') is True,
    'scanPreviewPoints': scan_preview.get('points'),
    'authorizationEnforced': True,
    'adminPageStatus': 200,
}, separators=(',', ':')))
PY
