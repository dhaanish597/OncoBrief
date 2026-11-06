# Phase 07B Regression & Defect Register

**Date:** 2026-11-03  
**Phase:** 07B — Interoperability Engineering & Security Verification  
**Lead Engineer:** Healthcare QA Lead & Security Auditor  

---

## 1. Register Overview

This register tracks every defect, typecheck discrepancy, database constraint error, and test failure identified during Phase 07B execution, along with the precise root cause analysis, corrective action, and verification spec.

---

## 2. Defects & Regressions Log

### `PH07B-REG-001`: `tmpdir` Import Error in DB Test Harness
- **Severity:** Medium
- **Location:** `packages/db/test/fhir-exchange.test.ts`
- **Symptom:** `TypeError: tmpdir is not a function` during test suite startup.
- **Root Cause:** Imported `tmpdir` from `node:path` instead of `node:os`.
- **Resolution:** Updated import to `import { tmpdir } from 'node:os'`.
- **Status:** RESOLVED & VERIFIED (`packages/db/test/fhir-exchange.test.ts`).

### `PH07B-REG-002`: Column Name Mismatches in Interoperability SQL Queries
- **Severity:** High
- **Location:** `packages/db/src/services/fhir-exchange.ts`
- **Symptom:** PostgreSQL runtime errors: `column "organization_id" of relation "fhir_endpoint_registry" does not exist`, `column "status" does not exist`.
- **Root Cause:** Inbound query draft used legacy column names rather than the canonical columns defined in `0023_fhir_interoperability.sql` (`org_id`, `transaction_status`, `direction IN ('INBOUND_IMPORT', 'OUTBOUND_EXPORT')`).
- **Resolution:** Re-aligned all service SQL queries to exact schema definitions.
- **Status:** RESOLVED & VERIFIED (`packages/db/test/fhir-exchange.test.ts`).

### `PH07B-REG-003`: PostgreSQL UUID Cast Failure on Empty Session Context
- **Severity:** High
- **Location:** `packages/db/migrations/0023_fhir_interoperability.sql`
- **Symptom:** `invalid input syntax for type uuid: ""` when executing queries under an empty or uninitialized session.
- **Root Cause:** `current_setting('app.org_id', true)::uuid` throws when `current_setting` returns an empty string `""`.
- **Resolution:** Wrapped with `NULLIF`: `NULLIF(current_setting('app.org_id', true), '')::uuid`. Ensures null safety and clean fail-closed RLS filtering.
- **Status:** RESOLVED & VERIFIED (PostgreSQL RLS enforcement tests).

### `PH07B-REG-004`: `withTenant` Helper Signature Mismatch
- **Severity:** Medium
- **Location:** `packages/db/test/fhir-exchange.test.ts`
- **Symptom:** Tenant context was not applied, causing queries to fail closed.
- **Root Cause:** Caller passed `withTenant(f.org1, ...)` rather than structured context `{ orgId: f.org1, userId: f.clinicians.clinician, role: 'clinician' }`.
- **Resolution:** Updated test harness to supply typed `TenantContext` object.
- **Status:** RESOLVED & VERIFIED (`packages/db/test/fhir-exchange.test.ts`).

### `PH07B-REG-005`: Missing FHIR Audit Action Enumerations
- **Severity:** Medium
- **Location:** `packages/db/src/services/audit.ts`
- **Symptom:** TypeScript compiler error `TS2322: Type 'fhir_endpoint.registered' is not assignable to type AuditAction`.
- **Root Cause:** New interoperability audit actions were not yet added to the closed `AUDIT_ACTIONS` array in `audit.ts`.
- **Resolution:** Added `'fhir_endpoint.registered'`, `'fhir_endpoint.deactivated'`, `'fhir_exchange.inbound_import'`, `'fhir_exchange.outbound_export'` to `AUDIT_ACTIONS`.
- **Status:** RESOLVED & VERIFIED (Clean monorepo typecheck).

### `PH07B-REG-006`: Domain Fact Type Vocabulary Discrepancies
- **Severity:** High
- **Location:** `packages/domain/test/fhir-bidirectional.test.ts`
- **Symptom:** `TS2367: This comparison appears to be unintentional because the types ... and 'histopathology' have no overlap`.
- **Root Cause:** Test expectations used colloquial medical categories (`'laboratory_test'`, `'histopathology'`, `'procedure'`) rather than the closed architectural domain vocabulary defined in `fact-types.ts`.
- **Resolution:** Aligned all importers, exporters, and tests to the canonical types: `'lab_result.as_written'`, `'diagnosis_text.as_written'`, `'procedure.recorded'`, `'medication.recorded'`, `'appointment.recorded'`.
- **Status:** RESOLVED & VERIFIED (`packages/domain/test/fhir-bidirectional.test.ts`).

### `PH07B-REG-007`: Strict Mode Locator Ambiguity in E2E Scenario A
- **Severity:** Medium
- **Location:** `apps/web/e2e/fhir-abdm-interop.spec.ts`
- **Symptom:** Playwright error: `strict mode violation: locator('a[href*="/sources/..."]') resolved to 2 elements`.
- **Root Cause:** The Sources page renders both a primary document link and a sub-report badge link sharing the same base document URL.
- **Resolution:** Targeted the primary link using `.first()`.
- **Status:** RESOLVED & VERIFIED (`apps/web/e2e/fhir-abdm-interop.spec.ts:10`).

### `PH07B-REG-008`: ABDM Webhook Discovery Tenant Resolution Rejection
- **Severity:** High
- **Location:** `apps/web/e2e/fhir-abdm-interop.spec.ts`
- **Symptom:** Scenario G received HTTP 400 (`Unresolvable tenant context for callback`) instead of HTTP 202.
- **Root Cause:** Request header passed `x-hip-id: 'RCI-ONCOLOGY-01'`, but the seeded demo organization in PostgreSQL has `abdm_hip_id: 'IN010000001'`. The security definer function correctly refused to route the unresolvable tenant.
- **Resolution:** Corrected `x-hip-id` header to `'IN010000001'`.
- **Status:** RESOLVED & VERIFIED (Returns 202 Accepted in 11ms).
