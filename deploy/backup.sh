#!/usr/bin/env bash
# Daily pg_dump of the munaja database, keeps 14 days. Run by munaja-backup.timer as root (or the postgres user).
# Backups hold personal data: the folder is 0700 and nothing is uploaded from here. Copy them off the server yourself.
set -euo pipefail
umask 077
DIR="${BACKUP_DIR:-/var/backups/munaja}"
KEEP_DAYS="${KEEP_DAYS:-14}"
DB="${BACKUP_DB:-munaja}"
mkdir -p "$DIR"
chmod 700 "$DIR"
OUT="$DIR/${DB}-$(date -u +%Y%m%dT%H%M%SZ).dump"
# Custom format: compressed, restorable with pg_restore. Peer auth as postgres, no password involved.
sudo -u postgres pg_dump --format=custom --no-owner --file="$OUT.part" "$DB"
mv "$OUT.part" "$OUT"
find "$DIR" -maxdepth 1 -name "${DB}-*.dump" -mtime +"$KEEP_DAYS" -delete
echo "backup ok: $OUT"
