#!/bin/sh
# One backup run: dump Postgres (+ the separate leads store, if configured), copy
# the object-storage bucket to plain files, snapshot both with restic, apply
# retention, record success, ping the heartbeat.
# Run by cron (entrypoint.sh) and by hand: `docker compose exec backup backup.sh`.
set -eu

# shellcheck source=common.sh
. /usr/local/bin/common.sh

: "${RESTIC_REPOSITORY:?RESTIC_REPOSITORY is not set — refusing to run without an off-site repository}"
: "${RESTIC_PASSWORD:?RESTIC_PASSWORD is not set}"
: "${DATABASE_URL:?DATABASE_URL is not set}"
: "${S3_BUCKET:?S3_BUCKET is not set}"
: "${S3_ENDPOINT:?S3_ENDPOINT is not set}"

STAGE=/stage
STATE=/state
mkdir -p "$STAGE/db" "$STAGE/objects" "$STATE"

# Heartbeat (dead-man's switch): success pings the URL, failure pings <url>/fail
# (the healthchecks.io convention). Fires from the EXIT trap so every failure
# path — including `set -e` aborts — is reported.
heartbeat() {
  [ -n "${BACKUP_HEARTBEAT_URL:-}" ] || return 0
  wget -q -T 10 -O /dev/null "$1" >/dev/null 2>&1 || log "heartbeat ping failed ($1)"
}
on_exit() {
  status=$?
  if [ "$status" -eq 0 ]; then
    heartbeat "${BACKUP_HEARTBEAT_URL:-}"
  else
    log "FAILED (exit $status)"
    heartbeat "${BACKUP_HEARTBEAT_URL:-}/fail"
  fi
}

# One run at a time: a manual run must not collide with the cron one.
exec 9>"$STATE/backup.lock"
if ! flock -n 9; then
  log "another backup is already running — skipping"
  exit 0
fi
trap on_exit EXIT

MAIN=$(libpq_url "$DATABASE_URL")
log "dumping main database"
pg_dump --format=custom --no-owner --no-privileges --file="$STAGE/db/main.dump.tmp" "$MAIN"
mv "$STAGE/db/main.dump.tmp" "$STAGE/db/main.dump"

# Story 5.3: a SEPARATE leads/personal-data database is backed up too.
rm -f "$STAGE/db/leads.dump"
if [ -n "${LEADS_DATABASE_URL:-}" ]; then
  LEADS=$(libpq_url "$LEADS_DATABASE_URL")
  if [ "$LEADS" != "$MAIN" ]; then
    log "dumping separate leads database"
    pg_dump --format=custom --no-owner --no-privileges --file="$STAGE/db/leads.dump.tmp" "$LEADS"
    mv "$STAGE/db/leads.dump.tmp" "$STAGE/db/leads.dump"
  fi
fi

# SHRINK GUARD (launch review). The copy below MIRRORS the bucket — deletions
# included — and `restic forget` keeps one snapshot per day, so an emptied or
# wrongly-configured bucket would quietly REPLACE that day's good snapshot.
# Count first; refuse a sharp drop unless the operator says it is intended.
log "counting objects in bucket $S3_BUCKET"
COUNT=$(rclone size --json "src:$S3_BUCKET" | sed -E 's/.*"count":([0-9]+).*/\1/')
case "$COUNT" in '' | *[!0-9]*)
  log "could not count objects in the bucket (got: $COUNT)"
  exit 1
  ;;
esac
PREV=$(cat "$STATE/object-count" 2>/dev/null || echo 0)
if [ "${BACKUP_ALLOW_SHRINK:-no}" != "yes" ] && [ "$PREV" -ge 10 ] && [ $((COUNT * 2)) -lt "$PREV" ]; then
  log "REFUSING: the bucket holds $COUNT objects, down from $PREV at the last backup."
  log "If that is intended, run once with BACKUP_ALLOW_SHRINK=yes:"
  log "  docker compose exec -e BACKUP_ALLOW_SHRINK=yes backup backup.sh"
  exit 1
fi

log "copying $COUNT objects"
# Incremental: the staging copy persists between runs; deleted objects are dropped.
rclone sync --quiet "src:$S3_BUCKET" "$STAGE/objects"

if ! restic cat config >/dev/null 2>&1; then
  log "initialising restic repository"
  restic init
fi

log "snapshotting"
restic backup --quiet --host glh-prod --tag glh "$STAGE/db" "$STAGE/objects"

# --keep-last: the daily/weekly/monthly rules keep only the LAST snapshot of each
# day, so a bad run (say, the start-up backup of a just-broken database) used to
# delete every good snapshot taken earlier that day — measured in the smoke test.
# The newest N are now always kept, whatever their dates.
log "applying retention (last ${BACKUP_KEEP_LAST:-7}, daily ${BACKUP_KEEP_DAILY:-14}, weekly ${BACKUP_KEEP_WEEKLY:-8}, monthly ${BACKUP_KEEP_MONTHLY:-12})"
restic forget --quiet --host glh-prod --tag glh --prune \
  --keep-last "${BACKUP_KEEP_LAST:-7}" \
  --keep-daily "${BACKUP_KEEP_DAILY:-14}" \
  --keep-weekly "${BACKUP_KEEP_WEEKLY:-8}" \
  --keep-monthly "${BACKUP_KEEP_MONTHLY:-12}"

echo "$COUNT" > "$STATE/object-count"
date -u +%s > "$STATE/last-success"
log "done"
