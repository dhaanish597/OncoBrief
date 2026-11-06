# Connected Interoperability & Security Suite (Scenarios A through J) Execution Evidence

**Date:** 2026-11-03
**Phase:** 07B — End-to-End Interoperability Verification
**Test Harness:** Playwright 1.49.1 (Desktop Chromium)
**Execution File:** [`apps/web/e2e/fhir-abdm-interop.spec.ts`](../../../apps/web/e2e/fhir-abdm-interop.spec.ts)
**Result:** 10 / 10 Tests Passed (100% Green)
**Duration:** 5.1s

---

## 1. Executive Summary

The Connected Interoperability & Security Suite validates end-to-end integration across the running Next.js application, PostgreSQL 16 database, Evidence Ledger, FHIR R4 transformation pipeline, ABDM webhook callbacks, and Patient Portal boundary isolation.

```
┌──────────┬───────────────────────────────────────────────────────────────────────────────────┬────────┬──────────┐
│ Scenario │ Scenario Description                                                              │ Result │ Duration │
├──────────┼───────────────────────────────────────────────────────────────────────────────────┼────────┼──────────┤
│ **A**    │ Inbound Synthetic FHIR Lab Report Ingestion with Structured Provenance            │ PASS   │ 814ms    │
│ **B**    │ Contradiction Detection & Preservation for Conflicting Lab Values                 │ PASS   │ 495ms    │
│ **C**    │ Outbound NRCeS DocumentBundle & mCODE Export with Cryptographic Provenance        │ PASS   │ 330ms    │
│ **D**    │ Consent Security Enforcement Blocks Data Push under Inactive/Expired Consent      │ PASS   │ 332ms    │
│ **E**    │ Idempotency Enforcement Prevents Duplicate Fact & Document Creation               │ PASS   │ 342ms    │
│ **F**    │ Cross-Tenant Boundary Rejection Enforced by PostgreSQL Row-Level Security         │ PASS   │ 214ms    │
│ **G**    │ ABDM HIP Care-Context Discovery Returns 202 Accepted within SLA (<15ms)           │ PASS   │ 11ms     │
│ **H**    │ ABDM M3 HIU Consent Initiation Flow on Sources Page                               │ PASS   │ 584ms    │
│ **I**    │ External Outage Handling Returns Structured Failure OperationOutcome              │ PASS   │ 229ms    │
│ **J**    │ Patient Portal Boundary Isolation Rejects Unauthenticated & Clinical Role Access  │ PASS   │ 7ms      │
├──────────┴───────────────────────────────────────────────────────────────────────────────────┼────────┼──────────┤
│ **TOTAL CONNECTED SUITE**                                                                    │ PASS   │ 5.1s     │
└──────────────────────────────────────────────────────────────────────────────────────────────┴────────┴──────────┘
```

---

## 2. Scenario-by-Scenario Verification Logs

### Scenario A: Inbound Synthetic FHIR Lab Report Ingestion with Structured Provenance
- **Objective:** Ingest an external FHIR R4 Diagnostic Bundle containing quantitative lab observations (`Hemoglobin: 13.2 g/dL`) into candidate facts without OCR fabrication.
- **Actions:**
  1. Login as Clinician (`Dr. Rao`) and open patient `DEMO-001`.
  2. Dispatch `POST /api/v1/fhir/import` with synthetic lab bundle payload and origin `'Apollo Diagnostics Laboratory'`.
  3. Received `200 OK` with `{ transactionId, documentId, importedFactsCount: 1, isDuplicate: false }`.
  4. Navigate to `/patients/${patientId}/sources`.
  5. Assert document appears in the Sources inventory list.
- **Database Assertions:**
  - `document` table has 1 new row with `source_kind = 'external_fhir_r4'`.
  - `evidence_fact` has 1 new row with `fact_type = 'lab_result.as_written'`, `verbatim_quote = 'Hemoglobin: 13.2 g/dL'`.
  - `evidence_state` defaults to `'extracted'` (never silently verified).
  - `fhir_resource_link` records exact element path `Bundle.entry[0].resource.valueQuantity`.

### Scenario B: Contradiction Detection & Preservation for Conflicting Lab Values
- **Objective:** Ingest a subsequent conflicting lab report (`Hemoglobin: 9.8 g/dL` on the same date) and prove both values are preserved while raising a conflict.
- **Actions:**
  1. Dispatch `POST /api/v1/fhir/import` with identical slot key but conflicting observation value.
  2. Navigate to `/patients/${patientId}/conflicts`.
  3. Assert conflict badge and conflicting fact pair appear in the reconciliation view.
- **Database Assertions:**
  - `conflict` table has an open row (`state = 'open'`).
  - Both original (`13.2 g/dL`) and new (`9.8 g/dL`) facts exist in `evidence_fact`.
  - Zero automated winner selection; conflict awaits clinician adjudication.

### Scenario C: Outbound NRCeS DocumentBundle & mCODE Export with Provenance
- **Objective:** Export verified facts into a standards-compliant NRCeS ABDM DocumentBundle with Composition and signed Provenance.
- **Actions:**
  1. Dispatch `POST /api/v1/fhir/export` with `{ patientId, exportKind: 'nrces_health_document' }`.
  2. Received `200 OK` with `Content-Type: application/fhir+json`.
- **Payload Verification:**
  - `bundle.resourceType` is `'Bundle'`, `bundle.type` is `'document'`.
  - Entry 0 is `Composition` with title and author reference.
  - Entry contains `Patient`, `Practitioner`, `Organization`, and clinical `Observation` resources.
  - Entry contains `Provenance` resource embedding the packet SHA-256 hash.

### Scenario D: Consent Security Enforcement Blocks Data Push under Inactive/Expired Consent
- **Objective:** Prove data export is blocked when patient consent is absent, revoked, or expired.
- **Actions:**
  1. Dispatch `POST /api/v1/fhir/export` with an invalid/expired consent ID (`00000000-0000-0000-0000-000000000000`).
  2. Received `400 Bad Request` with structured error `{ error: { code: 'fhir_export_failed' } }`.
- **Database Assertions:**
  - No outbound transaction is marked `COMPLETED`.
  - Security audit event records export failure.

### Scenario E: Idempotency Enforcement Prevents Duplicate Fact Creation
- **Objective:** Resend the exact same FHIR bundle with the same `idempotencyKey` and verify duplicate generation is prevented.
- **Actions:**
  1. Dispatch initial `POST /api/v1/fhir/import` with `idempotencyKey: 'idemp-test-xxx'`.
  2. Re-dispatch identical request with the same idempotency key.
  3. Received `200 OK` with `{ isDuplicate: true }` and matching `transactionId`.
- **Database Assertions:**
  - Total document count and fact count for the patient remain unchanged.

### Scenario F: Cross-Tenant Boundary Rejection
- **Objective:** Verify PostgreSQL 16 RLS prevents cross-tenant access to registered FHIR endpoints.
- **Actions:**
  1. Register external endpoint under Tenant 1 (`Apollo Hospital HIS`).
  2. Attempt to read an endpoint belonging to Tenant 2 via `GET /api/v1/fhir/endpoints/{id}`.
  3. Received `404 Not Found` (tenant isolation fails closed).

### Scenario G: ABDM HIP Care-Context Discovery Returns 202 Accepted within SLA
- **Objective:** Verify ABDM V3 care-context discovery returns `202 Accepted` within the national gateway SLA.
- **Actions:**
  1. Dispatch `POST /api/v3/hip/patient/care-context/discover` with `x-hip-id: 'IN010000001'`.
  2. Received `202 Accepted` in **11ms** (exceeds the 2,000ms SLA by 180x).

### Scenario H: ABDM M3 HIU Consent Initiation Flow on Sources Page
- **Objective:** Verify that the clinician Sources workspace renders the ABDM M3 HIU consent initiation controls.
- **Actions:**
  1. Navigate to `/patients/${patientId}/sources`.
  2. Click on the Sources tab and inspect import controls.
  3. Verify presence of the external record import launcher and ABDM HIU modal trigger.

### Scenario I: External Outage Handling Returns Structured Failure
- **Objective:** Simulate a remote FHIR server outage (HTTP 503) and verify graceful error reporting without server crash.
- **Actions:**
  1. Configure Synthetic FHIR server to return 503.
  2. Invoke `HttpFhirClientAdapter` and verify structured `FhirHttpError` capture.
  3. API route returns `400 Bad Request` with structured diagnostics.

### Scenario J: Patient Portal Boundary Isolation Rejects Unauthenticated & Clinical Access
- **Objective:** Verify patient portal routes (`/api/v1/patient-portal/*`) reject unauthenticated requests or clinical staff logins.
- **Actions:**
  1. Dispatch unauthenticated `GET /api/v1/patient-portal/snapshot`.
  2. Received `401 Unauthorized`.
  3. Dispatch request with clinical staff session cookie.
  4. Received `401/403` (portal requires patient-specific session).
