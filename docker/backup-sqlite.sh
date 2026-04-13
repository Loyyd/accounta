#!/bin/sh
set -eu

timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
backup_dir="${BACKUP_DIR:-/backups}"
db_path="${SQLITE_DB_PATH:-/app/data/accounta.db}"

mkdir -p "$backup_dir"

if [ ! -f "$db_path" ]; then
  echo "SQLite database not found at $db_path" >&2
  exit 1
fi

cp "$db_path" "$backup_dir/accounta-$timestamp.db"
echo "Created backup: $backup_dir/accounta-$timestamp.db"
