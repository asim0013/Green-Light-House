#!/bin/sh
# Restore a snapshot — NON-DESTRUCTIVE BY DEFAULT.
#
#   restore.sh                          # list snapshots
#   restore.sh <snapshot> <target-db>   # restore the DB dump(s) into <target-db>
#                                       # (created if absent) + objects into
#                                       # /restore/objects for inspection
#
# It never touches the live database unless you NAME it as <target-db> yourself.
# The drill (docs/deploy.md "Backups") restores into a throwaway database, counts
# rows, and drops it. Restoring over the live site is a deliberate, separate step.
set -eu

: "${RESTIC_REPOSITORY:?}"
: "${RESTIC_PASSWORD:?}"
: "${DATABASE_URL:?}"

if [ $# -lt 2 ]; then
  restic snapshots --tag glh
  echo "usage: restore.sh <snapshot-id|latest> <target-db-name>"
  exit 0
fi

SNAP=$1
TARGET=$2
OUT=/restore
rm -rf "$OUT" && mkdir -p "$OUT"
restic restore "$SNAP" --target "$OUT"

libpq_url() { echo "$1" | sed -E 's/([?&])schema=[^&]*&?/\1/; s/[?&]$//'; }
MAIN=$(libpq_url "$DATABASE_URL")
# Same server, different database name.
TARGET_URL=$(echo "$MAIN" | sed -E "s#/[^/?]+(\?|$)#/$TARGET\1#")

psql "$MAIN" -tAc "SELECT 1 FROM pg_database WHERE datname = '$TARGET'" | grep -q 1 \
  || psql "$MAIN" -c "CREATE DATABASE \"$TARGET\""

pg_restore --no-owner --no-privileges --dbname="$TARGET_URL" "$OUT/stage/db/main.dump"
if [ -f "$OUT/stage/db/leads.dump" ]; then
  # A split leads store restores alongside, into the same target for inspection.
  pg_restore --no-owner --no-privileges --data-only --dbname="$TARGET_URL" "$OUT/stage/db/leads.dump" || true
fi

echo "[restore] database restored into '$TARGET'. Objects are in $OUT/stage/objects."
psql "$TARGET_URL" -tAc "SELECT 'products', count(*) FROM products UNION ALL SELECT 'leads', count(*) FROM leads"
