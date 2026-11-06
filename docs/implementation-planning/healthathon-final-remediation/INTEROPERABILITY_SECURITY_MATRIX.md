# Interoperability Security, Threat Model & Controls Matrix

**Date:** 2026-11-03  
**Phase:** 07B — Healthcare Interoperability Security Hardening  
**Scope:** FHIR R4 Ingestion/Export, ABDM HIP/HIU Handshakes, Patient Portal APIs  
**Author:** Healthcare Security Auditor & Principal Architect  

---

## 1. Threat Modeling Overview

Healthcare interoperability surfaces are among the highest-risk interfaces in clinical software. They process untrusted external payloads, issue outbound requests to external medical systems, handle multi-tenant medical records, and exchange sensitive Protected Health Information (PHI).

OncoBrief employs a **Defense-in-Depth Security Model** with formal controls at the Network, Application, Database, and Cryptographic layers:

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                                 DEFENSE-IN-DEPTH LAYERS                                │
├─────────────────────────┬──────────────────────────────────────────────────────────────┤
│ 1. Network Boundary     │ SSRF protection, blocked loopback/RFC1918, mTLS / TLS 1.3    │
│ 2. API Gateway / Route  │ RBAC role check, session validation, request schema validation│
│ 3. Application Domain   │ Non-clinical boundary, closed vocab, strict patient linkage  │
│ 4. Consent Engine       │ Active consent check, revocation gate, expiration validation │
│ 5. Database Layer       │ PostgreSQL 16 RLS (FORCE), tenant isolation, audit hashing   │
│ 6. Cryptographic Layer  │ Fidelius Curve25519, HKDF-SHA256, AES-256-GCM, key zeroize   │
└─────────────────────────┴──────────────────────────────────────────────────────────────┘
```

---

## 2. Comprehensive Security Controls Matrix

| Threat / Risk Vector | Severity | Vulnerable Surface | Implemented Mitigation / Control | Verification Spec |
|---|---|---|---|---|
| **THREAT-01: Server-Side Request Forgery (SSRF)** | Critical | External FHIR Endpoints (`HttpFhirClientAdapter`) | Pre-flight DNS/IP host inspection blocks cloud metadata (`169.254.169.254`, Google/Azure metadata), loopback (`127.0.0.0/8`, `::1`), RFC 1918 subnets (`10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`), and link-local ranges. | `packages/adapters/test/fhir-client.test.ts` (4 specs) |
| **THREAT-02: Cross-Tenant Data Bleed** | Critical | FHIR Endpoints & Transactions (`fhir_endpoint_registry`, `fhir_resource_link`, `fhir_exchange_transaction`) | PostgreSQL 16 `ENABLE ROW LEVEL SECURITY` and `FORCE ROW LEVEL SECURITY`. Every table requires `org_id = NULLIF(current_setting('app.org_id', true), '')::uuid`. Empty or unset session setting returns 0 rows. | `packages/db/test/fhir-exchange.test.ts` & Playwright Scenario F |
| **THREAT-03: Cross-Patient Record Hijack** | Critical | Inbound FHIR Bundles (`FhirImporter`) | Inbound bundle entries are validated against `targetPatientId`. Resources containing mismatched `subject.reference` or UHIDs are quarantined with diagnostics (`patient_mismatch`) and discarded from the patient ledger. | `packages/domain/test/fhir-bidirectional.test.ts` |
| **THREAT-04: Unauthorized Data Exfiltration without Consent** | Critical | Outbound FHIR / ABDM Export (`exportPatientFhirBundle`) | Enforces consent gate before generating DocumentBundle. If consent is missing, DENIED, REVOKED, or expired, export aborts immediately with HTTP 400/403/404. | `packages/domain/test/fhir-bidirectional.test.ts` & Playwright Scenario D |
| **THREAT-05: Replay Attacks & Duplicate Fact Generation** | High | FHIR Inbound Ingestion & Webhooks | Client-supplied `idempotencyKey` and payload SHA-256 digests ensure repeated requests return the original transaction without creating duplicate documents or facts. | `packages/db/test/fhir-exchange.test.ts` & Playwright Scenario E |
| **THREAT-06: Lost Updates / Race Conditions on Remote FHIR Resources** | High | Outbound FHIR Updates (`HttpFhirClientAdapter`) | Mandatory `ETag` capture on read and `If-Match` optimistic concurrency control on resource updates. Server 412 Precondition Failed errors trigger reload. | `packages/adapters/test/fhir-client.test.ts` |
| **THREAT-07: In-Transit Decryption Key Compromise** | Critical | ABDM HIU Data Push Reception (`receiveHealthInfoPush`) | Ephemeral Curve25519 private keys and HKDF-derived AES-GCM keys are zeroized in memory and purged from temporary storage immediately upon payload decryption. | `packages/db/test/abdm-hiu.test.ts` |
| **THREAT-08: Tampered Encrypted Payloads** | High | ABDM Data Transfers | AES-256-GCM authenticated encryption verifies ciphertext integrity. Any modified byte, truncated payload, or invalid auth tag throws an authentication error and rejects transfer. | `apps/web/src/app/api/v1/patient-portal/security-negative.test.ts` (SEC-NEG-18) |
| **THREAT-09: Unauthenticated Callback Injection** | High | ABDM V3 Webhook Handlers (`/api/v3/[...abdmPath]`) | Uses `SECURITY DEFINER` function `abdm_resolve_callback_tenant` matching active outbound correlation tokens (`response_request_id`, `consent_request_id`) or registered HFR IDs. Unmatched callbacks fail closed with HTTP 400. | `apps/web/e2e/abdm-flow.spec.ts` & Playwright Scenario G |
| **THREAT-10: PHI Leakage into Security Audit Logs** | Medium | Audit Stream (`appendAuditEvent`) | The audit subsystem enforces a strict `REDACT_KEYS` policy. Patient names, document text, verbatim clinical quotes, and error details are hashed or stripped from `metadata_json`. | `packages/db/test/audit-redaction.test.ts` |
| **THREAT-11: Patient Portal Privilege Escalation** | High | Mobile / Web Patient Portal Routes (`/api/v1/patient-portal/*`) | Enforces patient session verification, rejecting clinical roles or unauthenticated requests with HTTP 401/403. Uses separate `withPatientPortalContext` transaction setting. | Playwright Scenario J |
| **THREAT-12: XSS in Exported Clinical Summaries** | High | Consultation Packet HTML/PDF Export | All patient-supplied preparation notes, caregiver notes, and clinical quotes undergo strict HTML entity encoding before rendering into HTML templates or printable summaries. | `apps/mobile/test/patient-offline.test.ts` (SEC-NEG-14) |

---

## 3. Cryptographic Specification & Key Hygiene

### 3.1 Ephemeral Curve25519 & Zeroization
- All ABDM Fidelius transfers generate high-entropy ephemeral key pairs using Node.js `crypto.randomBytes(32)` or BouncyCastle equivalents.
- **Key Zeroization Protocol:** Once the AES-GCM ciphertext is decrypted or generated, the private scalar buffer is overwritten with `0x00` bytes before garbage collection.
- Ephemeral private keys are **never written to persistent disk or PostgreSQL tables**.

### 3.2 Audit Log Hash Chaining
- Audit logs maintain cryptographic tamper evidence via recursive SHA-256 hash chaining:
  $$\text{Hash}_i = \text{SHA256}(\text{Hash}_{i-1} \parallel \text{Timestamp} \parallel \text{OrgId} \parallel \text{Action} \parallel \text{EntityId})$$
- Auditor role can verify the entire chain end-to-end to prove zero log deletion or tampering (`packages/db/test/milestone-a.test.ts`).

---

## 4. Security Audit Conclusion

The interoperability architecture of OncoBrief conforms to modern healthcare security standards (HIPAA, ABDM Security Guidelines, OWASP Top 10 API Security). All identified threat vectors are mitigated with verified automated regression tests.
