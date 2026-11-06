# OncoBrief — Phase 07C Regression Register & TDD Log

- **Document Version:** 1.0 (Phase 07C Release Candidate Hardening)
- **Date:** 2026-11-03
- **Auditor:** Principal Full-Stack Engineer & TDD Lead
- **Methodology:** Strict Test-Driven Defect Repair (Reproduce RED -> Smallest Fix -> Verify GREEN -> Regression Check)

---

## 1. Summary of Defect Lifecycle

| Defect ID | Severity | Surface | Root Cause | TDD Test File | Status |
|---|---|---|---|---|---|
| **PH07C-REG-001** | High | PostgreSQL RLS | Session-variable divergence (`app.current_tenant_id` vs `app.org_id`) | `packages/db/test/fhir-rls-security.test.ts` | **RESOLVED (GREEN)** |
| **PH07C-REG-002** | High | FHIR Client Adapter | Advanced SSRF bypasses (numeric IP aliases, IPv4-mapped IPv6, HTTP redirects) | `packages/adapters/test/fhir-client.test.ts` | **RESOLVED (GREEN)** |
| **PH07C-REG-003** | Medium | Web E2E Testing | Playwright `{ force: true }` workaround on SVG trend chart interaction | `apps/web/e2e/clinical-context.spec.ts` | **RESOLVED (GREEN)** |

---

## 2. Detailed Defect Reports & Verification

### 2.1 PH07C-REG-001: PostgreSQL RLS Session-Variable Backward Compatibility
- **Description:** Earlier project security audits described tenant context scoping via `app.current_tenant_id`, while all database migrations and services enforced `current_setting('app.org_id', true)`. If an external query, legacy policy, or third-party extension relied on `app.current_tenant_id`, it would fail to receive tenant context.
- **Expected Behavior:** `withTenant` sets both `app.org_id` and `app.current_tenant_id` transaction-locally so all queries resolve consistently under the unprivileged `oncobrief_app` role.
- **TDD Test Written (RED):** Authored `packages/db/test/fhir-rls-security.test.ts` containing 10 test scenarios covering valid context, missing context, wrong context, cross-tenant endpoints, cross-tenant transactions, cross-tenant patients, invalid tenant IDs, migrator vs app role, transaction-local scoping, and connection pool isolation.
- **Code Fix (GREEN):**
  ```typescript
  // packages/db/src/client.ts
  await client.query('BEGIN');
  await client.query('SELECT set_config($1, $2, true)', ['app.org_id', ctx.orgId]);
  await client.query('SELECT set_config($1, $2, true)', ['app.current_tenant_id', ctx.orgId]);
  await client.query('SELECT set_config($1, $2, true)', ['app.user_id', ctx.userId ?? '']);
  await client.query('SELECT set_config($1, $2, true)', ['app.role', ctx.role ?? '']);
  ```
- **Verification Evidence:** `pnpm --filter @oncobrief/db test test/fhir-rls-security.test.ts` -> **10 passed (453ms)**; all 271 db tests green.

---

### 2.2 PH07C-REG-002: Advanced SSRF Defenses in FHIR Client
- **Description:** `HttpFhirClientAdapter` had string-based checks for loopback and private subnets, but was vulnerable to numeric integer IP aliases (`2130706433`), hex IP aliases (`0x7f000001`), octal IP aliases (`0177.0.0.1`), IPv4-mapped IPv6 canonical addresses (`[::ffff:7f00:1]`), and unvalidated HTTP `302 Found` redirects pointing to AWS IMDS metadata (`169.254.169.254`).
- **Expected Behavior:** Any attempt to request or redirect to internal IP aliases, dangerous schemes (`file:`, `ftp:`), embedded credentials, or metadata must be rejected pre-flight with an `[SSRF_PROTECTED]` error.
- **TDD Test Written (RED):** Added 6 dedicated SSRF attack test cases in `packages/adapters/test/fhir-client.test.ts`. Initial run failed on WHATWG-canonical IPv4-mapped IPv6 and redirect handling.
- **Code Fix (GREEN):**
  1. Added protocol check in `validateUrlSsrf` (`http:`/`https:` only).
  2. Added embedded credential check (`parsed.username` / `parsed.password`).
  3. Added integer, hex, and octal IP decoding to canonical IPv4 octets.
  4. Added IPv4-mapped IPv6 parser converting both dotted and 16-bit hex pairs (`h1:h2`) into IPv4 octets.
  5. Implemented `dispatchRequest` enforcing `redirect: 'manual'`, recursive `Location` SSRF validation, and cross-origin blocking.
- **Verification Evidence:** `pnpm --filter @oncobrief/adapters test test/fhir-client.test.ts` -> **20 passed (174ms)**; all 131 adapter tests green.

---

### 2.3 PH07C-REG-003: Elimination of Playwright `{ force: true }` E2E Workaround
- **Description:** In `apps/web/e2e/clinical-context.spec.ts`, automated tests for SVG trend chart hover, click, and touch tap were using `{ force: true }` to bypass Playwright's actionability hit-testing checks on the chart data point `<g role="button">`.
- **Expected Behavior:** Ordinary users with pointers, mice, keyboards, or touch screens must be able to hover and select data points naturally without artificial test overrides.
- **TDD Test Modification (RED):** Removed `{ force: true }` from lines 74, 84, and 140 of `apps/web/e2e/clinical-context.spec.ts`.
- **Verification & Component Integrity (GREEN):** Executed `pnpm --filter @oncobrief/web exec playwright test e2e/clinical-context.spec.ts` against the live running web application:
  - `point.hover()` triggered tooltip: **PASS (665ms)**.
  - `point.click()` opened observation traceability: **PASS**.
  - `point.tap()` on 375px touch device opened traceability: **PASS (475ms)**.
  - Verified that zero instances of `{ force: true }` remain across all 22 Playwright E2E spec files (`grep -rn "force: true" apps/web/e2e/` returned 0 matches).

---

## 3. Regression Verdict

Zero open regressions remain. All 3 identified issues were resolved using test-driven methodology, verified by automated unit and E2E suites, and preserved without destructive git operations.
