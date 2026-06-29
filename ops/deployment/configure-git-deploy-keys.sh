#!/usr/bin/env bash
set -Eeuo pipefail

if [[ "${EUID}" -eq 0 ]]; then
  echo 'Run this script as the unprivileged deployment user, not root.' >&2
  exit 1
fi

SSH_DIR="${HOME}/.ssh"
CONFIG_DIR="${SSH_DIR}/config.d"
KNOWN_HOSTS="${SSH_DIR}/known_hosts"
MAIN_CONFIG="${SSH_DIR}/config"
SRV_CONFIG="${CONFIG_DIR}/srv-github.conf"

umask 077
install -d -m 0700 "${SSH_DIR}" "${CONFIG_DIR}"

# Pinned GitHub Ed25519 host key from GitHub's official documentation.
github_host_key='github.com ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIOMqqnkVzrm0SdG6UOoqKLsabgH5C9okWi0dh2l9GKJl'
touch "${KNOWN_HOSTS}"
chmod 0600 "${KNOWN_HOSTS}"
if ! grep -Fqx "${github_host_key}" "${KNOWN_HOSTS}"; then
  printf '%s\n' "${github_host_key}" >>"${KNOWN_HOSTS}"
fi

declare -A keys=(
  [backend]="${SSH_DIR}/srv_github_backend"
  [admin]="${SSH_DIR}/srv_github_admin"
  [mobile]="${SSH_DIR}/srv_github_mobile"
)

for name in backend admin mobile; do
  key="${keys[${name}]}"
  if [[ ! -f "${key}" ]]; then
    ssh-keygen -q -t ed25519 -N '' -C "srv-staging-${name}-deploy" -f "${key}"
  fi
  chmod 0600 "${key}"
  chmod 0644 "${key}.pub"
done

config_tmp="$(mktemp)"
cleanup() { rm -f "${config_tmp}"; }
trap cleanup EXIT
cat >"${config_tmp}" <<EOF
Host github-srv-backend
  HostName github.com
  User git
  IdentityFile ${keys[backend]}
  IdentitiesOnly yes
  StrictHostKeyChecking yes

Host github-srv-admin
  HostName github.com
  User git
  IdentityFile ${keys[admin]}
  IdentitiesOnly yes
  StrictHostKeyChecking yes

Host github-srv-mobile
  HostName github.com
  User git
  IdentityFile ${keys[mobile]}
  IdentitiesOnly yes
  StrictHostKeyChecking yes
EOF
install -m 0600 "${config_tmp}" "${SRV_CONFIG}"

touch "${MAIN_CONFIG}"
chmod 0600 "${MAIN_CONFIG}"
if ! grep -Fqx 'Include ~/.ssh/config.d/*' "${MAIN_CONFIG}"; then
  main_tmp="$(mktemp)"
  printf 'Include ~/.ssh/config.d/*\n' >"${main_tmp}"
  cat "${MAIN_CONFIG}" >>"${main_tmp}"
  install -m 0600 "${main_tmp}" "${MAIN_CONFIG}"
  rm -f "${main_tmp}"
fi

for name in backend admin mobile; do
  printf '\n[%s deploy key]\n' "${name}"
  cat "${keys[${name}]}.pub"
done
