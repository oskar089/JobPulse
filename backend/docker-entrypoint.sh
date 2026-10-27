#!/bin/bash
set -e

echo "========================================"
echo "  Search Jobs Backend — Docker Entrypoint"
echo "========================================"

POSTGRES_HOST="${POSTGRES_HOST:-postgres}"
POSTGRES_PORT="${POSTGRES_PORT:-5432}"
POSTGRES_USER="${POSTGRES_USER:-searchjobs}"

# Wait for PostgreSQL to be ready
echo "==> Waiting for PostgreSQL at ${POSTGRES_HOST}:${POSTGRES_PORT}..."
until pg_isready -h "$POSTGRES_HOST" -p "$POSTGRES_PORT" -U "$POSTGRES_USER" -q 2>/dev/null; do
  echo "    PostgreSQL not ready yet... sleeping"
  sleep 2
done
echo "    PostgreSQL is ready!"

# Only the API service runs migrations; Celery containers skip them to avoid
# concurrent Alembic upgrades against the same database.
if [ "${RUN_MIGRATIONS:-false}" = "true" ]; then
  echo "==> Running Alembic migrations..."
  alembic upgrade head
  echo "    Migrations completed!"
else
  echo "==> Skipping migrations (RUN_MIGRATIONS is not 'true')"
fi

echo "==> Starting service..."
echo ""
exec "$@"
