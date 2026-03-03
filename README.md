![Accounta logo](./logo.png)

# Accounta

Accounta is a lightweight Flask/React bookkeeping app for freelancers and small teams.

I’ve open‑sourced the backend and frontend so you can run it locally, hack on it,
or use parts of it in your own projects.

### Features

- Flask API with JWT auth
- React dashboard with charts
- Redis queue for background tasks
- Docker compose setup for dev

### Getting started

1. Clone the repo.
2. `docker compose up` (make sure Docker is installed).
3. Backend on http://localhost:5001, frontend on http://localhost:3000.

### Development

Edit `server/` or `client/`, volumes are mounted by `docker-compose.override.yml`.
Run tests with `make test` or `pytest` from the `server` directory.



Use it however you like. Let me
know if you build something cool with it!
