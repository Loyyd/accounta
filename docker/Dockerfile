FROM python:3.11-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    && rm -rf /var/lib/apt/lists/*

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

COPY server/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt gunicorn

COPY server/ .
COPY docker/backup-sqlite.sh /usr/local/bin/backup-sqlite.sh
RUN chmod +x /usr/local/bin/backup-sqlite.sh

RUN adduser --system --group accounta \
    && mkdir -p /app/data \
    && chown -R accounta:accounta /app

USER accounta

EXPOSE 5000

CMD ["sh", "-c", "exec gunicorn --bind 0.0.0.0:${PORT:-5000} --workers ${GUNICORN_WORKERS:-2} --timeout ${GUNICORN_TIMEOUT:-120} app:app"]
