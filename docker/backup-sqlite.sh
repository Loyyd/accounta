#!/bin/sh
set -eu

timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
backup_dir="${BACKUP_DIR:-/backups}"
db_path="${SQLITE_DB_PATH:-/app/data/accounta.db}"
base_name="accounta-$timestamp.db"
backup_path="$backup_dir/$base_name"
checksum_path="$backup_path.sha256"

mkdir -p "$backup_dir"

if [ ! -f "$db_path" ]; then
  echo "SQLite database not found at $db_path" >&2
  exit 1
fi

cp "$db_path" "$backup_path"
sha256sum "$backup_path" > "$checksum_path"

echo "Created backup: $backup_path"
echo "Created checksum: $checksum_path"
