#!/usr/bin/env bash
set -Eeuo pipefail

if [[ ${EUID} -ne 0 ]]; then
  echo "Run this script as root." >&2
  exit 1
fi

deploy_user="${1:-srvdeploy}"

if ! id "${deploy_user}" >/dev/null 2>&1; then
  echo "Deployment user ${deploy_user} does not exist." >&2
  exit 1
fi

export DEBIAN_FRONTEND=noninteractive

apt-get update
apt-get -y dist-upgrade
apt-get -y install \
  auditd \
  ca-certificates \
  curl \
  fail2ban \
  gnupg \
  jq \
  needrestart \
  unattended-upgrades \
  ufw \
  unzip
apt-get -y purge telnet inetutils-telnet || true
apt-get -y autoremove --purge

hostnamectl set-hostname srv-prod-01
timedatectl set-timezone UTC
timedatectl set-ntp true

install -d -m 0755 /etc/ssh/sshd_config.d
cat >/etc/ssh/sshd_config.d/99-srv-hardening.conf <<EOF
# Managed by SRV infrastructure automation.
PermitRootLogin no
PasswordAuthentication no
KbdInteractiveAuthentication no
PubkeyAuthentication yes
AuthenticationMethods publickey
PermitEmptyPasswords no
MaxAuthTries 3
MaxSessions 5
LoginGraceTime 30
X11Forwarding no
AllowAgentForwarding no
AllowTcpForwarding yes
PermitTunnel no
ClientAliveInterval 300
ClientAliveCountMax 2
AllowUsers ${deploy_user}
EOF

install -d -m 0755 /run/sshd
sshd -t

cat >/etc/fail2ban/jail.d/sshd.local <<'EOF'
[DEFAULT]
bantime = 1h
findtime = 10m
maxretry = 5
bantime.increment = true
bantime.factor = 2
bantime.maxtime = 1d
backend = systemd

[sshd]
enabled = true
mode = aggressive
port = ssh
EOF

cat >/etc/sysctl.d/99-srv-hardening.conf <<'EOF'
# Safe host hardening settings. IP forwarding is intentionally not disabled
# because the application runtime uses Docker networking.
fs.protected_fifos = 2
fs.protected_hardlinks = 1
fs.protected_regular = 2
fs.protected_symlinks = 1
fs.suid_dumpable = 0
kernel.dmesg_restrict = 1
kernel.kptr_restrict = 2
kernel.randomize_va_space = 2
kernel.unprivileged_bpf_disabled = 1
kernel.yama.ptrace_scope = 1
net.ipv4.conf.all.accept_redirects = 0
net.ipv4.conf.default.accept_redirects = 0
net.ipv4.conf.all.accept_source_route = 0
net.ipv4.conf.default.accept_source_route = 0
net.ipv4.conf.all.secure_redirects = 0
net.ipv4.conf.default.secure_redirects = 0
net.ipv4.conf.all.send_redirects = 0
net.ipv4.conf.default.send_redirects = 0
net.ipv4.icmp_echo_ignore_broadcasts = 1
net.ipv4.icmp_ignore_bogus_error_responses = 1
net.ipv4.tcp_syncookies = 1
net.ipv6.conf.all.accept_redirects = 0
net.ipv6.conf.default.accept_redirects = 0
net.ipv6.conf.all.accept_source_route = 0
net.ipv6.conf.default.accept_source_route = 0
vm.swappiness = 10
vm.vfs_cache_pressure = 50
EOF

cat >/etc/security/limits.d/99-srv-hardening.conf <<'EOF'
* hard core 0
root hard core 0
EOF

install -d -m 0755 /etc/systemd/journald.conf.d
cat >/etc/systemd/journald.conf.d/99-srv-limits.conf <<'EOF'
[Journal]
Storage=persistent
Compress=yes
Seal=yes
SystemMaxUse=1G
RuntimeMaxUse=256M
MaxRetentionSec=30day
EOF

cat >/etc/apt/apt.conf.d/20auto-upgrades <<'EOF'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
APT::Periodic::AutocleanInterval "7";
EOF

cat >/etc/apt/apt.conf.d/52srv-unattended-upgrades <<'EOF'
Unattended-Upgrade::Remove-Unused-Dependencies "true";
Unattended-Upgrade::Automatic-Reboot "false";
EOF

cat >/etc/audit/rules.d/99-srv.rules <<'EOF'
-w /etc/passwd -p wa -k identity
-w /etc/group -p wa -k identity
-w /etc/shadow -p wa -k identity
-w /etc/sudoers -p wa -k scope
-w /etc/sudoers.d/ -p wa -k scope
-w /etc/ssh/sshd_config -p wa -k sshd
-w /etc/ssh/sshd_config.d/ -p wa -k sshd
EOF

cat >/etc/profile.d/99-srv-umask.sh <<'EOF'
umask 027
EOF
chmod 0644 /etc/profile.d/99-srv-umask.sh

if ! swapon --show=NAME --noheadings | grep -qx '/swapfile'; then
  if [[ ! -f /swapfile ]]; then
    fallocate -l 2G /swapfile
    chmod 0600 /swapfile
    mkswap /swapfile
  fi
  swapon /swapfile
fi
if ! grep -qE '^/swapfile[[:space:]]' /etc/fstab; then
  printf '/swapfile none swap sw 0 0\n' >>/etc/fstab
fi

ufw default deny incoming
ufw default allow outgoing
ufw --force delete allow 22/tcp >/dev/null 2>&1 || true
ufw limit 22/tcp comment 'SSH key access'
ufw allow 80/tcp comment 'HTTP redirect and ACME'
ufw allow 443/tcp comment 'HTTPS'
ufw logging medium
ufw --force enable

sysctl --system >/dev/null
augenrules --load >/dev/null
systemctl enable --now auditd
systemctl enable --now fail2ban
systemctl enable --now unattended-upgrades
systemctl restart systemd-journald
systemctl reload ssh

echo "Ubuntu hardening completed successfully."
if [[ -f /var/run/reboot-required ]]; then
  echo "REBOOT_REQUIRED=yes"
else
  echo "REBOOT_REQUIRED=no"
fi
