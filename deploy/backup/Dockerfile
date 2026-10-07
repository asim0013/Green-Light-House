# GREENLIGHTHOUSE nightly backup (docker-compose.prod.yml `backup` service).
#
# postgres:17-alpine so `pg_dump` is the SAME major version as the server (a newer
# server than client refuses to dump). restic = encrypted, deduplicated snapshots
# with retention, to a Hetzner Storage Box over SFTP. mcli = the MinIO client, to
# mirror the object bucket into plain files (restorable into ANY S3, not tied to
# MinIO's on-disk format).
FROM postgres:17-alpine
RUN apk add --no-cache restic openssh-client minio-client tzdata
COPY backup.sh restore.sh entrypoint.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/backup.sh /usr/local/bin/restore.sh /usr/local/bin/entrypoint.sh
ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
