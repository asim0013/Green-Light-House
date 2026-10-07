#!/bin/sh
# Restore a snapshot — NON-DESTRUCTIVE BY DEFAULT.
#
#   restore.sh                                     # list snapshots
#   restore.sh <snapshot|latest> <new-db> [bucket] # restore into NEW database(s)
#                                                  # (+ objects into [bucket])
#
# What it restores:
#   - the main dump into <new-db>, which MUST NOT EXIST yet (it is created);
#   - a split leads dump (Story 5.3), if the snapshot has one, into
#     <new-db>_leads — its own database, so the two never collide;
#   - the objects into /restore/stage/objects, and — only if [bucket] is given —
#     uploaded into that bucket.
#
# Refusals (launch review: restoring INTO the live database "succeeded" with 179
# ignored errors and rewound lead_reference_seq, i.e. duplicate lead references):
#   - a target database that already exists — pg_restore into a populated
#     database merges and corrupts; always restore into a fresh one;
#   - the live database names and the live bucket — unless RESTORE_OVER_LIVE=yes,
#     which is the disaster-recovery path in docs/deploy.md (stop app + worker,
#     drop the live database, then restore into its name).
set -eu

# shellcheck source=common.sh
. /usr/local/bin/common.sh

: "${RESTIC_REPOSITORY:?}"
: "${RESTIC_PASSWORD:?}"
: "${DATABASE_URL:?}"

if [ $# -lt 2 ]; then
  restic snapshots --tag glh
  echo "usage: restore.sh <snapshot-id|latest> <new-database-name> [target-bucket]"
  exit 0
fi

SNAP=$1
TARGET=$2
BUCKET=${3:-}

case "$TARGET" in *[!a-zA-Z0-9_]* | '')
  echo "[restore] database name must be letters, digits and underscores only: '$TARGET'" >&2
  exit 2
  ;;
esac

MAIN=$(libpq_url "$DATABASE_URL")
LIVE_DBS=$(db_name "$MAIN")
if [ -n "${LEADS_DATABASE_URL:-}" ]; then
  LIVE_DBS="$LIVE_DBS $(db_name "$(libpq_url "$LEADS_DATABASE_URL")")"
fi

if [ "${RESTORE_OVER_LIVE:-no}" != "yes" ]; then
  for live in $LIVE_DBS; do
    if [ "$TARGET" = "$live" ] || [ "${TARGET}_leads" = "$live" ]; then
      echo "[restore] REFUSING: '$TARGET' is (or would write to) the LIVE database '$live'." >&2
      echo "[restore] Restore into a new name for a drill. Disaster recovery: docs/deploy.md." >&2
      exit 2
    fi
  done
  if [ -n "$BUCKET" ] && [ "$BUCKET" = "${S3_BUCKET:-}" ]; then
    echo "[restore] REFUSING: '$BUCKET' is the LIVE bucket. Disaster recovery: docs/deploy.md." >&2
    exit 2
  fi
fi

# Same server, different database name.
url_for() { echo "$MAIN" | sed -E "s#/[^/?]+(\?|$)#/$1\1#"; }
# Server-level statements go through the `postgres` maintenance database, never
# the live one: in disaster recovery the live database has just been DROPPED, and
# connecting to it would fail before anything is restored (found in the smoke run).
ADMIN=$(url_for postgres)

db_exists() {
  psql "$ADMIN" -tAc "SELECT 1 FROM pg_database WHERE datname = '$1'" | grep -q 1
}

for db in "$TARGET" "${TARGET}_leads"; do
  if db_exists "$db"; then
    echo "[restore] REFUSING: database '$db' already exists. Restore into a NEW name (or drop it first)." >&2
    exit 2
  fi
done

OUT=/restore
rm -rf "$OUT" && mkdir -p "$OUT"
restic restore "$SNAP" --target "$OUT"

psql "$ADMIN" -c "CREATE DATABASE \"$TARGET\""
pg_restore --no-owner --no-privileges --exit-on-error --dbname="$(url_for "$TARGET")" "$OUT/stage/db/main.dump"
echo "[restore] main database restored into '$TARGET'"

if [ -f "$OUT/stage/db/leads.dump" ]; then
  psql "$ADMIN" -c "CREATE DATABASE \"${TARGET}_leads\""
  pg_restore --no-owner --no-privileges --exit-on-error --dbname="$(url_for "${TARGET}_leads")" "$OUT/stage/db/leads.dump"
  echo "[restore] separate leads database restored into '${TARGET}_leads'"
  LEADS_TARGET="${TARGET}_leads"
else
  LEADS_TARGET="$TARGET"
fi

OBJECTS=$(find "$OUT/stage/objects" -type f | wc -l | tr -d ' ')
if [ -n "$BUCKET" ]; then
  echo "[restore] uploading $OBJECTS objects into bucket '$BUCKET'"
  rclone copy --quiet "$OUT/stage/objects" "src:$BUCKET"
else
  echo "[restore] $OBJECTS objects are in $OUT/stage/objects (pass a bucket name to upload them)."
fi

echo "[restore] row counts:"
psql "$(url_for "$TARGET")" -tAc "SELECT 'products', count(*) FROM products"
psql "$(url_for "$LEADS_TARGET")" -tAc "SELECT 'leads', count(*) FROM leads UNION ALL SELECT 'lead_reference_seq', last_value FROM lead_reference_seq"
echo "[restore] done. Remove the copy when finished: rm -rf $OUT"
