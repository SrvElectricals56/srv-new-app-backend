#!/usr/bin/env bash
set -Eeuo pipefail

if [[ ${EUID} -ne 0 ]]; then
  echo "Run this script as root." >&2
  exit 1
fi

deploy_user="${1:-srvdeploy}"

if ! id "${deploy_user}" >/dev/null 2>&1; then
  useradd --create-home --shell /bin/bash "${deploy_user}"
fi

usermod --append --groups sudo "${deploy_user}"
passwd --lock "${deploy_user}" >/dev/null

install -d -m 0700 -o "${deploy_user}" -g "${deploy_user}" "/home/${deploy_user}/.ssh"

if [[ ! -s /root/.ssh/authorized_keys ]]; then
  echo "Root authorized_keys is missing or empty; refusing to continue." >&2
  exit 1
fi

install -m 0600 -o "${deploy_user}" -g "${deploy_user}" \
  /root/.ssh/authorized_keys "/home/${deploy_user}/.ssh/authorized_keys"

sudoers_file="/etc/sudoers.d/90-${deploy_user}"
printf '%s ALL=(ALL:ALL) NOPASSWD: ALL\n' "${deploy_user}" >"${sudoers_file}"
chmod 0440 "${sudoers_file}"
visudo -cf "${sudoers_file}" >/dev/null

echo "Deployment user ${deploy_user} is ready for SSH-key authentication."
