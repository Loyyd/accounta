// accounta.nomad.hcl - lightweight bookkeeping app
//
// The app image is published by the accounta repository GitHub Action.
// Deploy with an immutable Git SHA tag so Nomad sees a real image change:
//
//   nomad job run \
//     -var="accounta_image=ghcr.io/loyyd/accounta:<git-sha>" \
//     deploy/nomad/accounta.nomad.hcl
//
// The :main tag is only a fallback for manual testing. Persistent data lives
// in the restored accounta-state host volume on nomad-worker-fireland-f4ssd-1.
//
// Runtime secrets are rendered from the restored accounta-state .env file.
// Non-secret production paths are declared here so a stale restored .env cannot
// point the app back at container-local storage.

variable "accounta_image" {
  type    = string
  default = "ghcr.io/loyyd/accounta:main"
}

variable "accounta_backup_image" {
  type    = string
  default = "python:3.11-slim@sha256:a3ab0b966bc4e91546a033e22093cb840908979487a9fc0e6e38295747e49ac0"
}

variable "accounta_backup_retention_months" {
  type    = number
  default = 24
}

job "accounta" {
  datacenters = ["homelab"]
  type        = "service"

  constraint {
    attribute = "${attr.unique.hostname}"
    value     = "nomad-worker-fireland-f4ssd-1"
  }

  group "accounta" {
    network {
      mode = "bridge"

      port "http" {
        to           = 5000
        host_network = "overlay"
      }
    }

    restart {
      attempts = 5
      interval = "10m"
      delay    = "20s"
      mode     = "delay"
    }

    volume "accounta-state" {
      type      = "host"
      source    = "accounta-state"
      read_only = false
    }

    task "accounta" {
      driver = "docker"

      config {
        image      = var.accounta_image
        force_pull = true
        ports      = ["http"]
        command    = "sh"
        args = [
          "-ec",
          <<-EOF
            export APP_ENV=production
            export PORT=5000
            export DATABASE_URL=sqlite:////state/data/accounta.db
            export CORS_ORIGINS=https://accounta.bcgen.ie
            export TRUST_PROXY_COUNT=1
            export GUNICORN_WORKERS=1
            export GUNICORN_TIMEOUT=120
            export ALLOW_PASSWORD_AUTH=false
            exec gunicorn --bind "0.0.0.0:$PORT" --workers "$GUNICORN_WORKERS" --timeout "$GUNICORN_TIMEOUT" app:app
          EOF
        ]
      }

      env {
        APP_ENV             = "production"
        PORT                = "5000"
        DATABASE_URL        = "sqlite:////state/data/accounta.db"
        CORS_ORIGINS        = "https://accounta.bcgen.ie"
        ALLOW_PASSWORD_AUTH = "false"
        TRUST_PROXY_COUNT   = "1"
        GUNICORN_WORKERS    = "1"
        GUNICORN_TIMEOUT    = "120"
      }

      template {
        data        = <<-EOF
          {{ file "/opt/nomad/volumes/accounta-state/app/.env" }}
        EOF
        destination = "secrets/accounta.env"
        env         = true
        change_mode = "restart"
      }

      volume_mount {
        volume      = "accounta-state"
        destination = "/state"
        read_only   = false
      }

      resources {
        cpu        = 200
        memory     = 128
        memory_max = 512
      }
    }

    task "monthly-backup" {
      driver = "docker"

      config {
        image      = var.accounta_backup_image
        force_pull = true
        command    = "python"
        args       = ["local/accounta_monthly_backup.py"]
      }

      env {
        ACCOUNTA_DB_PATH              = "/state/data/accounta.db"
        ACCOUNTA_BACKUP_DIR           = "/state/backups/monthly"
        ACCOUNTA_BACKUP_RETENTION     = var.accounta_backup_retention_months
        ACCOUNTA_BACKUP_CHECK_HOUR    = "23"
        ACCOUNTA_BACKUP_CHECK_MINUTE  = "50"
        ACCOUNTA_BACKUP_TZ            = "CET-1CEST,M3.5.0,M10.5.0/3"
      }

      template {
        destination = "local/accounta_monthly_backup.py"
        data        = <<-PY
          import datetime as dt
          import gzip
          import hashlib
          import json
          import os
          import shutil
          import sqlite3
          import sys
          import time
          import traceback
          from pathlib import Path

          db_path = Path(os.environ["ACCOUNTA_DB_PATH"])
          backup_dir = Path(os.environ["ACCOUNTA_BACKUP_DIR"])
          retention = int(os.environ.get("ACCOUNTA_BACKUP_RETENTION", "24"))
          check_hour = int(os.environ.get("ACCOUNTA_BACKUP_CHECK_HOUR", "23"))
          check_minute = int(os.environ.get("ACCOUNTA_BACKUP_CHECK_MINUTE", "50"))

          os.environ["TZ"] = os.environ.get("ACCOUNTA_BACKUP_TZ", "CET-1CEST,M3.5.0,M10.5.0/3")
          if hasattr(time, "tzset"):
              time.tzset()

          def log(message):
              print(message, flush=True)

          def now_local():
              return dt.datetime.now().astimezone()

          def backup_once(today):
              tomorrow = today + dt.timedelta(days=1)
              if today.month == tomorrow.month:
                  log(f"Skipping: {today.isoformat()} is not the last day of the month")
                  return

              if not db_path.is_file():
                  raise RuntimeError(f"SQLite database not found at {db_path}")

              backup_dir.mkdir(parents=True, exist_ok=True)
              stem = f"accounta-{today:%Y-%m}"
              raw_path = backup_dir / f"{stem}.db"
              gz_path = backup_dir / f"{stem}.db.gz"
              sha_path = backup_dir / f"{stem}.db.gz.sha256"
              manifest_path = backup_dir / f"{stem}.json"
              tmp_path = backup_dir / f".{stem}.db.tmp"
              tmp_gz_path = backup_dir / f".{stem}.db.gz.tmp"

              for path in (tmp_path, tmp_gz_path):
                  path.unlink(missing_ok=True)

              source = sqlite3.connect(f"file:{db_path}?mode=ro", uri=True)
              try:
                  target = sqlite3.connect(tmp_path)
                  try:
                      source.backup(target)
                  finally:
                      target.close()
              finally:
                  source.close()

              with tmp_path.open("rb") as src, gzip.open(tmp_gz_path, "wb", compresslevel=9) as dst:
                  shutil.copyfileobj(src, dst)

              digest = hashlib.sha256()
              with tmp_gz_path.open("rb") as handle:
                  for chunk in iter(lambda: handle.read(1024 * 1024), b""):
                      digest.update(chunk)

              tmp_gz_path.replace(gz_path)
              tmp_path.replace(raw_path)
              sha_path.write_text(f"{digest.hexdigest()}  {gz_path.name}\\n")
              manifest_path.write_text(json.dumps({
                  "service": "accounta",
                  "date": today.isoformat(),
                  "created_at_utc": dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat(),
                  "database": str(db_path),
                  "backup": gz_path.name,
                  "raw_backup": raw_path.name,
                  "sha256": digest.hexdigest(),
                  "bytes": gz_path.stat().st_size,
              }, indent=2) + "\\n")

              backups = sorted(backup_dir.glob("accounta-????-??.db.gz"))
              for old_gz in backups[:-retention]:
                  month = old_gz.name.removeprefix("accounta-").removesuffix(".db.gz")
                  for suffix in (".db", ".db.gz", ".db.gz.sha256", ".json"):
                      (backup_dir / f"accounta-{month}{suffix}").unlink(missing_ok=True)

              log(f"Created {gz_path}")
              log(f"Created {sha_path}")
              log(f"Created {manifest_path}")

          while True:
              now = now_local()
              next_check = now.replace(hour=check_hour, minute=check_minute, second=0, microsecond=0)
              if now >= next_check:
                  next_check = next_check + dt.timedelta(days=1)

              sleep_seconds = max(1, (next_check - now).total_seconds())
              log(f"Next monthly backup check at {next_check.isoformat()}")
              time.sleep(sleep_seconds)

              try:
                  backup_once(now_local().date())
              except Exception:
                  traceback.print_exc(file=sys.stderr)
                  time.sleep(3600)
        PY
      }

      volume_mount {
        volume      = "accounta-state"
        destination = "/state"
        read_only   = false
      }

      resources {
        cpu        = 50
        memory     = 32
        memory_max = 256
      }
    }

    service {
      name         = "accounta"
      port         = "http"
      provider     = "nomad"
      address_mode = "host"
      tags = [
        "pcf.hostname=accounta.bcgen.ie",
        "pcf.visibility=public",
        "traefik.enable=true",
        "traefik.http.routers.accounta.rule=Host(`accounta.bcgen.ie`)",
        "traefik.http.routers.accounta.entrypoints=websecure",
        "traefik.http.routers.accounta.tls.certresolver=letsencrypt",
      ]

      check {
        type         = "http"
        method       = "GET"
        path         = "/api/ping"
        interval     = "30s"
        timeout      = "10s"
        address_mode = "host"
      }
    }
  }
}
