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
| **Frontend** | React 18, TypeScript, Vite, TanStack Query |
| **Auth** | JWT (access + refresh rotation), httpOnly cookies, bcrypt |
| **Infra** | Docker Compose (5 services), health checks, resource limits |

---

## 🚀 Quick Start

```bash
# 1. Clone & enter
git clone https://github.com/oskar089/search_jobs.git
cd search_jobs

# 2. Configure secrets
cp .env.example .env
# Edit .env — set JWT_SECRET, DATABASE_URL, REDIS_URL, LLM_API_KEY

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
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload

# Worker (separate terminal)
celery -A app.celery_app worker --loglevel=info

# Frontend (separate terminal)
cd frontend
npm install && npm run dev
```

---

## 🧪 Testing

```bash
cd backend
pytest -v -m "not e2e"     # Unit + integration without live services
pytest -v -m e2e           # Browser E2E (requires frontend, backend and Chromium)
pytest --cov=app --cov-report=term-missing -m "not e2e"

cd ../frontend
npm ci
npm run lint
npm run typecheck
npm test
```

---

## 🔐 Security Highlights

- **JWT refresh rotation** with theft detection (blacklisted tokens in Redis)
- **Account lockout** after 5 failed login attempts (15 min cooldown)
- **Rate limiting** on auth endpoints (slowapi)
- **Passwords**: bcrypt hashing, 8+ char minimum, uppercase + number required
- **Cookies**: httpOnly, Secure, SameSite=Lax — no localStorage tokens
- **Startup validation**: fails closed if JWT_SECRET < 32 chars or DB/Redis missing
- **CV upload**: magic byte validation, size capped at 10 MB
- **Scraper network isolation**: runs in container with restricted egress
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
│   ├── migrations/         # Alembic
│   └── tests/
├── frontend/
│   └── src/
│       ├── pages/          # 8 pages (Login, Dashboard, Portals, etc.)
│       ├── components/     # Layout, Modal, UI components
│       ├── lib/            # API client, auth, typed services
│       ├── context/        # AuthContext
│       └── types/          # TypeScript interfaces
├── docker-compose.yml      # 5 services + optional Celery Beat
└── README.md
```

---

## 📦 Services

| Service | Port | Purpose |
|---------|------|---------|
| `frontend` | `:5173` | React SPA (nginx in production) |
| `backend` | `:8000` | FastAPI REST API |
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
