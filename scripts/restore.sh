#!/bin/sh
set -eu

if [ "$#" -ne 1 ]; then
  echo "Usage: ./scripts/restore.sh accounta-YYYYMMDDTHHMMSSZ.db" >&2
  echo "   or: ./scripts/restore.sh /absolute/path/to/accounta-YYYYMMDDTHHMMSSZ.db" >&2
  exit 1
fi

repo_root="$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)"
compose_file="${COMPOSE_FILE:-$repo_root/compose.prod.yml}"
backup_arg="$1"

case "$backup_arg" in
  /*) backup_path="$backup_arg" ;;
  *) backup_path="$repo_root/backups/$backup_arg" ;;
esac

if [ ! -f "$backup_path" ]; then
  echo "Backup file not found: $backup_path" >&2
  exit 1
fi

cd "$repo_root"

docker compose -f "$compose_file" stop app

docker compose -f "$compose_file" run --rm \
  -v "$(dirname "$backup_path"):/backups" \
  app restore-sqlite.sh "/backups/$(basename "$backup_path")"

docker compose -f "$compose_file" up -d
