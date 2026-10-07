# GREENLIGHTHOUSE nightly backup (docker-compose.prod.yml `backup` service).
#
# postgres:17-alpine so `pg_dump` is the SAME major version as the server (a newer
# server than client refuses to dump). restic = encrypted, deduplicated snapshots
# with retention, to a Hetzner Storage Box over SFTP. rclone = copies the object
# bucket (any S3-compatible store) into plain files, restorable anywhere.
FROM postgres:17-alpine
RUN apk add --no-cache restic rclone openssh-client tzdata
COPY common.sh backup.sh restore.sh entrypoint.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/backup.sh /usr/local/bin/restore.sh /usr/local/bin/entrypoint.sh
ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
