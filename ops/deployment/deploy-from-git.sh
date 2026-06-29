#!/usr/bin/env bash
set -Eeuo pipefail

BRANCH="${BRANCH:-staging}"
PUBLIC_ORIGIN="${PUBLIC_ORIGIN:-http://139.59.52.48}"
SERVER_NAME="${SERVER_NAME:-139.59.52.48}"
REPOSITORIES_DIR="${REPOSITORIES_DIR:-/opt/srv/repositories}"
RELEASES_DIR="${RELEASES_DIR:-/opt/srv/releases}"
CURRENT_LINK="${CURRENT_LINK:-/opt/srv/current}"
LOCK_FILE="${LOCK_FILE:-/opt/srv/.deploy.lock}"
BACKEND_REPOSITORY="${BACKEND_REPOSITORY:-https://github.com/SrvElectricals56/srv-new-app-backend.git}"
ADMIN_REPOSITORY="${ADMIN_REPOSITORY:-https://github.com/SrvElectricals56/srv-new-adminpanel.git}"
MOBILE_REPOSITORY="${MOBILE_REPOSITORY:-https://github.com/SrvElectricals56/srv-new-app-frontend.git}"

if [[ "${EUID}" -eq 0 ]]; then
  echo 'Run this script as the unprivileged deployment user, not root.' >&2
  exit 1
fi
if [[ ! "${BRANCH}" =~ ^[A-Za-z0-9._/-]+$ ]]; then
  echo 'BRANCH contains unsupported characters.' >&2
  exit 1
fi

install -d -m 2770 "${REPOSITORIES_DIR}" "${RELEASES_DIR}"
touch "${LOCK_FILE}"
exec 9>"${LOCK_FILE}"
if ! flock -n 9; then
  echo 'Another SRV deployment is already running.' >&2
  exit 1
fi

sync_mirror() {
  local name="$1"
  local remote="$2"
  local repository="${REPOSITORIES_DIR}/${name}.git"

  if [[ ! -d "${repository}" ]]; then
    git clone --mirror "${remote}" "${repository}" >&2
  else
    test "$(git -C "${repository}" rev-parse --is-bare-repository)" = 'true'
    git -C "${repository}" remote set-url origin "${remote}"
    git -C "${repository}" remote update --prune >&2
  fi

  git -C "${repository}" rev-parse --verify "refs/heads/${BRANCH}^{commit}"
}

export_commit() {
  local repository="$1"
  local commit="$2"
  local destination="$3"

  install -d -m 2770 "${destination}"
  git -C "${repository}" archive --format=tar "${commit}" | tar -xf - -C "${destination}"
}

previous_release=''
new_release=''
deployment_started='false'
rollback_in_progress='false'

rollback() {
  local exit_code=$?
  trap - ERR

  if [[ "${rollback_in_progress}" = 'true' ]]; then
    exit "${exit_code}"
  fi
  rollback_in_progress='true'

  echo "Deployment failed (exit ${exit_code})." >&2
  if [[ "${deployment_started}" = 'true' && -n "${previous_release}" && -r "${previous_release}/srv-new-app-backend/ops/deployment/deploy-staging.sh" ]]; then
    echo "Restoring previous release: ${previous_release}" >&2
    RELEASE_DIR="${previous_release}" \
      PUBLIC_ORIGIN="${PUBLIC_ORIGIN}" \
      SERVER_NAME="${SERVER_NAME}" \
      bash "${previous_release}/srv-new-app-backend/ops/deployment/deploy-staging.sh" || true
    ln -sfn "${previous_release}" "${CURRENT_LINK}"
  fi
  exit "${exit_code}"
}
trap rollback ERR

backend_commit="$(sync_mirror 'srv-new-app-backend' "${BACKEND_REPOSITORY}")"
admin_commit="$(sync_mirror 'srv-new-adminpanel' "${ADMIN_REPOSITORY}")"
mobile_commit="$(sync_mirror 'srv-new-app-frontend' "${MOBILE_REPOSITORY}")"

release_id="git-$(date -u +%Y%m%d-%H%M%S)-${backend_commit:0:7}-${admin_commit:0:7}"
new_release="${RELEASES_DIR}/${release_id}"
if [[ -e "${new_release}" ]]; then
  echo "Release already exists: ${new_release}" >&2
  exit 1
fi

previous_release="$(readlink -f "${CURRENT_LINK}" 2>/dev/null || true)"
export_commit "${REPOSITORIES_DIR}/srv-new-app-backend.git" "${backend_commit}" \
  "${new_release}/srv-new-app-backend"
export_commit "${REPOSITORIES_DIR}/srv-new-adminpanel.git" "${admin_commit}" \
  "${new_release}/srv-new-adminpanel"

test -r "${new_release}/srv-new-app-backend/package.json"
test -r "${new_release}/srv-new-app-backend/docker-compose.production.yml"
test -r "${new_release}/srv-new-app-backend/ops/deployment/deploy-staging.sh"
test -r "${new_release}/srv-new-adminpanel/package.json"

cat >"${new_release}/RELEASE" <<EOF
release=${release_id}
created_utc=$(date -u +%Y-%m-%dT%H:%M:%SZ)
branch=${BRANCH}
backend_commit=${backend_commit}
admin_commit=${admin_commit}
mobile_commit=${mobile_commit}
previous_release=${previous_release}
EOF

deployment_started='true'
RELEASE_DIR="${new_release}" \
  PUBLIC_ORIGIN="${PUBLIC_ORIGIN}" \
  SERVER_NAME="${SERVER_NAME}" \
  bash "${new_release}/srv-new-app-backend/ops/deployment/deploy-staging.sh"

ln -sfn "${new_release}" "${CURRENT_LINK}"
ORIGIN="${PUBLIC_ORIGIN}" \
  bash "${new_release}/srv-new-app-backend/ops/deployment/smoke-test-staging.sh"

deployment_started='false'
trap - ERR

printf 'Release deployed successfully.\n'
printf 'Release: %s\n' "${release_id}"
printf 'Backend: %s\n' "${backend_commit}"
printf 'Admin:   %s\n' "${admin_commit}"
printf 'Mobile:  %s (tracked for coordinated testing; not hosted on this server)\n' "${mobile_commit}"
printf 'Current: %s\n' "$(readlink -f "${CURRENT_LINK}")"
