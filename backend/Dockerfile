# =============================================================================
#  Search Jobs Backend — Multi-stage Dockerfile
#  Stage 1 (builder):   pip install + download Playwright Chromium
#  Stage 2 (runtime):   Chromium system libraries, non-root user
# =============================================================================

ARG PYTHON_IMAGE=python:3.12-slim-bookworm

# ---- Stage 1: Builder -------------------------------------------------------
FROM ${PYTHON_IMAGE} AS builder

WORKDIR /build

# Shared, non-home location so the non-root runtime user can read the browsers
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

# Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Playwright browsers (Chromium only). System libraries are installed in the
# runtime stage, which is where Chromium actually runs.
RUN playwright install chromium

# ---- Stage 2: Runtime -------------------------------------------------------
FROM ${PYTHON_IMAGE} AS runtime

ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

# Copy installed Python packages + Playwright from builder
COPY --from=builder /usr/local/lib/python3.12/site-packages /usr/local/lib/python3.12/site-packages
COPY --from=builder /usr/local/bin /usr/local/bin
COPY --from=builder /ms-playwright /ms-playwright

# Runtime system dependencies: Chromium libraries (resolved by Playwright for
# this distro), postgresql-client for pg_isready, curl and procps (pgrep) for
# the Compose healthchecks
RUN apt-get update \
    && playwright install-deps chromium \
    && apt-get install -y --no-install-recommends postgresql-client curl procps \
    && rm -rf /var/lib/apt/lists/*

# Non-root runtime user
RUN groupadd --system --gid 10001 app \
    && useradd --system --uid 10001 --gid app --home-dir /app --no-create-home app \
    && chmod -R a+rX /ms-playwright

# Application code (owned by the runtime user: Celery Beat writes its schedule
# file to the working directory)
COPY --chown=app:app . .

# Uploads directory (persisted via named volume; a new volume inherits this ownership)
RUN mkdir -p /app/uploads/cv && chown -R app:app /app/uploads

# Entrypoint
COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod 755 /docker-entrypoint.sh

USER app

ENTRYPOINT ["/docker-entrypoint.sh"]
