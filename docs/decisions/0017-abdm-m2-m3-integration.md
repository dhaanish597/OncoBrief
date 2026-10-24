# 0017 — ABDM V3 Integration (M2 HIP + M3 HIU)

**Status:** Accepted  
**Date:** 2026-10-23  

## Context

OncoBrief is an evidence-first oncology record-readiness and care-continuity platform. Health data exchange across Indian oncology networks requires integration with the Ayushman Bharat Digital Mission (ABDM) Health Information Exchange and Consent Manager (HIE-CM) V3 APIs and the National Resource Centre for EHR Standards (NRCeS) FHIR R4 v6.5.0 Implementation Guide.

National Health Authority (NHA) milestone guidelines mandate completion of at least two milestones to exit the ABDM Sandbox and obtain production credentials. The selected scope encompasses:
1. **Milestone 2 (HIP - Health Information Provider):** Share only clinician-approved, frozen consultation packets under valid patient consent.
2. **Milestone 3 (HIU - Health Information User):** Request patient consent, fetch consent artifacts, receive encrypted FHIR bundles pushed by external facilities, decrypt via Fidelius ECDH, and ingest into OncoBrief's Evidence Ledger.

OncoBrief has non-negotiable core invariants defined in `CLAUDE.md`, `AGENTS.md`, and ADRs 0001–0016:
- The Evidence Ledger is the sole source of truth; timelines and digital twins are views over the ledger.
- Every displayed fact requires verifiable source provenance (document, page, character/coordinate span, extractor version).
- All imported facts must enter in `extracted` state and never be marked `verified` automatically.
- Verified facts cannot be silently overwritten by incoming records; disagreements must route through deterministic conflict detection (`conflict_set`) for human resolution.
- Never invent medical facts, infer medical requirements, or cross clinical boundaries (no automated diagnosis, triage, staging, or treatment recommendations).
- Postgres Row-Level Security (FORCE RLS) must strictly prevent cross-tenant data leakage.
- Health data must be cryptographically protected; no plaintext fallbacks.

## Decision

Implement the ABDM V3 integration across both HIP and HIU roles using an in-tree modular architecture with dual-driver execution:

### 1. Dual-Driver Architecture (`ABDM_DRIVER=simulated | sandbox`)
- When `ABDM_DRIVER=simulated`: The system runs offline without external internet, ABDM credentials, or NHA infrastructure. It exercises the exact same database tables, state machines, encryption math, webhook handlers, and NRCeS FHIR mappers using deterministic loopback event dispatch.
- When `ABDM_DRIVER=sandbox`: Connects to `https://dev.abdm.gov.in/api/hiecm` with single-flight session token caching, RFC 4122 UUID request IDs, UTC timestamps, and strict separation between `X-HIP-ID` and `X-HIU-ID` headers.

### 2. Cryptographic Security Gate (Fidelius Curve25519 Short Weierstrass)
ABDM mandates Fidelius encryption based on BouncyCastle's `Curve25519.java` in short Weierstrass form ($y^2 \equiv x^3 + ax + b \pmod p$). Node.js native Montgomery `X25519` is incompatible and fails with `ABDM-9999`.
We implement a zero-dependency, pure-TypeScript modular arithmetic engine using native JavaScript `BigInt` for Curve25519 Weierstrass point multiplication combined with `node:crypto` `hkdfSync` and `aes-256-gcm`. Ephemeral keys are generated per transfer/page, encrypted at rest using the server session secret, and destroyed immediately upon transfer completion or consent revocation/expiry.

### 3. Database Schema & RLS Tenant Isolation (`0009_abdm_integration.sql`)
Seven durable tables enforce `FORCE ROW LEVEL SECURITY` with `org_id = current_setting('app.org_id', true)::uuid`:
- `abdm_inbox`: Durable webhook inbox ensuring `< 500ms` `202 Accepted` responses and idempotent processing.
- `abdm_transaction`: Outbound request correlation and state tracking.
- `abdm_patient_link`: ABHA identifiers (`abha_number`, `abha_address`), demographic attributes, and protected 6-month link tokens.
- `abdm_care_context`: Links approved consultation packets (`status='approved'` only) to ABDM care contexts.
- `abdm_consent_request`: HIU consent request lifecycle (`INITIATED -> REQUESTED -> GRANTED | DENIED | REVOKED | EXPIRED`).
- `abdm_consent_artifact`: Persists full consent permissions, date ranges, and `data_erase_at` policies.
- `abdm_hi_transfer`: Transfer coordination, status tracking, and ephemeral key material storage.

Inbound ABDM callbacks arrive without session cookies. A narrowly-scoped `SECURITY DEFINER` function `abdm_resolve_callback_tenant` (owned by `oncobrief_migrator` with locked `search_path = public`) resolves the tenant context `(org_id, patient_id)` from trusted transaction records or facility IDs before executing business logic under `withTenant`.

### 4. NRCeS FHIR R4 v6.5.0 & mCODE Standards Alignment
- Export: Updates `abdm-bundle-mapper.ts` to emit dual `Patient.identifier` (`healthid.abdm.gov.in` and `healthid.ndhm.gov.in`), practitioner HPR identifier, configured facility HFR ID, and profile-aware closed section slicing. Wires `?format=abdm` and `?format=mcode` into `/api/v1/packets/[packetId]/export`.
- Ingestion: Upgrades `local-multimodal-ocr.ts` to parse all bundle entries without truncation, extracting Observations, Conditions, Procedures, MedicationStatements, DiagnosticReports, Compositions, and attachments into the Evidence Ledger with `state='extracted'`.
- Serial Labs: Updates conflict detection so serial lab results on different observation dates represent chronological points rather than conflicting contradictions.

### 5. Consent Enforcement & Purge Lifecycle
Upon receipt of a `REVOKED` or `EXPIRED` consent notification, or upon execution of the `data_erase_at` sweep, all unverified raw ABDM bundles and ephemeral keys are deleted, and an immutable audit event (`abdm.consent_purged`) is appended to the ledger.

## Alternatives Considered

1. **External Java Fidelius Microservice:** Running the official Java `fidelius-cli` as a sidecar container. Rejected to avoid JVM startup overhead, native container complexity, and external process failure modes; our verified TypeScript `BigInt` implementation passes the identical official test vectors natively.
2. **Standard Node.js `crypto.generateKeyPairSync('x25519')`:** Rejected because Montgomery curve representations are rejected by ABDM with `ABDM-9999`.
3. **Allowing Auto-Verification of Inbound ABDM Records:** Rejected because it violates the human-in-the-loop and Evidence Ledger non-negotiable invariants (`CLAUDE.md`).
4. **Direct EHR Write-back:** Rejected; OncoBrief is an assistive record-readiness and consult-prep platform, not an EHR write-back agent.

## Consequences

- Full offline demo capability with zero external network dependencies via `SimulatedAbdmGatewayAdapter`.
- Complete architectural readiness to switch to NHA Sandbox by configuring environment variables.
- Preservation of all RLS tenant isolation guarantees and auditability.
- No impact on existing non-ABDM workflows (document upload, OCR, packet approval).
