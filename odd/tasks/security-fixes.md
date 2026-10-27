# Security fixes — leftover scripts and SSRF gaps

Fixes found during a security/bug review of the backend, requested to be done via parallel subagents without stepping on each other's work.

## Specs

- S1: Remove the leftover one-off debug scripts from the repo root `backend/`: `fix_portals.py` (also contains a hardcoded live Neon Postgres credential, handled separately via secret rotation/history purge — not part of this task), `analyze_portals.py`, `check_errors.py`, `check_runs.py`. These are not part of the application or test suite and should not live in the repo.
- S2: Fix incomplete SSRF protection in `backend/app/portals/router.py` `dry_run_portal`. Current guard only rejects `test_url` when the hostname is a literal private/loopback/link-local IP; a hostname that *resolves* via DNS to such an address (DNS rebinding) bypasses it. Must resolve non-literal hostnames and reject if any resolved address is private/loopback/link-local/unspecified. Must not break the existing allowed path for normal public hostnames.
- S3: Fix missing SSRF guard in `backend/app/applicator/engine.py` `AutoApplicator.apply()`. It navigates Playwright directly to `job_url` (sourced from user-controlled scraped portal data) with zero URL validation. Must add the same class of validation as S2 (scheme http/https, reject private/loopback/link-local/unspecified literal IPs or resolved addresses) before navigating, without changing the existing `{"status": "failed", "error": ...}` / exception-handling contract of `apply()`.

## Tasks

- T1 (S1): Remove the four leftover scripts — route: worker — commit: pending
- T2 (S2): Fix SSRF in portal dry-run with RED/GREEN tests — route: worker — commit: pending
- T3 (S3): Fix SSRF in auto-apply engine with RED/GREEN tests — route: worker — commit: pending

## Log

- L1: User asked (in Spanish) to review the codebase for security flaws, bugs, and garbage/dead code. Findings reported: hardcoded Neon Postgres credentials in `backend/fix_portals.py` (critical, handled outside this doc), incomplete SSRF guard in portal dry-run (literal-IP-only check), missing SSRF guard in auto-apply engine, and four leftover debug scripts (`fix_portals.py`, `analyze_portals.py`, `check_errors.py`, `check_runs.py`).
- L2: User asked to use parallel subagents for the fixes without them interfering with each other's work. Three independent, disjoint-surface units identified: T1 (script removal), T2 (portals router SSRF), T3 (applicator engine SSRF). Git history purge of the leaked credential deferred — destructive/irreversible, requires explicit separate user confirmation.
