FROM python:3.11-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements and install Python dependencies
COPY server/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt gunicorn

# Copy application code and static files
COPY server/ .

# Expose port
EXPOSE 5000

# Default command uses gunicorn for production
# Can be overridden in docker-compose for development
CMD ["gunicorn", "--bind", "0.0.0.0:5000", "--workers", "4", "--timeout", "120", "app:app"]
