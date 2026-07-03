#!/usr/bin/env bash
set -Eeuo pipefail

DUMP_FILE="${DUMP_FILE:-/opt/srv/backups/srvelectricals_app_2026-06-28_12-39.sql.gz}"
EXPECTED_SHA256="${EXPECTED_SHA256:-aea0bc83c05685c3062241769b7051d8446cc0c2dcba8d42ae8e6dd5f8a32fa8}"
NETWORK="${MIGRATION_NETWORK:-srv-migration-network}"
CONTAINER="${MYSQL_CONTAINER:-srv-legacy-mysql}"

test -r "${DUMP_FILE}"
actual_sha256="$(sha256sum "${DUMP_FILE}" | awk '{print $1}')"
if [[ "${actual_sha256}" != "${EXPECTED_SHA256}" ]]; then
  echo "MySQL dump checksum mismatch." >&2
  exit 1
fi

if sudo docker container inspect "${CONTAINER}" >/dev/null 2>&1; then
  echo "Container ${CONTAINER} already exists; refusing to overwrite it." >&2
  exit 2
fi

if ! sudo docker network inspect "${NETWORK}" >/dev/null 2>&1; then
  sudo docker network create "${NETWORK}" >/dev/null
fi

sudo docker run -d \
  --name "${CONTAINER}" \
  --network "${NETWORK}" \
  --restart no \
  --memory 3g \
  --cpus 2 \
  -e MYSQL_ALLOW_EMPTY_PASSWORD=yes \
  -e MYSQL_DATABASE=legacy \
  mysql:8.0 \
  --character-set-server=utf8mb4 \
  --collation-server=utf8mb4_unicode_ci \
  --default-authentication-plugin=mysql_native_password >/dev/null

for _ in $(seq 1 90); do
  if sudo docker exec "${CONTAINER}" mysql -N -uroot -e \
    "SELECT SCHEMA_NAME FROM information_schema.schemata WHERE SCHEMA_NAME='legacy'" \
    2>/dev/null | grep -qx legacy; then
    break
  fi
  sleep 1
done

sudo docker exec "${CONTAINER}" mysqladmin ping --silent >/dev/null
sudo docker exec "${CONTAINER}" mysql -N -uroot -e \
  "SELECT SCHEMA_NAME FROM information_schema.schemata WHERE SCHEMA_NAME='legacy'" | \
  grep -qx legacy
sudo docker cp "${DUMP_FILE}" "${CONTAINER}:/tmp/legacy.sql.gz"
sudo docker exec "${CONTAINER}" bash -lc \
  'gzip -dc /tmp/legacy.sql.gz | mysql --default-character-set=utf8mb4 -uroot legacy'

table_count="$(sudo docker exec "${CONTAINER}" mysql -N -uroot -e \
  "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='legacy'")"
echo "Loaded legacy MySQL dump into ${CONTAINER}; tables=${table_count}."
