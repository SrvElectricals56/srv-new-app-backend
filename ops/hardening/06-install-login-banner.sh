#!/usr/bin/env bash
set -Eeuo pipefail

if [[ "${EUID}" -ne 0 ]]; then
  echo 'Run this installer as root.' >&2
  exit 1
fi

install -o root -g root -m 0755 /dev/stdin /etc/update-motd.d/00-srv-banner <<'MOTD'
#!/usr/bin/env bash
set -u

if [[ "${TERM:-dumb}" != 'dumb' ]]; then
  cyan=$'\033[1;36m'
  blue=$'\033[1;34m'
  green=$'\033[1;32m'
  yellow=$'\033[1;33m'
  red=$'\033[1;31m'
  dim=$'\033[2m'
  reset=$'\033[0m'
else
  cyan=''
  blue=''
  green=''
  yellow=''
  red=''
  dim=''
  reset=''
fi

service_state() {
  if systemctl is-active --quiet "$1" 2>/dev/null; then
    printf '%sONLINE%s' "${green}" "${reset}"
  else
    printf '%sOFFLINE%s' "${red}" "${reset}"
  fi
}

endpoint_state() {
  if curl --fail --silent --max-time 2 "$1" >/dev/null 2>&1; then
    printf '%sHEALTHY%s' "${green}" "${reset}"
  else
    printf '%sUNAVAILABLE%s' "${red}" "${reset}"
  fi
}

host_name="$(hostname -s 2>/dev/null || printf 'unknown')"
kernel="$(uname -r 2>/dev/null || printf 'unknown')"
uptime_value="$(uptime -p 2>/dev/null | sed 's/^up //' || printf 'unknown')"
load_value="$(cut -d' ' -f1-3 /proc/loadavg 2>/dev/null || printf 'unknown')"
memory_value="$(free -m 2>/dev/null | awk '/^Mem:/ {printf "%d MB / %d MB (%d%%)", $3, $2, ($3 * 100) / $2}')"
disk_value="$(df -hP / 2>/dev/null | awk 'NR==2 {printf "%s / %s (%s)", $3, $2, $5}')"
sessions="$(who 2>/dev/null | wc -l | tr -d ' ')"
login_user="${PAM_USER:-${SUDO_USER:-${USER:-srvdeploy}}}"
ssh_connection="${SSH_CONNECTION:-}"
client_ip="${ssh_connection%% *}"
client_ip="${client_ip:-see last-login record}"
local_time="$(TZ=Asia/Kolkata date '+%d %b %Y, %I:%M:%S %p IST')"

printf '\n'
printf '%s+------------------------------------------------------------------------------+%s\n' "${blue}" "${reset}"
printf '%s|%s  %s   _____  ____  _    __%s                                                     %s|%s\n' "${blue}" "${reset}" "${cyan}" "${reset}" "${blue}" "${reset}"
printf '%s|%s  %s  / ___/ / __ \| |  / /%s     SRV ELECTRICALS PRIVATE LIMITED              %s|%s\n' "${blue}" "${reset}" "${cyan}" "${reset}" "${blue}" "${reset}"
printf '%s|%s  %s  \__ \ / /_/ /| | / /%s      SECURE OPERATIONS CONSOLE                    %s|%s\n' "${blue}" "${reset}" "${cyan}" "${reset}" "${blue}" "${reset}"
printf '%s|%s  %s ___/ // _, _/ | |/ /%s       STAGING / MIGRATION VALIDATION                %s|%s\n' "${blue}" "${reset}" "${cyan}" "${reset}" "${blue}" "${reset}"
printf '%s|%s  %s/____//_/ |_|  |___/%s                                                       %s|%s\n' "${blue}" "${reset}" "${cyan}" "${reset}" "${blue}" "${reset}"
printf '%s+------------------------------------------------------------------------------+%s\n' "${blue}" "${reset}"
printf '\n'
printf '  %sSYSTEM ACCESS NOTICE%s\n' "${yellow}" "${reset}"
printf '  Authorized personnel only. Activity is monitored, audited, and retained.\n'
printf '\n'
printf '  %-15s %s%-28s%s  %-12s %s\n' 'Environment' "${yellow}" 'STAGING' "${reset}" 'Time' "${local_time}"
printf '  %-15s %-28s  %-12s %s\n' 'Host' "${host_name}" 'Kernel' "${kernel}"
printf '  %-15s %-28s  %-12s %s\n' 'Uptime' "${uptime_value}" 'Load' "${load_value}"
printf '  %-15s %-28s  %-12s %s\n' 'Memory' "${memory_value:-unknown}" 'Disk /' "${disk_value:-unknown}"
printf '  %-15s %-28s  %-12s %s\n' 'Login user' "${login_user}" 'Source IP' "${client_ip}"
printf '  %-15s %-28s  %-12s %s\n' 'Sessions' "${sessions}" 'SSH auth' 'KEY ONLY'
printf '\n'
printf '  %sSERVICE STATUS%s\n' "${cyan}" "${reset}"
printf '  Nginx      %-14s Docker     %-14s Firewall   %s\n' \
  "$(service_state nginx)" "$(service_state docker)" "$(service_state ufw)"
printf '  Backend    %-14s Admin      %-14s Database   %s\n' \
  "$(endpoint_state http://127.0.0.1:3001/health)" \
  "$(endpoint_state http://127.0.0.1:3000/)" \
  "$(endpoint_state http://127.0.0.1:3001/health)"
printf '\n'
printf '%s  Security: SSH keys only | Root login disabled | Private database VPC%s\n' "${dim}" "${reset}"
printf '%s  If this access is unexpected, disconnect and notify the administrator.%s\n' "${yellow}" "${reset}"
printf '%s+------------------------------------------------------------------------------+%s\n\n' "${blue}" "${reset}"
MOTD

for entry in /etc/update-motd.d/*; do
  name="$(basename "${entry}")"
  case "${name}" in
    00-srv-banner|98-reboot-required) ;;
    *) chmod -x "${entry}" 2>/dev/null || true ;;
  esac
done

echo 'Installed SRV dynamic SSH login banner.'
