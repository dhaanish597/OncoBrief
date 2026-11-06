# OncoBrief — Phase 05 Regression Register
**Document ID:** `PHASE_05_REGRESSION_REGISTER.md`  
**Phase:** 05 — Unified Web + Patient Mobile Release, Cross-Platform Integration, and Complete-Scope Verification  
**Status:** ALL DEFECTS RESOLVED & VERIFIED  
**Date:** 2026-11-03  
**Auditor:** Quality Assurance Lead, Healthcare Security Engineer  

---

## 1. Regression Summary

During Phase 05 cross-platform integration and complete-scope verification, two defects were discovered and resolved using strict Test-Driven Development (TDD) protocols. Both defects are documented below with root cause, failing test evidence, resolution patch, and verification results.

---

## 2. Defect Index

### Defect 1: PH05-REG-001 — Edge Middleware Blocking Unauthenticated Mobile Login & CORS Preflights

* **Identifier:** `PH05-REG-001`
* **Severity:** Critical (P0 / Release Blocker)
* **Components Affected:**
  * `apps/web/src/middleware.ts`
  * `apps/web/src/app/api/v1/patient-portal/session/route.ts`
* **Symptom:**
  When a patient mobile client attempted initial login (`POST /api/v1/patient-portal/session`), Next.js Edge Middleware intercepted the request and returned HTTP 401 Unauthorized before reaching the route handler. Furthermore, browser-based mobile preview clients failed on CORS preflight (`OPTIONS /api/v1/patient-portal/*`).
* **Root Cause:**
  `apps/web/src/middleware.ts` applied strict session authentication to all `/api/v1/*` routes except those explicitly listed in `PUBLIC_API_PREFIXES`. The newly integrated mobile endpoint `/api/v1/patient-portal/session` was not included in `PUBLIC_API_PREFIXES`. Additionally, HTTP `OPTIONS` requests lacked an exemption before authentication checks.
* **TDD Protocol Applied:**
  1. **RED:** Authored failing unit tests in `apps/web/src/lib/middleware-security.test.ts`:
     * `"allows public patient portal session creation (POST /api/v1/patient-portal/session)"`
     * `"allows CORS preflight OPTIONS requests without token"`
  2. **IMPLEMENT:** Modified `apps/web/src/middleware.ts`:
     * Added `'/api/v1/patient-portal/session'` to `PUBLIC_API_PREFIXES`.
     * Added early `if (req.method === 'OPTIONS') return NextResponse.next();`.
  3. **GREEN:** Re-ran `pnpm --filter @oncobrief/web test -- src/lib/middleware-security.test.ts`. All 6/6 tests passed.
  4. **INTEGRATION VERIFY:** Re-ran `pnpm --filter @oncobrief/web test -- src/app/api/v1/patient-portal`. All 85 route tests passed.

---

### Defect 2: PH05-REG-002 — Inactive Tab DOM Collision in Mobile Standalone E2E Test

* **Identifier:** `PH05-REG-002`
* **Severity:** Medium (P2 / E2E Flake Prevention)
* **Components Affected:**
  * `apps/mobile/e2e/patient-app.spec.ts`
* **Symptom:**
  In `apps/mobile/e2e/patient-app.spec.ts`, `Scenario 4: Lab Verbatim Display & Zero Range Classification (REQ-MOB-005)` timed out after 60,000ms with:
  ```
  Error: locator.scrollIntoViewIfNeeded: Test timeout of 60000ms exceeded.
  Call log:
    - attempting scroll into view action
      2 × waiting for element to be stable
        - element is not visible
  ```
* **Root Cause:**
  React Native Web / Expo Router keeps inactive tab screens mounted in the DOM with `0x0` dimensions (`display: flex`, `width: 0`, `height: 0`). The Home tab rendered an earlier preview element: `"Earlier result: 12.1 g/dL · 2026-10-14"`.
  The Playwright locator `page.getByText('12.1 g/dL', { exact: false }).first()` resolved to this 0x0 inactive element in DOM order instead of the active card on `/labs`. Playwright waited for the inactive element to become visible, exceeding the 60s timeout.
* **TDD Protocol Applied:**
  1. **REPRODUCE & DIAGNOSE:** Evaluated all DOM nodes containing `'12.1'`. Identified the 0x0 inactive node from the Home screen preceding the active card.
  2. **REMEDIATION:** Updated the locator to target the active card button on the current screen:
     ```typescript
     const card121 = page.getByRole('button', { name: /Haemoglobin · 2026-10-14 · 12\.1 g\/dL/ });
     await card121.scrollIntoViewIfNeeded();
     await expect(card121).toBeVisible();
     await expect(card121.getByText('12.1', { exact: true })).toBeVisible();
     await expect(card121.getByText('12–15.5 g/dL', { exact: false })).toBeVisible();
     ```
  3. **GREEN:** Executed `pnpm --filter @oncobrief/mobile exec playwright test -g "Scenario 4"`. Passed in 3.0 seconds.
  4. **FULL SUITE VERIFICATION:** Executed `pnpm --filter @oncobrief/mobile test:e2e`. All 9/9 tests passed in 49.1s.

---

## 3. Residual Defect Summary

* **Open Critical Defects:** 0
* **Open Major Defects:** 0
* **Open Minor Defects:** 0
* **Regression Status:** **CLEAN (Zero Active Regressions)**
