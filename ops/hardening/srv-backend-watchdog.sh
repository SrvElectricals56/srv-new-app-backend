#!/usr/bin/env bash
set -Eeuo pipefail

container="srv-production-backend-1"
state_dir="/run/srv-backend-watchdog"
fail_file="${state_dir}/failures"
lock_file="${state_dir}/lock"

install -d -m 0755 "${state_dir}"
exec 9>"${lock_file}"
flock -n 9 || exit 0

if ! docker inspect "${container}" >/dev/null 2>&1; then
  logger -t srv-backend-watchdog "container ${container} does not exist"
  exit 1
fi

if curl --fail --silent --show-error --max-time 5 http://127.0.0.1:3001/health >/dev/null 2>&1; then
  echo 0 >"${fail_file}"
  exit 0
fi

failures=0
if [[ -r "${fail_file}" ]]; then
  read -r failures <"${fail_file}" || failures=0
fi
failures=$((failures + 1))
echo "${failures}" >"${fail_file}"
logger -t srv-backend-watchdog "liveness failure ${failures}/3 for ${container}"

if (( failures >= 3 )); then
  logger -t srv-backend-watchdog "restarting unresponsive container ${container}"
  docker restart --time 20 "${container}" >/dev/null
  echo 0 >"${fail_file}"
fi
