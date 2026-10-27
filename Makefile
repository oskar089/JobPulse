# JobPulse - Common Development Commands
# Usage: make <target>
# See also: .github/workflows/ci.yml for CI equivalents

.PHONY: help dev backend-dev frontend-dev test lint typecheck format build docker-up docker-down clean install-hooks

# Default target
help:
	@echo "JobPulse Development Commands"
	@echo ""
	@echo "Development:"
	@echo "  make dev           - Start all services (backend + frontend + workers)"
	@echo "  make backend-dev   - Start backend only (uvicorn --reload)"
	@echo "  make frontend-dev  - Start frontend only (vite)"
	@echo "  make worker-dev    - Start Celery worker"
	@echo "  make beat-dev      - Start Celery beat scheduler"
	@echo ""
	@echo "Docker:"
	@echo "  make docker-up     - Start all services with Docker Compose"
	@echo "  make docker-up-beat - Start all services + Celery Beat"
	@echo "  make docker-down   - Stop all services (keep volumes)"
	@echo "  make docker-down-v - Stop all services (remove volumes)"
	@echo "  make docker-logs   - Follow logs for all services"
	@echo ""
	@echo "Quality:"
	@echo "  make test          - Run all tests (backend + frontend)"
	@echo "  make test-backend  - Run backend tests only"
	@echo "  make test-frontend - Run frontend tests only"
	@echo "  make lint          - Run all linters (ruff, eslint)"
	@echo "  make typecheck     - Run all type checkers (mypy, tsc)"
	@echo "  make format        - Auto-format code (ruff format, prettier)"
	@echo ""
	@echo "Setup:"
	@echo "  make install       - Install all dependencies (backend + frontend)"
	@echo "  make install-hooks - Install pre-commit hooks"
	@echo ""
	@echo "Utilities:"
	@echo "  make clean         - Clean build artifacts and caches"
	@echo "  make generate-api  - Generate TypeScript types from OpenAPI schema"
	@echo "  make db-migrate    - Run Alembic migrations"
	@echo "  make db-revision   - Create new migration (usage: make db-revision MSG='add column')"

# =========================================================================
# Development
# =========================================================================
dev: docker-up

backend-dev:
	cd backend && uv run uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

frontend-dev:
	cd frontend && npm run dev

worker-dev:
	cd backend && uv run celery -A app.celery_app worker --loglevel=info --pool=prefork

beat-dev:
	cd backend && uv run celery -A app.celery_app beat --loglevel=info

# =========================================================================
# Docker
# =========================================================================
docker-up:
	docker compose up -d

docker-up-beat:
	docker compose --profile beat up -d

docker-down:
	docker compose down

docker-down-v:
	docker compose down -v

docker-logs:
	docker compose logs -f

docker-build:
	docker compose build

docker-ps:
	docker compose ps

# =========================================================================
# Quality
# =========================================================================
test: test-backend test-frontend

test-backend:
	cd backend && uv run pytest -v --tb=short

test-frontend:
	cd frontend && npm run test 2>/dev/null || echo "No frontend tests configured yet"

lint:
	cd backend && uv run ruff check .
	cd frontend && npx eslint src --ext ts,tsx --max-warnings 0

typecheck:
	cd backend && uv run mypy app
	cd frontend && npx tsc --noEmit

format:
	cd backend && uv run ruff format .
	cd frontend && npx prettier --write "src/**/*.{ts,tsx,json,css,md}"

# =========================================================================
# Setup
# =========================================================================
install:
	cd backend && uv sync
	cd frontend && npm ci

install-hooks:
	pip install pre-commit && pre-commit install

# =========================================================================
# Utilities
# =========================================================================
generate-api:
	cd frontend && npm run generate:api

db-migrate:
	cd backend && uv run alembic upgrade head

db-revision:
	cd backend && uv run alembic revision --autogenerate -m "$(MSG)"

clean:
	rm -rf backend/.mypy_cache backend/.pytest_cache backend/.ruff_cache
	rm -rf frontend/dist frontend/node_modules frontend/*.tsbuildinfo
	rm -rf .pytest_cache .mypy_cache .ruff_cache
	docker compose down -v 2>/dev/null || true