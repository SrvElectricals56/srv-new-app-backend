#!/usr/bin/env bash
set -Eeuo pipefail

# Deploy exactly the reviewed staging commits to the existing isolated staging stack.
BACKEND_COMMIT="${1:?backend commit required}"
ADMIN_COMMIT="${2:?admin commit required}"
MOBILE_COMMIT="${3:?mobile commit required}"
for commit in "$BACKEND_COMMIT" "$ADMIN_COMMIT" "$MOBILE_COMMIT"; do
  [[ "$commit" =~ ^[0-9a-f]{40}$ ]] || { echo 'Full commit hashes are required'; exit 1; }
done
[[ "$EUID" -ne 0 ]] || { echo 'Run as srvdeploy'; exit 1; }
exec 9>/opt/srv/.staging-isolated-deploy.lock
flock -n 9 || { echo 'Another staging deployment is running'; exit 1; }
previous="$(readlink -f /opt/srv/staging-current)"
test -r "$previous/srv-new-app-backend/docker-compose.staging.yml"
release="/opt/srv/releases/staging-$(date -u +%Y%m%d-%H%M%S)-${BACKEND_COMMIT:0:7}-${ADMIN_COMMIT:0:7}"
export BACKEND_ENV_FILE=/opt/srv/secrets/backend.env
export DB_CA_FILE=/opt/srv/secrets/managed-postgres-ca.crt
export UPLOADS_PATH=/opt/srv/shared/staging-uploads
export PUBLIC_API_URL=https://staging.srvelectricals.in/api/v1
compose() {
  sudo --preserve-env=BACKEND_ENV_FILE,DB_CA_FILE,UPLOADS_PATH,PUBLIC_API_URL docker compose \
    --project-name srv-staging-isolated -f "$1/srv-new-app-backend/docker-compose.production.yml" \
    -f "$1/srv-new-app-backend/docker-compose.staging.yml" "${@:2}"
}
for repo in srv-new-app-backend srv-new-adminpanel srv-new-app-frontend; do
  git -C "/opt/srv/repositories/$repo.git" remote update
done
for entry in "srv-new-app-backend:$BACKEND_COMMIT" "srv-new-adminpanel:$ADMIN_COMMIT" "srv-new-app-frontend:$MOBILE_COMMIT"; do
  repo="${entry%%:*}"; commit="${entry#*:}"
  test "$(git -C "/opt/srv/repositories/$repo.git" rev-parse refs/heads/staging)" = "$commit"
  if [[ "$repo" != srv-new-app-frontend ]]; then
    install -d -m 2770 "$release/$repo"
    git -C "/opt/srv/repositories/$repo.git" archive "$commit" | tar -xf - -C "$release/$repo"
  fi
done
cp "$previous/srv-new-app-backend/docker-compose.staging.yml" "$release/srv-new-app-backend/docker-compose.staging.yml"
cat > "$release/RELEASE" <<EOF
environment=isolated-staging
branch=staging
backend_commit=$BACKEND_COMMIT
admin_commit=$ADMIN_COMMIT
mobile_commit=$MOBILE_COMMIT
previous_release=$previous
EOF
compose "$release" config --format json | python3 -c 'import json,sys; c=json.load(sys.stdin); b=c["services"]["backend"]; assert b["environment"]["DB_DATABASE"]=="srv_staging"; assert b["ports"][0]["published"]=="3101"; assert c["services"]["admin"]["ports"][0]["published"]=="3100"'
compose "$release" build

# A full snapshot precedes migrations. No secret values are echoed.
backup="/opt/srv/backups/srv_staging-before-$(basename "$release").dump"
sudo docker run --rm --env-file /opt/srv/secrets/migration.env \
  -v "$DB_CA_FILE":/run/ca.crt:ro postgres:18 sh -ec '
    export PGPASSWORD="$DB_PASSWORD"
    pg_dump "host=$DB_HOST port=$DB_PORT dbname=srv_staging user=$DB_USERNAME sslmode=verify-full sslrootcert=/run/ca.crt" -Fc
  ' > "$backup"
test -s "$backup"
sudo docker run --rm -i postgres:18 pg_restore --list < "$backup" > "$backup.manifest"
sha256sum "$backup"
old_backend="$(sudo docker inspect --format '{{.Image}}' srv-staging-isolated-backend-1)"
old_admin="$(sudo docker inspect --format '{{.Image}}' srv-staging-isolated-admin-1)"
rollback() {
  code=$?; trap - ERR
  sudo docker tag "$old_backend" srv-staging-isolated-backend:latest
  sudo docker tag "$old_admin" srv-staging-isolated-admin:latest
  compose "$previous" up -d --no-build backend admin || true
  echo "Deployment failed; previous application restored. Backup: $backup" >&2
  exit "$code"
}
trap rollback ERR
BACKEND_ENV_FILE=/opt/srv/secrets/migration.env compose "$release" run --rm --no-deps \
  -e DB_DATABASE=srv_staging -e DB_SSL=true -e DB_SSL_REJECT_UNAUTHORIZED=true \
  -e DB_SSL_CA_PATH=/run/secrets/managed-postgres-ca.crt \
  backend node node_modules/typeorm/cli.js migration:run --dataSource dist/database/data-source.js
compose "$release" up -d --no-build backend admin
for attempt in $(seq 1 45); do
  if curl -fsS http://127.0.0.1:3101/health >/dev/null && curl -fsS http://127.0.0.1:3100/ >/dev/null; then break; fi
  sleep 2
done
curl -fsS https://staging.srvelectricals.in/api-healthz >/dev/null
curl -fsS https://staging.srvelectricals.in/ >/dev/null
ln -sfn "$release" /opt/srv/staging-current
trap - ERR
echo "DEPLOYED $release"
echo "BACKUP $backup"
cat "$release/RELEASE"
