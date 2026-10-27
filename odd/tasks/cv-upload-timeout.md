# CV upload timeout reliability

Objective: Bound CV parsing to return a useful HTTP error before the gateway times out, while preserving upload cleanup. Existing running containers are not rebuilt by this work.
Scope: `backend/app/profiles/cv_parser.py`, `backend/app/profiles/router.py`, focused backend tests. Preserve staged and unstaged user changes.

## Specs

S1. Reported symptom: "Gateway Time-out". The observed `POST /api/profiles/cv/upload` returned 504 after nginx waited 180 seconds; CV parsing uses 120 seconds per LLM attempt and retries once. A failure should terminate inside the proxy window without retrying transport failures.
S2. Reported message: "CV file saved successfully, but parsing failed: Failed to parse CV with LLM (qwen2.5:3b): All connection attempts failed. Please check that the LLM service is running and try again." Preserve the existing cleanup of failed uploads and stop claiming a file was saved when the upload route deletes it.
S3. User instruction: "revisa todo de nuevo que quede prolijo". Keep changes scoped, cover failed and successful behavior through tests, and do not rebuild, mutate persistent containers, re-upload a real CV, or change user data.

## Tasks

- [x] T1 (S1, inline, commit deferred pending explicit authorization): Test and implement one bounded LLM parsing budget, without transport retries. Targeted GREEN and independent structural review observed.
- [x] T2 (S2, inline, commit deferred pending explicit authorization): Test upload failure response and existing file/database cleanup, then correct misleading wording. Targeted GREEN and independent structural review observed.
- [ ] T3 (S1-S3, independent read-only verification, commit deferred pending explicit authorization): Full touched-module run was interrupted after 30 seconds without usable result; do not retry automatically. Running Docker image was not rebuilt, so live behavior is not verified.

## Log

L1. User: "Gateway Time-out"
L2. User: "revisa todo de nuevo que quede prolijo"
L3. Read-only evidence: nginx runtime `proxy_read_timeout 180s`; nginx logged upstream timeout/504 for `POST /api/profiles/cv/upload` at 2026-10-13 18:42:34. Backend logs contained `ReadTimeout`. Ollama/model reachable. Existing dirty backend/parser/router/nginx edits predate this task and must be preserved. Bounded read-only explorer timed out without findings; no retry. No rebuild is allowed by project rules.
L4. RED observed: three new deterministic failures (transport was retried, no bounded LLM budget, and failed-upload 502 falsely claimed the file was saved); existing malformed-JSON retry passed. Implemented a 150-second aggregate LLM budget under nginx's 180 seconds, stopped retrying transport failures, preserved one malformed-output retry, and changed only the failed-upload error wording. GREEN: five targeted checks passed. Focused Ruff check and format check passed for four touched Python files. Attempted both complete touched test modules, but the tool call exceeded 30 seconds and returned no usable exit/output; no automatic retry. No build, real CV upload, or container change.
L5. Independent read-only verifier found no blocking implementation defect; S1/S2 structurally met and S3 incomplete due missing suite and live proof. It identified a regression-test gap: the original budget test expired during the first attempt. Added a deterministic test showing the same budget spans two malformed-output attempts; that test passed, and focused Ruff/format passed afterward. Native `assess` was unassessable because the worktree has undeclared untracked files. The running image remains old; no build or deployment authorized.
L6. User: "Dale" — in direct response to whether to leave this as a source-only correction pending deployment. Decision: defer deployment and live verification; this is not authorization to build, restart containers, upload a CV, or claim the running image contains the fix. T3 remains blocked on missing complete-suite and live proof.
