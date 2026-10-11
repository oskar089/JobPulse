# Backend quality baseline

Objective: Expand backend lint and typing gates from the reviewed-path CI checks to the entire project without masking existing errors.

Baseline at review-hardening branch preparation: global `ruff check .` found 83 diagnostics outside the reviewed changes; global `mypy app` found 24 existing errors. These are NOT covered by the incremental CI jobs.

- [ ] Classify the existing Ruff findings by module and repair them in small behavior-preserving work units, with tests alongside any behavior change.
- [ ] Resolve the mypy errors, including settings initialization and typed Redis calls, without suppressing unrelated errors globally.
- [ ] Replace the reviewed-path CI commands with full-project Ruff and mypy only after both commands pass in a clean checkout.

Checks: run the full backend non-E2E suite; do not run builds. Do not combine this cleanup with the rate-limit and dependency-lock review slice.
