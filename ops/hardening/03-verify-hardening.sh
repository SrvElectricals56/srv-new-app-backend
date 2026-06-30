#!/usr/bin/env bash
set -u

echo '=== kernel ==='
uname -r

echo '=== ssh ==='
sshd -T | grep -E '^(permitrootlogin|passwordauthentication|kbdinteractiveauthentication|pubkeyauthentication|authenticationmethods|maxauthtries|maxsessions|x11forwarding|allowagentforwarding|allowusers) '

echo '=== firewall ==='
ufw status verbose

echo '=== fail2ban ==='
fail2ban-client status sshd

echo '=== services ==='
systemctl is-active ssh fail2ban auditd unattended-upgrades do-agent

echo '=== swap ==='
swapon --show
free -h

echo '=== listening ports ==='
ss -lntup

echo '=== time ==='
timedatectl

echo '=== audit rules ==='
auditctl -l

echo '=== pending updates ==='
apt-get -s upgrade | tail -n 4
