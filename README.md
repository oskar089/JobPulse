# 🔥 JobPulse — AI-Powered Job Search Automation

**Stop hunting. Start closing.**

JobPulse is a full-stack job search automation platform that **scrapes, matches, applies, and notifies** — all on autopilot. Feed it your profile, connect your job portals, and let the AI pipeline do the grunt work while you focus on what matters: acing the interviews.

---

## ⚡ What It Does

| Stage | What | How |
|-------|------|-----|
| 🕷️ **Scrape** | Crawls job portals (LinkedIn, Infojobs, custom) | Playwright + stealth anti-detection |
| 🧠 **Match** | Scores jobs against your CV & preferences | LLM-powered semantic matching |
| ✍️ **Generate** | Writes tailored cover letters | OpenAI / any LLM API |
| 🤖 **Apply** | Auto-submits applications on your behalf | Playwright form-filling |
| 🔔 **Notify** | Sends real-time status updates | In-app + email (SMTP) |
| 📊 **Track** | Manages the entire pipeline | Celery + Redis orchestration |

---

## 🏗️ Architecture

```
┌─────────────┐     ┌──────────────┐     ┌─────────────┐
│  Frontend   │     │   Backend    │     │   Worker    │
│  React/Vite │────▶│  FastAPI     │────▶│  Celery     │
│  TanStack   │     │  SQLAlchemy  │     │  Playwright │
│  Query      │     │  async PG    │     │  LLM API    │
└─────────────┘     └──────┬───────┘     └──────┬──────┘
                           │                    │
                    ┌──────▼───────┐     ┌──────▼──────┐
                    │  PostgreSQL  │     │    Redis    │
                    │    16        │     │    7        │
                    └──────────────┘     └─────────────┘
```

### Stack

| Layer | Tech |
|-------|------|
| **Backend** | Python 3.12+, FastAPI, SQLAlchemy 2.0 (async), Pydantic v2 |
| **Database** | PostgreSQL 16 + Alembic migrations |
| **Queue** | Celery 5 + Redis 7 (broker & result backend) |
| **Scraping** | Playwright + Playwright-Stealth |
| **AI** | OpenAI-compatible API (GPT-4, Claude, local LLMs) |
| **Frontend** | React 19, TypeScript, Vite, TanStack Query |
| **Auth** | JWT (access + refresh rotation), httpOnly cookies, bcrypt |
| **Infra** | Docker Compose (5 core services + optional Celery Beat), health checks, resource limits |

---

## 🚀 Quick Start

```bash
# 1. Clone & enter
git clone https://github.com/oskar089/JobPulse.git search_jobs
cd search_jobs

# 2. Configure secrets
cp .env.example .env
# Set POSTGRES_USER, POSTGRES_PASSWORD, REDIS_PASSWORD, and a unique JWT_SECRET (32+ chars).
# Compose derives DATABASE_URL, REDIS_URL and RATE_LIMIT_STORAGE_URI from these values;
# LLM_API_KEY is optional for startup but required for AI features.
# Ports bind to 127.0.0.1 only; use a TLS-terminating reverse proxy for public access.

# 3. Launch everything
docker compose up -d

# 4. With periodic job scanning (recommended)
docker compose --profile beat up -d

# 5. Open the app
open http://localhost:5173
```

### Without Docker

```bash
# Backend
cd backend
# Configure backend/.env from backend/.env.example with reachable PostgreSQL,
# Redis, and a unique JWT_SECRET before starting the app.
python -m venv .venv
# Activate the venv for your shell (e.g. source .venv/bin/activate on Unix).
pip install -r requirements.txt
alembic upgrade head
uvicorn app.main:app --reload

# Worker (separate terminal, from the repository root, with the same environment)
cd backend
celery -A app.celery_app worker --loglevel=info

# Frontend (separate terminal, from the repository root)
cd frontend
npm install
# Vite has no /api proxy: set VITE_API_URL=http://localhost:8000/api
# in your shell (or frontend/.env.local), then run:
npm run dev
```

---

## 🧪 Testing

```bash
cd backend
python -m pytest -v -m "not e2e"  # Unit + integration; no live services required
# Run browser tests ONLY against disposable, isolated frontend, backend, PostgreSQL,
# and Redis services; install Playwright Chromium first (playwright install chromium).
# Set FRONTEND_URL, API_URL, TEST_EMAIL, TEST_PASSWORD for that isolated stack.
python -m pytest -v -m e2e
python -m pytest -m "not e2e" --cov=app --cov-report=term-missing
```

---

## ⚙️ Development Commands

```bash
# Quick start with Make (recommended)
make install           # Install all deps
make dev               # Start everything (Docker)
make docker-up-beat    # Start everything + periodic scheduler
make test              # Run backend + frontend tests (backend includes live E2E)
make lint              # Run all linters
make typecheck         # Run type checkers
make format            # Auto-format code
make generate-api      # Generate TS types from OpenAPI

# Or manually:
# Backend
cd backend && uv run uvicorn app.main:app --reload
cd backend && uv run celery -A app.celery_app worker --loglevel=info

# Frontend
cd frontend && npm run dev
cd frontend && npm run generate:api   # Generate API types (requires backend running)
cd frontend && npm run test
cd frontend && npm run lint
```

### Pre-commit Hooks

```bash
make install-hooks     # Install git hooks
pre-commit run --all-files  # Run manually
```

---

## 🔐 Security Highlights

- **JWT refresh rotation** with theft detection (blacklisted tokens in Redis)
- **Account lockout** after 5 failed login attempts (15 min cooldown)
- **Rate limiting** on auth endpoints (slowapi)
- **Passwords**: bcrypt hashing, 8+ char minimum, uppercase + number required
- **Cookies**: httpOnly, SameSite=Lax; Secure outside development — no localStorage tokens
- **Startup validation**: fails closed if JWT_SECRET < 32 chars or DB/Redis missing
- **CV upload**: magic byte validation, size capped at 10 MB
- **No email enumeration**: forgot-password always returns 200

---

## 📁 Project Structure

```
search_jobs/
├── backend/
│   ├── app/
│   │   ├── auth/           # JWT auth, Redis blacklist, rate limit
│   │   ├── profiles/       # Profile CRUD, CV parsing, LinkedIn import
│   │   ├── portals/        # Portal config, scrapers management
│   │   ├── jobs/           # Stored jobs
│   │   ├── applications/   # Applications tracking
│   │   ├── pipeline/       # Pipeline orchestration
│   │   ├── scrapers/       # Playwright scrapers (engine + built-in portals)
│   │   ├── matching/       # Job-CV matching engine
│   │   ├── cover_letter/   # LLM cover letter generation
│   │   ├── applicator/     # Auto-apply engine
│   │   ├── notifications/  # In-app + email notifications
│   │   ├── tasks/          # Celery tasks (scrape, match, apply, notify)
│   │   └── models/         # SQLAlchemy models
│   ├── alembic/            # Alembic migrations
│   └── tests/
├── frontend/
│   └── src/
│       ├── pages/          # Login, Dashboard, Portals, and other views
│       ├── components/     # Layout, Modal, UI components
│       ├── lib/            # API client, auth, typed services
│       ├── context/        # AuthContext
│       └── types/          # TypeScript interfaces
├── docker-compose.yml      # 5 core services + optional Celery Beat
├── Makefile                # Common dev commands
├── .github/workflows/ci.yml  # GitHub Actions CI
├── .pre-commit-config.yaml   # Pre-commit hooks
└── README.md
```

---

## 📦 Services

| Service | Port | Purpose |
|---------|------|---------|
| `frontend` | `127.0.0.1:5173` | React SPA served by nginx in Compose |
| `backend` | `127.0.0.1:8000` | FastAPI REST API (runs Alembic migrations on startup) |
| `celery-worker` | — | Async task processor |
| `celery-beat` | — | Periodic scheduler (opt-in) |
| `postgres` | — | Primary database |
| `redis` | — | Cache, broker, rate limiter |

---

## 🛣️ Roadmap

- [x] Multi-portal scraping (LinkedIn, Infojobs, custom)
- [x] CV parsing + AI profile extraction
- [x] Auto-cover letter generation
- [x] Pipeline orchestration (scrape → match → apply → notify)
- [x] Auth with refresh rotation + theft detection
- [ ] Admin dashboard + analytics
- [ ] Slack/Discord notification channels
- [ ] Multi-language resume tailoring
- [ ] Rate-limit-aware polite scraping profiles

---

## 📄 License

MIT — because the job market belongs to everyone.

---

> **JobPulse** — Your job search, on autopilot. ⚡
