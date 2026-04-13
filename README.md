<img src="./server/static/accounta.png" alt="accounta logo" width="200"/>

# Accounta

Accounta is a lightweight bookkeeping app for freelancers and small teams. It ships as a Flask API with a static frontend and uses SQLite.

## Current State Of The Repo

Already production-leaning:

- Flask app served by Gunicorn in [`docker/Dockerfile`](./docker/Dockerfile)
- Health endpoint at `/api/ping`
- Persistent database path can be controlled with `DATABASE_URL`
- App and static frontend are bundled together in one container

Still development-oriented before this pass:

- [`docker-compose.yml`](./docker-compose.yml) exposed `sqlite-web`
- No dedicated production Compose file
- `SECRET_KEY` could silently fall back to an ephemeral value
- No proxy header handling for a reverse proxy in front of the app
- No registration toggle for locking down public signups after bootstrap
- No documented persistent data and backup layout for a VM deployment

## Production Deployment On A Proxmox VM

The simplest safe path is:

1. Create a Debian 12 or Ubuntu 24.04 VM in Proxmox.
2. Install Docker Engine and the Compose plugin.
3. Clone this repo into a stable path such as `/opt/accounta`.
4. Copy `.env.example` to `.env` and set a strong `SECRET_KEY`.
5. Run `docker compose -f compose.prod.yml up -d --build`.
6. Put Nginx, Caddy, or Traefik in front of `127.0.0.1:5000`.

This keeps the app container replaceable while storing persistent data in `./data` on the VM host.

## Files For Production

- [`compose.prod.yml`](./compose.prod.yml): production deployment
- [`.env.example`](./.env.example): safer app env template
- [`docker/backup-sqlite.sh`](./docker/backup-sqlite.sh): SQLite backup helper
- [`docker/restore-sqlite.sh`](./docker/restore-sqlite.sh): SQLite restore helper
- [`scripts/backup.sh`](./scripts/backup.sh): host-side backup wrapper
- [`scripts/restore.sh`](./scripts/restore.sh): host-side restore wrapper

## Why SQLite For Now

SQLite is the right fit for this repo today because:

- the app already defaults to it
- the schema bootstrapping logic is SQLite-friendly
- the production setup only needs one container
- there is no worker or external database dependency in the codebase

Important gap today: the app does not yet use Alembic or another real migration framework. Schema updates currently rely on `db.create_all()` plus a small manual compatibility patch in [`server/app.py`](./server/app.py). That is workable for simple self-hosting, but schema changes and restores should still be handled carefully.

## Reverse Proxy Notes

The production Compose file binds the app to `127.0.0.1:${APP_PORT}` only, so it is meant to sit behind a reverse proxy on the same VM.

Set:

- `CORS_ORIGINS=https://your-domain.example`
- `TRUST_PROXY_COUNT=1`

If your proxy chain is more complex, increase `TRUST_PROXY_COUNT` accordingly.

## Registration And Admin Bootstrap

Public signup can now be disabled with `ALLOW_REGISTRATION=false`.

Suggested first bootstrap flow:

1. Deploy with `ALLOW_REGISTRATION=true`.
2. Register your first user through the app UI.
3. Promote that user to admin:

```bash
docker compose -f compose.prod.yml exec app python migrate_admin.py your-username
```

4. Change `.env` to `ALLOW_REGISTRATION=false`.
5. Restart the app:

```bash
docker compose -f compose.prod.yml up -d
```

## Backups

For SQLite, back up the `data/accounta.db` file regularly. The shortest path from the repo root is:

```bash
./scripts/backup.sh
```

By default this writes into `./backups`. If you want a different location:

```bash
BACKUP_DIR=/srv/accounta-backups ./scripts/backup.sh
```

Under the hood, the wrapper runs:

```bash
mkdir -p backups
docker compose -f compose.prod.yml run --rm \
  -e BACKUP_DIR=/backups \
  -v "$(pwd)/backups:/backups" \
  app backup-sqlite.sh
```

Each backup now creates:

- a timestamped `.db` copy
- a matching `.sha256` checksum file

Suggested minimum production routine:

1. Run a backup before every deploy.
2. Keep regular scheduled backups, such as daily plus a longer retention outside the VM.
3. Back up both the repo checkout and the `data/` directory, or use Proxmox snapshots in addition to file backups.

## Restore Test

Production readiness means proving you can restore, not just create backups.

Safe restore flow on the VM:

1. Stop the app:

```bash
./scripts/restore.sh accounta-YYYYMMDDTHHMMSSZ.db
```

You can also restore from an absolute path:

```bash
./scripts/restore.sh /srv/accounta-backups/accounta-YYYYMMDDTHHMMSSZ.db
```

Under the hood, the wrapper will:

- stop the app
- verify the checksum when present
- save the current database as `data/accounta-pre-restore-<timestamp>.db`
- restore the chosen backup
- start the app again

After restore, verify the app:

- open the site and log in
- confirm your expected users and entries are present
- check `docker compose -f compose.prod.yml ps`

For a real VM deployment, schedule backups of both:

- the repo checkout or deployment directory
- the persistent `data/` directory or the VM disk snapshot

Before calling this production-ready for yourself, do one full restore test on a fresh VM or clone of the VM and confirm the app boots cleanly with restored data.

## Local Development

Development is still available with:

```bash
docker compose up --build
```

If you want `sqlite-web`, start it explicitly:

```bash
docker compose --profile dev-tools up --build
```

## Tests

Run the API tests with:

```bash
pytest server/tests
```
