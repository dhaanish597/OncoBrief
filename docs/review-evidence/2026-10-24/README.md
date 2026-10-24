# Retained independent-review evidence

24 October 2026. Final command outputs and selected failing regressions are retained here. `browser-results.json` lists 51 distinct final Chromium cases. `sha256-manifest.json` identifies the copied logs before this index was added.

- `final-verify.log`: 886 passing unit/integration tests plus typecheck/lint/boundary/branding.
- `web-build.log`, `worker-build.log`: actual production builds.
- `journey-final.log`: ordered ten-scene UI/SQL journey and real HTTP withdrawal checks.
- `browser-*.log`: per-suite final results; every mutating suite was reset separately in an explicitly isolated database.
- `original-db-final.log`: read-only original database identity, catalog, exact migration match, recomputed ledger and audit hashes, app-role tenant isolation.
- `review-db-final.log`, `demo-final-fresh.log`: final clean isolated fixtures and intact hashes.
- `fresh-migrations.log`: all 15 migrations applied to an empty disposable local database.
- `production-reset-refused.log`: expected exit 1 before resetting.
- RED/GREEN logs: actual before/after behavior. `baseline-verify.log` is the original failed typecheck; no baseline test count is inferred.

All clinical-looking examples are synthetic. No credential values, live telecom delivery, cloud-provider acceptance, certification or hospital-outcome evidence is asserted by these logs.
