#!/usr/bin/env bash
set -Eeuo pipefail

if [[ ${EUID} -ne 0 ]]; then
  echo "Run this script as root." >&2
  exit 1
fi

deploy_user="${1:-srvdeploy}"
export DEBIAN_FRONTEND=noninteractive

apt-get update
apt-get -y install \
  acl \
  ca-certificates \
  certbot \
  curl \
  default-mysql-client \
  git \
  htop \
  nginx \
  postgresql-client \
  python3-certbot-nginx \
  rsync

install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
chmod a+r /etc/apt/keyrings/docker.asc

. /etc/os-release
cat >/etc/apt/sources.list.d/docker.sources <<EOF
Types: deb
URIs: https://download.docker.com/linux/ubuntu
Suites: ${VERSION_CODENAME}
Components: stable
Architectures: $(dpkg --print-architecture)
Signed-By: /etc/apt/keyrings/docker.asc
EOF

apt-get update
apt-get -y install \
  containerd.io \
  docker-buildx-plugin \
  docker-ce \
  docker-ce-cli \
  docker-compose-plugin

install -d -m 0755 /etc/docker
cat >/etc/docker/daemon.json <<'EOF'
{
  "live-restore": true,
  "log-driver": "local",
  "log-opts": {
    "max-size": "10m",
    "max-file": "5"
  },
  "no-new-privileges": true,
  "userland-proxy": false
}
EOF

systemctl enable --now containerd docker
systemctl restart docker

if ! getent group srvops >/dev/null; then
  groupadd --system srvops
fi
usermod --append --groups srvops "${deploy_user}"

install -d -o root -g srvops -m 02770 \
  /opt/srv \
  /opt/srv/backups \
  /opt/srv/config \
  /opt/srv/logs \
  /opt/srv/releases \
  /opt/srv/secrets \
  /opt/srv/shared

install -d -m 0755 /etc/nginx/conf.d
cat >/etc/nginx/conf.d/00-srv-security.conf <<'EOF'
server_tokens off;
client_body_timeout 15s;
client_header_timeout 15s;
keepalive_timeout 65s;
send_timeout 30s;
limit_req_zone $binary_remote_addr zone=srv_api_per_ip:10m rate=20r/s;
EOF

rm -f /etc/nginx/sites-enabled/default
cat >/etc/nginx/sites-available/srv-catchall <<'EOF'
server {
    listen 80 default_server;
    listen [::]:80 default_server;
    server_name _;

    access_log off;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "no-referrer" always;

    location = /healthz {
        default_type text/plain;
        return 200 "ok\n";
    }

    location / {
        return 444;
    }
}
EOF
ln -sfn /etc/nginx/sites-available/srv-catchall /etc/nginx/sites-enabled/srv-catchall

nginx -t
systemctl enable --now nginx
systemctl reload nginx
systemctl enable --now certbot.timer

cat >/etc/logrotate.d/srv-application <<'EOF'
/opt/srv/logs/*.log {
    daily
    rotate 14
    missingok
    notifempty
    compress
    delaycompress
    copytruncate
    create 0640 root srvops
}
EOF

echo "Runtime installation completed successfully."
docker --version
docker compose version
nginx -v
psql --version
mysql --version
