#!/bin/sh
set -eu

repo_root="$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)"
compose_file="${COMPOSE_FILE:-$repo_root/compose.prod.yml}"
backup_dir="${BACKUP_DIR:-$repo_root/backups}"

mkdir -p "$backup_dir"

cd "$repo_root"

docker compose -f "$compose_file" run --rm \
  -e BACKUP_DIR=/backups \
  -v "$backup_dir:/backups" \
  app backup-sqlite.sh
