# Expense Tracker (localStorage)

Small, self-contained Expense Tracker app that runs in your browser and stores data to localStorage. It supports:

- Add income or expense entries (description, amount, category)
- Auto-calculation of total income, total expenses and net balance
- Category breakdown for expenses (percentage of total expense)
- Persist entries using localStorage

## Files

- `index.html` — single-page UI
- `styles.css` — minimal styling
- `app.js` — logic: add/remove entries, totals, category percentages, localStorage

## How to run

Open `index.html` in a browser (no server required):

```bash
# macOS / Linux
open index.html

# Or use a small static server
python3 -m http.server 8000
# then visit http://localhost:8000

## Backend (optional) — Flask + MySQL

The repository includes a tiny Flask backend (in `/server`) that persists users and entries in a MySQL database. Using it enables login/register and stores each user's entries server-side (instead of localStorage).

Quick start (macOS / Linux):

1. Create a Python virtualenv and install requirements:

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r server/requirements.txt
```

2. Create a MySQL database and user, then run the SQL schema (or you can run `server/app.py` which will create tables for SQLite if `DATABASE_URL` isn't set):

```sql
-- connect as a privileged user and run
CREATE DATABASE finance_tracker CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
-- create a db user and grant privileges (example user/password)
CREATE USER 'ftuser'@'localhost' IDENTIFIED BY 'secretpassword';
GRANT ALL PRIVILEGES ON finance_tracker.* TO 'ftuser'@'localhost';
```

Then import schema file:

```bash
mysql -u ftuser -p finance_tracker < server/schema.sql
```

3. Configure environment variables by copying `server/.env.sample` to `server/.env` and updating values (`DATABASE_URL`, `SECRET_KEY`). Example `DATABASE_URL` for MySQL:

```
DATABASE_URL=mysql+pymysql://ftuser:secretpassword@localhost:3306/finance_tracker
```

4. Run the server:

```bash
# Option A — directly with Python
cd server
python app.py

# Option B — using npm (dev helper). This will install a small nodemon dev dependency and run the Python server with auto-reload:
npm install
npm run dev
```

5. Open `login.html` in your browser and create an account or login. By default the front-end expects the backend to run at `http://127.0.0.1:5000` — edit `login.html` and `app.js` if your server runs elsewhere.

Security note: This sample backend is intentionally small and **not** production hardened. For production use, add CSRF protection, secure cookies or comprehensive token management, rate limiting, and other hardening steps.
```

## Manual tests / Quick checklist

1. Load the page. Some sample entries are provided on first load so you can see totals and breakdown.
2. Add a new entry: choose Type (Income/Expense), give a Description, Amount and Category, then click Add.
3. Verify totals update: Income, Expense and Net change.
4. Check the category breakdown list — it displays expense totals and percentage of total expenses.
5. Delete an entry with the 'Delete' button — totals and breakdown should update instantly.
6. Reload the page: entries persist using localStorage.
7. Click Clear All to remove all entries (it will ask for confirmation).

## Implementation notes

- Data is saved in localStorage under the key `finance-tracker.entries` as JSON.
- The app is intentionally small and framework-free for educational/demo purposes.
