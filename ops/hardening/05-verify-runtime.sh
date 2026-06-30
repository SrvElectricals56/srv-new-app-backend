#!/usr/bin/env bash
set -u

echo '=== services ==='
systemctl is-active docker containerd nginx certbot.timer

echo '=== docker ==='
docker version --format 'server={{.Server.Version}} client={{.Client.Version}}'
docker compose version
docker info --format 'driver={{.Driver}} cgroup={{.CgroupDriver}} logging={{.LoggingDriver}} live_restore={{.LiveRestoreEnabled}} containers={{.Containers}}'

echo '=== nginx ==='
nginx -t

echo '=== deployment directories ==='
stat -c '%a %U:%G %n' /opt/srv /opt/srv/releases /opt/srv/shared /opt/srv/secrets /opt/srv/backups

echo '=== listening ports ==='
ss -lntup

echo '=== firewall ==='
ufw status
