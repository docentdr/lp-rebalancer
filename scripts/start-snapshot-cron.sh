#!/bin/sh
set -eu

cd /app

SCHEDULE="${SNAPSHOT_CRON_SCHEDULE:-5 0 * * *}"
LOG_FILE="${SNAPSHOT_CRON_LOG:-/var/log/snapshot.log}"

mkdir -p /app/data/snapshots
mkdir -p "$(dirname "$LOG_FILE")"

echo "${SCHEDULE} cd /app && npm run snapshot >> ${LOG_FILE} 2>&1" > /etc/crontabs/root

echo "[$(date -Iseconds)] Running startup snapshot..."
if npm run snapshot; then
  echo "[$(date -Iseconds)] Startup snapshot completed successfully."
else
  echo "[$(date -Iseconds)] Startup snapshot failed; cron will continue running." >&2
fi

echo "[$(date -Iseconds)] Starting cron daemon with schedule: ${SCHEDULE}"
exec crond -f -l 2
