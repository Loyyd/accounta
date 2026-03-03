# Accounta - Dockerized Finance Management

Accounta is a comprehensive finance tracker application, now containerized with Docker Compose for easy setup and deployment. It features a Flask backend for API services and data persistence with MySQL, a Redis cache, and a vanilla JavaScript frontend.

## Features:

-   **Frontend**: Intuitive, responsive vanilla JavaScript UI with Chart.js for visualizations.
    -   Dashboard with financial overview, charts, and transaction lists.
    -   Login/Register with JWT authentication.
    -   Admin panel for user management.
    -   Supports categories, subscriptions, and budgeting.
-   **Backend**: Robust Flask API
    -   RESTful endpoints for managing users, entries, categories, subscriptions, and budgets.
    -   JWT token-based authentication with role-based access control.
    -   CORS enabled.
-   **Database**: MySQL for reliable, persistent data storage.
-   **Caching**: Redis for performance enhancement (e.g., session management, data caching).
-   **Database Management**: Adminer for easy web-based MySQL administration.

## Services:

The application is composed of the following services, orchestrated by Docker Compose:

-   `backend`: Flask API server (Python) serving the static frontend files and API endpoints.
-   `db`: MySQL database server.
-   `redis`: Redis caching and message broker.
-   `adminer`: Web-based interface for managing the MySQL database.

## Getting Started with Docker Compose

These instructions will get your copy of the project up and running on your local machine.

### Prerequisites

-   Docker Desktop (includes Docker Engine and Docker Compose)

### Installation and Setup

1.  **Clone the repository:**
    ```bash
    git clone https://github.com/konradkunkel/accounta.git
    cd accounta
    ```

2.  **Configure Environment Variables:**
    Copy the example environment file and update it with your desired values. This file contains sensitive information like database credentials and secret keys.
    ```bash
    cp .env.example .env
    # Open .env in your editor and modify values as needed.
    ```
    _Note: For production, ensure `SECRET_KEY` is a strong, unique value and `FLASK_ENV` is set to `production`._

3.  **Build and Run with Docker Compose:**
    This command will build the Docker images (if not already built) and start all the services defined in `docker-compose.yml` and `docker-compose.override.yml`. The `override` file is configured for development with hot-reloading for the Flask backend.
    ```bash
    docker-compose up --build
    ```
    For a production-like build (without development overrides):
    ```bash
    docker-compose -f docker-compose.yml up --build
    ```

### Accessing the Application

Once all services are up and running:

-   **Frontend**: Open your browser and navigate to `http://localhost:5001`
-   **Backend API**: The API endpoints are available at `http://localhost:5001/api/...`
-   **Adminer (Database GUI)**: Access Adminer at `http://localhost:8080` (Server: `db`, Username: `ftuser`, Password: `finance_password` from `.env`)

### Stopping the Application

To stop all running Docker Compose services:

```bash
docker-compose down
```

### Development Notes

-   **Frontend Assets**: All frontend HTML, CSS, and JavaScript files are located in `server/static/`. Flask serves these files directly.
-   **Database Schema**: The `server/schema.sql` file is automatically imported into the MySQL database upon its first initialization by Docker Compose.
-   **Hot-reloading**: In development mode (`docker-compose up --build`), changes to files in `server/` will trigger a reload of the Flask backend.

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
