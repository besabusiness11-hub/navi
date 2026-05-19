#!/usr/bin/env bash
# Postgres backup — runs in the docker-compose `postgres-backup` sidecar or any
# host that has pg_dump + the DATABASE_URL secret. Designed to be safe to call
# repeatedly from cron.
#
# Strategy:
#   1. pg_dump the connection string into /backups/navi-<ts>.sql.gz
#   2. Keep BACKUP_RETENTION_DAYS days of snapshots (default 7).
#   3. Optional: when AWS_S3_BACKUP_BUCKET is set, also upload via aws s3 cp.
#
# Required env: DATABASE_URL
# Optional: BACKUP_DIR (default /backups), BACKUP_RETENTION_DAYS,
#           AWS_S3_BACKUP_BUCKET, AWS_S3_BACKUP_PREFIX.

set -euo pipefail

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "[pg-backup] DATABASE_URL not set — refusing to run" >&2
  exit 1
fi

BACKUP_DIR="${BACKUP_DIR:-/backups}"
RETENTION="${BACKUP_RETENTION_DAYS:-7}"
mkdir -p "$BACKUP_DIR"

TS="$(date -u +%Y%m%d-%H%M%S)"
OUT="$BACKUP_DIR/navi-${TS}.sql.gz"

echo "[pg-backup] $(date -u) dumping → $OUT"
pg_dump --no-owner --no-privileges "$DATABASE_URL" | gzip -9 > "$OUT"
SIZE=$(stat -c%s "$OUT" 2>/dev/null || stat -f%z "$OUT")
echo "[pg-backup] ok size=${SIZE}B"

# Optional S3 push.
if [[ -n "${AWS_S3_BACKUP_BUCKET:-}" ]]; then
  KEY="${AWS_S3_BACKUP_PREFIX:-navi}/navi-${TS}.sql.gz"
  echo "[pg-backup] uploading to s3://${AWS_S3_BACKUP_BUCKET}/${KEY}"
  aws s3 cp "$OUT" "s3://${AWS_S3_BACKUP_BUCKET}/${KEY}" --only-show-errors
fi

# Retention — delete dumps older than $RETENTION days. Never touch other files.
find "$BACKUP_DIR" -type f -name 'navi-*.sql.gz' -mtime "+${RETENTION}" -print -delete \
  | sed 's/^/[pg-backup] expired /'

echo "[pg-backup] done"
