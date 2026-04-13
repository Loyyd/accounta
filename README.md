<img src="./server/static/accounta.png" alt="accounta logo" width="200"/>

# Accounta

Accounta is a lightweight bookkeeping app for freelancers and small teams. It uses a Flask API, a SQLite database, and a static dashboard frontend served directly by the backend.

## What It Does

- JWT-based registration and login
- Income and expense tracking
- Category management with custom colors
- Recurring subscriptions
- Budget tracking
- Admin dashboard for user management
- Account settings, password changes, and full data export

## Tech Stack

- Backend: Flask, Flask-SQLAlchemy, PyJWT
- Frontend: HTML, CSS, vanilla JavaScript, Chart.js
- Database: SQLite by default
- Optional tooling: Docker, sqlite-web

## Project Structure

- [`server/app.py`](./server/app.py): Flask app, models, and API routes
- [`server/static/`](./server/static): frontend pages, scripts, styles, and images
- [`instance/dev.db`](./instance/dev.db): local SQLite development database
- [`docker-compose.yml`](./docker-compose.yml): backend plus sqlite-web

## Local Development

### Option 1: Run With Docker

```bash
docker compose up --build
```

- App: http://localhost:5001
- SQLite Web: http://localhost:8080

### Option 2: Run Without Docker

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r server/requirements.txt
python3 server/app.py
```

The app will be available at http://localhost:5000 unless you override the Flask/Gunicorn host or port.

## Environment Variables

Copy `.env.example` to `.env` if you want to override defaults.

- `DATABASE_URL`: optional SQLAlchemy connection string
- `SECRET_KEY`: JWT signing secret
- `JWT_ALGORITHM`: defaults to `HS256`
- `JWT_EXP_SECONDS`: token lifetime in seconds

If `DATABASE_URL` is not set, Accounta uses the local SQLite database in `instance/dev.db` when available.

## Tests

Run the API test suite with:

```bash
pytest server/tests
```

## Notes

- The app performs lightweight schema bootstrapping on startup for the local database.
- `server/schema.sql` is a SQLite-oriented reference schema that matches the current ORM models.
