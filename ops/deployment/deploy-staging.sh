#!/usr/bin/env bash
set -Eeuo pipefail

RELEASE_DIR="${RELEASE_DIR:-/opt/srv/current}"
PUBLIC_ORIGIN="${PUBLIC_ORIGIN:-https://staging.srvelectricals.in}"
SERVER_NAME="${SERVER_NAME:-staging.srvelectricals.in}"
BACKEND_ENV="${BACKEND_ENV:-/opt/srv/secrets/backend.env}"
MIGRATION_ENV="${MIGRATION_ENV:-/opt/srv/secrets/migration.env}"
MIGRATION_DATABASE="${MIGRATION_DATABASE:-srv_staging}"
CA_FILE="${CA_FILE:-/opt/srv/secrets/managed-postgres-ca.crt}"
UPLOADS_DIR="${UPLOADS_DIR:-/opt/srv/shared/uploads}"
COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME:-srv-staging}"

if [[ ! "${PUBLIC_ORIGIN}" =~ ^https?://[A-Za-z0-9.-]+(:[0-9]{1,5})?$ ]]; then
  echo "PUBLIC_ORIGIN must be an HTTP(S) origin without a path." >&2
  exit 1
fi
if [[ ! "${SERVER_NAME}" =~ ^[A-Za-z0-9.-]+$ ]]; then
  echo "Invalid Nginx server name." >&2
  exit 1
fi

test -d "${RELEASE_DIR}/srv-new-app-backend"
test -d "${RELEASE_DIR}/srv-new-adminpanel"
test -r "${BACKEND_ENV}"
test -r "${MIGRATION_ENV}"
test -r "${CA_FILE}"

sudo install -d -o 1000 -g 1000 -m 0750 "${UPLOADS_DIR}"

cd "${RELEASE_DIR}/srv-new-app-backend"
export BACKEND_ENV_FILE="${BACKEND_ENV}"
export DB_CA_FILE="${CA_FILE}"
export UPLOADS_PATH="${UPLOADS_DIR}"
export PUBLIC_API_URL="${PUBLIC_ORIGIN}/api/v1"

sudo --preserve-env=BACKEND_ENV_FILE,DB_CA_FILE,UPLOADS_PATH,PUBLIC_API_URL \
  docker compose --project-name "${COMPOSE_PROJECT_NAME}" \
  --file docker-compose.production.yml build --pull
export BACKEND_ENV_FILE="${MIGRATION_ENV}"
sudo --preserve-env=BACKEND_ENV_FILE,DB_CA_FILE,UPLOADS_PATH,PUBLIC_API_URL \
  docker compose --project-name "${COMPOSE_PROJECT_NAME}" \
  --file docker-compose.production.yml run --rm --no-deps \
  --env DB_DATABASE="${MIGRATION_DATABASE}" \
  --env DB_SSL=true \
  --env DB_SSL_REJECT_UNAUTHORIZED=true \
  --env DB_SSL_CA_PATH=/run/secrets/managed-postgres-ca.crt \
  backend \
  node node_modules/typeorm/cli.js migration:run --dataSource dist/database/data-source.js
export BACKEND_ENV_FILE="${BACKEND_ENV}"
sudo --preserve-env=BACKEND_ENV_FILE,DB_CA_FILE,UPLOADS_PATH,PUBLIC_API_URL \
  docker compose --project-name "${COMPOSE_PROJECT_NAME}" \
  --file docker-compose.production.yml up --detach --remove-orphans

for _ in $(seq 1 30); do
  if curl --fail --silent --show-error http://127.0.0.1:3001/health >/dev/null && \
     curl --fail --silent --show-error http://127.0.0.1:3000/ >/dev/null; then
    break
  fi
  sleep 2
done
curl --fail --silent --show-error http://127.0.0.1:3001/health >/dev/null
curl --fail --silent --show-error http://127.0.0.1:3000/ >/dev/null

nginx_config="$(mktemp)"
cleanup() { rm -f "${nginx_config}"; }
trap cleanup EXIT

sudo install -d -o root -g root -m 0755 /var/www/letsencrypt

write_proxy_locations() {
  cat <<'EOF'
    client_max_body_size 510m;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    add_header X-Frame-Options "DENY" always;

    location = /healthz {
        access_log off;
        default_type text/plain;
        return 200 "ok\n";
    }

    location = /api-healthz {
        access_log off;
        proxy_pass http://127.0.0.1:3001/health;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /api/ {
        limit_req zone=srv_api_per_ip burst=80 nodelay;
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 300s;
        proxy_send_timeout 300s;
    }

    location /uploads/ {
        proxy_pass http://127.0.0.1:3001;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
        expires 1h;
        add_header Cache-Control "public, max-age=3600";
    }

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
EOF
}

if [[ "${PUBLIC_ORIGIN}" == https://* ]]; then
  cert_dir="/etc/letsencrypt/live/${SERVER_NAME}"
  sudo test -r "${cert_dir}/fullchain.pem"
  sudo test -r "${cert_dir}/privkey.pem"
  sudo test -r /etc/letsencrypt/options-ssl-nginx.conf
  sudo test -r /etc/letsencrypt/ssl-dhparams.pem

  cat >"${nginx_config}" <<EOF
server {
    listen 80 default_server;
    listen [::]:80 default_server;
    server_name ${SERVER_NAME};

    location ^~ /.well-known/acme-challenge/ {
        root /var/www/letsencrypt;
    }

    location / {
        return 301 https://\$host\$request_uri;
    }
}

server {
    listen 443 ssl http2 default_server;
    listen [::]:443 ssl http2 default_server;
    server_name ${SERVER_NAME};

    ssl_certificate ${cert_dir}/fullchain.pem;
    ssl_certificate_key ${cert_dir}/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;
    add_header Strict-Transport-Security "max-age=31536000" always;
EOF
  write_proxy_locations >>"${nginx_config}"
  printf '}\n' >>"${nginx_config}"
else
  cat >"${nginx_config}" <<EOF
server {
    listen 80 default_server;
    listen [::]:80 default_server;
    server_name ${SERVER_NAME};

    location ^~ /.well-known/acme-challenge/ {
        root /var/www/letsencrypt;
    }
EOF
  write_proxy_locations >>"${nginx_config}"
  printf '}\n' >>"${nginx_config}"
fi

sudo install -o root -g root -m 0644 "${nginx_config}" /etc/nginx/sites-available/srv-staging
sudo ln -sfn /etc/nginx/sites-available/srv-staging /etc/nginx/sites-enabled/srv-staging
sudo rm -f /etc/nginx/sites-enabled/srv-catchall
sudo nginx -t
sudo systemctl reload nginx

curl --fail --silent --show-error "${PUBLIC_ORIGIN}/healthz" >/dev/null
curl --fail --silent --show-error "${PUBLIC_ORIGIN}/api-healthz" >/dev/null
echo "Staging backend and admin are healthy at ${PUBLIC_ORIGIN}."
