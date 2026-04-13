#!/bin/sh
set -eu

if [ "$#" -ne 1 ]; then
  echo "Usage: restore-sqlite.sh /backups/accounta-YYYYMMDDTHHMMSSZ.db" >&2
  exit 1
fi

backup_path="$1"
db_path="${SQLITE_DB_PATH:-/app/data/accounta.db}"
timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
restore_dir="$(dirname "$db_path")"
pre_restore_copy="$restore_dir/accounta-pre-restore-$timestamp.db"
checksum_path="$backup_path.sha256"

if [ ! -f "$backup_path" ]; then
  echo "Backup file not found: $backup_path" >&2
  exit 1
fi

mkdir -p "$restore_dir"

if [ -f "$checksum_path" ]; then
  sha256sum -c "$checksum_path"
else
  echo "Warning: checksum file not found for $backup_path" >&2
fi

if [ -f "$db_path" ]; then
  cp "$db_path" "$pre_restore_copy"
  echo "Saved current database as: $pre_restore_copy"
fi

cp "$backup_path" "$db_path"
echo "Restored database to: $db_path"
