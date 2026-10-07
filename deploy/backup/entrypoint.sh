#!/bin/sh
# Backup container entry: install the Storage Box SSH key, schedule backup.sh with
# cron, optionally run one backup immediately (validates the whole chain at deploy).
set -eu

# The host's key/known_hosts are bind-mounted read-only at /ssh; ssh insists on
# strict permissions, which a Windows/host bind mount may not carry — copy them.
if [ -d /ssh ]; then
  mkdir -p /root/.ssh
  cp /ssh/* /root/.ssh/ 2>/dev/null || true
  chmod 700 /root/.ssh
  chmod 600 /root/.ssh/* 2>/dev/null || true
fi

SCHEDULE=${BACKUP_SCHEDULE:-15 3 * * *}
echo "$SCHEDULE /usr/local/bin/backup.sh >> /proc/1/fd/1 2>&1" > /etc/crontabs/root
echo "[backup] scheduled: $SCHEDULE (container TZ=${TZ:-UTC})"

if [ "${BACKUP_ON_START:-true}" = "true" ]; then
  /usr/local/bin/backup.sh || echo "[backup] start-up run FAILED — fix the configuration; cron will retry on schedule"
fi

exec crond -f -l 8
