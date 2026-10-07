#!/bin/sh
# One backup run: dump Postgres (+ the separate leads store, if configured), mirror
# the MinIO bucket, snapshot both with restic, apply retention, record success.
# Run by cron (entrypoint.sh) and by hand: `docker compose ... exec backup backup.sh`.
set -eu

log() { echo "[backup] $(date -u +%Y-%m-%dT%H:%M:%SZ) $*"; }

: "${RESTIC_REPOSITORY:?RESTIC_REPOSITORY is not set — refusing to run without an off-site repository}"
: "${RESTIC_PASSWORD:?RESTIC_PASSWORD is not set}"
: "${DATABASE_URL:?DATABASE_URL is not set}"

STAGE=/stage
STATE=/state
mkdir -p "$STAGE/db" "$STAGE/objects" "$STATE"

# libpq (pg_dump) rejects Prisma's `?schema=…` query parameter — strip it.
libpq_url() {
  echo "$1" | sed -E 's/([?&])schema=[^&]*&?/\1/; s/[?&]$//'
}

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

log "mirroring object storage bucket ${S3_BUCKET:?S3_BUCKET is not set}"
mcli alias set glh "${S3_ENDPOINT:?S3_ENDPOINT is not set}" "${S3_ACCESS_KEY_ID:?}" "${S3_SECRET_ACCESS_KEY:?}" >/dev/null
# Incremental: the staging copy persists between runs; --remove drops deleted objects.
mcli mirror --overwrite --remove --quiet "glh/$S3_BUCKET" "$STAGE/objects"

if ! restic cat config >/dev/null 2>&1; then
  log "initialising restic repository"
  restic init
fi

log "snapshotting"
restic backup --quiet --host glh-prod --tag glh "$STAGE/db" "$STAGE/objects"

log "applying retention (daily ${BACKUP_KEEP_DAILY:-14}, weekly ${BACKUP_KEEP_WEEKLY:-8}, monthly ${BACKUP_KEEP_MONTHLY:-12})"
restic forget --quiet --host glh-prod --tag glh --prune \
  --keep-daily "${BACKUP_KEEP_DAILY:-14}" \
  --keep-weekly "${BACKUP_KEEP_WEEKLY:-8}" \
  --keep-monthly "${BACKUP_KEEP_MONTHLY:-12}"

date -u +%s > "$STATE/last-success"
log "done"
