#!/bin/sh
# Shared by backup.sh and restore.sh — sourced, not executed.

log() { echo "[backup] $(date -u +%Y-%m-%dT%H:%M:%SZ) $*"; }

# libpq (pg_dump/psql/pg_restore) rejects Prisma-only query parameters with
# "invalid URI query parameter". Strip every one Prisma documents; anything else
# (sslmode, connect_timeout, …) is a real libpq option and is kept.
libpq_url() {
  echo "$1" | sed -E \
    -e 's/([?&])(schema|connection_limit|pool_timeout|pgbouncer|statement_cache_size|socket_timeout|sslaccept)=[^&]*/\1/g' \
    -e 's/&&+/\&/g; s/\?&/?/; s/[?&]$//'
}

# The database NAME in a postgres URL (path segment, without the query string).
db_name() {
  echo "$1" | sed -E 's#^[a-z]+://[^/]*/([^?]*).*$#\1#'
}

# The bucket, as an rclone remote configured entirely from the S3_* environment
# (no config file). Any S3-compatible store: Hetzner Object Storage in
# production, SeaweedFS in the local smoke test.
export RCLONE_CONFIG=/dev/null # no config file — and no "not found" notice per run
export RCLONE_CONFIG_SRC_TYPE=s3
export RCLONE_CONFIG_SRC_PROVIDER=Other
export RCLONE_CONFIG_SRC_ENV_AUTH=false
export RCLONE_CONFIG_SRC_ACCESS_KEY_ID="${S3_ACCESS_KEY_ID:-}"
export RCLONE_CONFIG_SRC_SECRET_ACCESS_KEY="${S3_SECRET_ACCESS_KEY:-}"
export RCLONE_CONFIG_SRC_ENDPOINT="${S3_ENDPOINT:-}"
export RCLONE_CONFIG_SRC_REGION="${S3_REGION:-us-east-1}"
export RCLONE_CONFIG_SRC_FORCE_PATH_STYLE="${S3_FORCE_PATH_STYLE:-false}"
# Never create a missing bucket as a side effect of a sync.
export RCLONE_CONFIG_SRC_NO_CHECK_BUCKET=true
