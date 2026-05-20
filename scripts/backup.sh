#!/usr/bin/env bash
# Nightly Postgres backup. Run via cron: 0 4 * * * /app/scripts/backup.sh
#
# Dumps the mafia database to a timestamped .sql.gz file and (optionally)
# uploads it offsite via rclone. Local copies older than KEEP_DAYS are pruned.
#
# Environment variables expected:
#   PG_HOST, PG_PORT, PG_USER, PG_PASSWORD, PG_DB — Postgres connection
#   BACKUP_DIR (default /var/backups/mafia)
#   KEEP_DAYS  (default 14)
#   RCLONE_REMOTE (optional, e.g. "b2:mafia-backups")
set -euo pipefail

BACKUP_DIR=${BACKUP_DIR:-/var/backups/mafia}
KEEP_DAYS=${KEEP_DAYS:-14}
TIMESTAMP=$(date -u +%Y%m%d-%H%M%S)
FILE="$BACKUP_DIR/mafia-$TIMESTAMP.sql.gz"

mkdir -p "$BACKUP_DIR"

PGPASSWORD="$PG_PASSWORD" pg_dump \
  --host="$PG_HOST" \
  --port="${PG_PORT:-5432}" \
  --username="$PG_USER" \
  --no-owner \
  --no-privileges \
  --format=plain \
  "$PG_DB" | gzip -9 > "$FILE"

echo "Wrote $FILE ($(du -h "$FILE" | cut -f1))"

# Prune local backups older than KEEP_DAYS days.
find "$BACKUP_DIR" -name 'mafia-*.sql.gz' -mtime "+$KEEP_DAYS" -delete

# Optional offsite sync. Configure rclone first: `rclone config`.
if [ -n "${RCLONE_REMOTE:-}" ]; then
  rclone copy "$FILE" "$RCLONE_REMOTE/" --quiet
  echo "Synced to $RCLONE_REMOTE"
fi
