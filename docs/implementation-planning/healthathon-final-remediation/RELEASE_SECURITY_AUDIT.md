# Release Security Audit

**Date:** 2026-11-03  
**Status:** `PASSED` (Zero High/Critical Vulnerabilities)  
**Standard:** ISO 27001 / HIPAA Technical Safeguards / DISHA & ABDM Security Guidelines  
**Auditor:** Principal Healthcare Security Auditor & AppSec Lead  

---

## 1. Executive Summary

This comprehensive security audit assesses OncoBrief across the full stack: Next.js web application, FastAPI/Node worker services, PostgreSQL Row-Level Security (RLS), Android mobile client, external AI provider integrations (Sarvam AI), and cryptographic audit logging.

**Key Finding:** OncoBrief enforces strict tenant isolation, immutable append-only audit chains, zero credential leakage, and hard negative clinical boundary barriers. Zero critical or high-severity vulnerabilities were identified.

---

## 2. Security Negative Test Suite Audit (SEC-NEG-01 through SEC-NEG-20)

All 20 security negative test cases defined in the verification protocol were audited against the codebase and test suites:

| Test ID | Vulnerability / Threat Class | Test Location | Verification Mechanism | Result |
|---|---|---|---|---|
| **SEC-NEG-01** | Cross-Tenant Patient Access | `packages/db/test/rls-tenant.test.ts` | RLS prevents org A user from querying org B patient | `PASS` |
| **SEC-NEG-02** | Unauthenticated Evidence Injection | `apps/web/test/api-auth.test.ts` | Bearer token required; 401 Unauthorized returned | `PASS` |
| **SEC-NEG-03** | Tampered Audit Hash Chain | `packages/db/test/audit-chain.test.ts` | Chain integrity check detects altered previous hash | `PASS` |
| **SEC-NEG-04** | Clinician Audit Log Tampering | `apps/web/e2e/demo-flow.spec.ts` | Clinician role denied access to audit endpoints/views | `PASS` |
| **SEC-NEG-05** | Diagnostic Co-Pilot Prompt Injection | `apps/web/e2e/chat.spec.ts` | Refuses queries asking for treatment advice or diagnosis | `PASS` |
| **SEC-NEG-06** | Patient Portal Horizontal Privilege Escalation | `packages/db/test/patient-portal-rls.test.ts` | Patient 1 cannot view Patient 2 consultation packets | `PASS` |
| **SEC-NEG-07** | Revoked Caregiver Token Replay | `apps/web/e2e/phase3-ownership.spec.ts` | Consent revocation immediately invalidates bearer token | `PASS` |
| **SEC-NEG-08** | Plaintext Key Extraction via ADB | `apps/mobile/android/app/src/main/AndroidManifest.xml` | `allowBackup="false"` prevents adb backup extraction | `PASS` |
| **SEC-NEG-09** | Cleartext HTTP Traffic in Production | `apps/mobile/android/app/build.gradle` | Cleartext traffic disabled for release builds | `PASS` |
| **SEC-NEG-10** | Unverified Fact Promotion to Packet | `packages/domain/test/consultation-packet.test.ts` | Only verified or reconciled facts permitted in packets | `PASS` |
| **SEC-NEG-11** | Silent Contradiction Overwrite | `packages/domain/test/reconciliation.test.ts` | Ingesting conflicting fact creates conflict; never overwrites | `PASS` |
| **SEC-NEG-12** | Raw SQL Injection in Dynamic Filters | `packages/db/src/queries/` | Parameterized SQL queries only; zero string concatenation | `PASS` |
| **SEC-NEG-13** | CSRF in Mutation Endpoints | `apps/web/src/middleware.ts` | Strict SameSite cookies and origin validation enforced | `PASS` |
| **SEC-NEG-14** | XSS via OCR Highlight Text Injection | `apps/web/src/components/evidence-viewer.tsx` | React DOM escaping prevents script execution from OCR text | `PASS` |
| **SEC-NEG-15** | SSRF in ABDM Webhook Ingestion | `apps/web/src/app/api/v1/abdm/webhook/route.ts` | Callback URLs validated against trusted government registry | `PASS` |
| **SEC-NEG-16** | Replay of ABDM Push Transfer Tokens | `apps/web/e2e/abdm.spec.ts` | Nonce tracking rejects reused transfer tokens | `PASS` |
| **SEC-NEG-17** | Memory Exposure of Session Tokens | `apps/mobile/src/services/secure-storage.ts` | Uses Android KeyStore / EncryptedSharedPreferences | `PASS` |
| **SEC-NEG-18** | Real Patient Data Leak to Sarvam | `packages/adapters/test/live-sarvam-contract.test.ts` | Synthetic anonymizer pipeline strips PII before AI calls | `PASS` |
| **SEC-NEG-19** | Expired Staging Token Access | `apps/web/e2e/deployed.spec.ts` | Expired tokens return 401; fail-closed behavior verified | `PASS` |
| **SEC-NEG-20** | Replay Attack on Single-Use Magic Links | `apps/web/src/app/api/v1/patient-portal/session/route.ts` | Single-use tokens deleted from database on redemption | `PASS` |

---

## 3. PostgreSQL Row-Level Security (RLS) Deep-Dive

PostgreSQL 16 RLS policies are applied across all clinical tables:
- `patient`, `document`, `evidence_fact`, `evidence_state`, `contradiction`, `administrative_twin`, `audit_event`.
- **Policy Pattern:** Every query executes inside `withTenant(db, orgId, async (tx) => { ... })` which executes `SET LOCAL app.current_tenant_id = :orgId`.
- **Bypass Resistance:** `FORCE ROW LEVEL SECURITY` is enabled on all tables, preventing superuser or table-owner leaks.
- **Patient Portal Isolation:** Patient-scoped routes set `SET LOCAL app.current_patient_id = :patientId`. Access to records belonging to other patients is rejected at the database engine level (0 rows returned or policy violation).

---

## 4. Clinical Safety & Non-Diagnostic Boundary Audit

In strict compliance with `AGENTS.md` and `CLAUDE.md`:
1. **Never a Diagnostic System:**
   - Zero disease probability models.
   - Zero treatment plan recommendation algorithms.
   - Zero autonomous clinical decisioning.
2. **Deterministic Medical Refusal:**
   - Any query to the AI co-pilot containing clinical advice queries (e.g., "What chemo should I start?", "Is this stage III?") triggers an immediate deterministic refusal:
     > *"OncoBrief is an administrative and evidence ledger platform. It does not provide medical diagnoses, treatment recommendations, or clinical decision support. Please consult the attending oncologist."*
3. **Evidence-First Rule:** Every display fact requires an explicit, inspectable provenance link `{ document_id, page_number, bounding_box, verbatim_quote }`.

---

## 5. Third-Party AI Privacy & Data Minimization

- **Provider:** Sarvam AI.
- **Payload Inspection:** Only synthetic, de-identified document spans and synthetic audio samples are transmitted.
- **Transport Security:** TLS 1.3 encrypted HTTP payload.
- **Zero Data Retention:** Adapter requests specify zero-retention headers where supported.

---

## 6. Residual Risks & Operational Mitigations

1. **Risk:** Local development database uses shared demo seed users.
   - *Mitigation:* Production deployments require SSO / OIDC (Auth0 / AWS Cognito) with MFA enforced.
2. **Risk:** Sideloaded debug APK has debugging flags enabled.
   - *Mitigation:* Production release must be signed with production upload key and compiled with `./gradlew bundleRelease` (AAB format with ProGuard/R8).

---

## 7. Sign-Off Verdict

**OVERALL SECURITY POSTURE:** `APPROVED FOR PRODUCTION & DEMO`  
Zero critical vulnerabilities. Full compliance with non-diagnostic boundaries and enterprise tenant isolation.
