# Review hardening

Objective: Deliver the review fixes and their direct prerequisites as a coherent review branch based on `main` (`ca09686`), without staging any unrelated changes from the original dirty worktree.

Scope: auth rate-limit peer identity and trusted proxy ingress, reproducible frontend/backend dependency locks, incremental CI, Nginx compatibility, and the observed backend test failures that prevented the new CI test job. No builds, live DB operations, or direct merge to `main`.

Review workload: `frontend/package-lock.json` alone adds 5,894 and deletes 687 generated lines; the backend lock is another large generated artifact. Keep independent work units and never compress tests or code to meet a line count. Delivery strategy: ask-on-risk; choose a chain/single-PR route before the next work-unit commit.

- [ ] T1: Restrict backend host ingress to loopback, overwrite forwarded client identity at Nginx, and have Uvicorn trust the private proxy network; retain the spoofed-header regression. Checks: 3 rate-limit tests pass; Compose YAML, proxy header, and Uvicorn configuration structurally checked. Runtime Nginx/Docker verification unavailable. Commit pending.
- [ ] T2: Synchronize npm and uv locks and declare `slowapi`; introduce narrowly named CI gates for the reviewed backend paths, full backend non-E2E tests, and frontend lint/typecheck/Vitest. Checks: `npm ci --dry-run`, `uv lock --check`, backend reviewed-path Ruff and mypy, frontend lint/typecheck/4 Vitest tests pass. Commit pending.
- [ ] T3: Repair baseline config/import test failures discovered when enabling CI. Checks: 143 backend tests passed, 5 E2E deselected with synthetic env and isolated SQLite. Commit pending.
- [ ] T4: Inspect exact staged scope and non-build checks, create reviewable commits on this branch, and offer the branch for review before any `main` update. No push/PR/merge yet.

Policy decision: The user chose incremental backend lint/typecheck instead of broad baseline cleanup. Track the remaining global Ruff/mypy debt separately in `odd/tasks/backend-quality-baseline.md`; CI names explicitly limit coverage. Build jobs are excluded by repository policy. Verified matching local commands: reviewed backend Ruff/mypy, full non-E2E backend pytest (143 passed, 5 deselected), frontend lint/typecheck/Vitest (4 passed), npm and uv locks. No runtime Nginx check while Docker is unavailable.

Known limitations: `nginx -t` cannot run while Docker and local Nginx are unavailable. Frontend browser E2E requires isolated live services and is excluded from backend unit CI. The original working tree's pre-existing staged and unstaged work is intentionally untouched.
