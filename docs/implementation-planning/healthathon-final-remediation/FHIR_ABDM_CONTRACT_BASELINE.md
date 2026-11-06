# FHIR R4 & ABDM HIP/HIU Standards & Contract Baseline

**Date:** 2026-11-03  
**Status:** `ACTIVE_STANDARDS_BASELINE`  
**Standard Versions:** HL7 FHIR Release 4 (v4.0.1) / NRCeS ABDM Implementation Guide v6.5.0 / HL7 mCODE STU4  
**Auditor / Architect:** Principal Healthcare Interoperability Architect & ABDM Integration Engineer  

---

## 1. Executive Standards Summary

This specification establishes the authoritative interoperability baseline for OncoBrief. All external electronic medical record (EMR/HIS) exchanges and Ayushman Bharat Digital Mission (ABDM) transactions must strictly adhere to the standards, profiles, and cryptographic protocols codified herein.

```
┌───────────────────────────────┬───────────────────────────────────┬──────────────────────────────────────────────┐
│ Standard / Specification       │ Authoritative Version / Package   │ Canonical Reference URL                      │
├───────────────────────────────┼───────────────────────────────────┼──────────────────────────────────────────────┤
│ HL7 FHIR Core Specification   │ Release 4 (v4.0.1)                │ https://hl7.org/fhir/R4/                     │
│ NRCeS ABDM Health Data Guide  │ Release 6.5.0 (FHIR R4)           │ https://nrces.in/ndhm/fhir/r4/               │
│ HL7 mCODE Oncology Standard   │ STU 4.0.0 (Oncology Profiles)     │ http://hl7.org/fhir/us/mcode/                │
│ ABDM Gateway Protocol         │ HIE-CM V3 Gateway API             │ https://sandbox.abdm.gov.in/                 │
│ ABDM Data Encryption Standard │ Fidelius Short Weierstrass ECDH   │ NHA HIE-CM / mgrmtech fidelius-cli           │
└───────────────────────────────┴───────────────────────────────────┴──────────────────────────────────────────────┘
```

> [!IMPORTANT]
> A preview version 7.0.0 of ABDM is currently in draft. Per architectural safety guidelines, OncoBrief **strictly targets the released production baseline v6.5.0**, avoiding undocumented or unfinalized preview schema changes.

---

## 2. FHIR R4 Core Resource Profiles & Semantics

OncoBrief implements bidirectional exchange for the core oncology clinical resources:

| Resource Type | Supported Profile | Inbound Mapping (FHIR → OncoBrief) | Outbound Mapping (OncoBrief → FHIR) |
|---|---|---|---|
| **Patient** | `https://nrces.in/ndhm/fhir/r4/StructureDefinition/Patient` | Ingests ABHA ID, UHID, demographics, care contexts | Serializes patient demographics & verified identifiers |
| **Encounter** | `https://nrces.in/ndhm/fhir/r4/StructureDefinition/OPConsultRecord` | Maps OPD clinic consultations, dates, attending oncologist | Exports structured encounter notes & clinic attendance |
| **Observation** | `https://nrces.in/ndhm/fhir/r4/StructureDefinition/Observation` | Extracts quantitative labs (Hemoglobin, Platelets, CA-15-3) | Exports clinician-verified analyte measurements |
| **DiagnosticReport** | `https://nrces.in/ndhm/fhir/r4/StructureDefinition/DiagnosticReportRecord`| Links pathology, biopsy, IHC, & radiology findings | Exports signed consultation packets & pathology summaries |
| **DocumentReference** | `http://hl7.org/fhir/StructureDefinition/DocumentReference` | Ingests PDF/DICOM pointers, issuing facility, date | References signed consultation packets & hash stamps |
| **Condition** | `https://nrces.in/ndhm/fhir/r4/StructureDefinition/Condition` | Extracts confirmed tumor stage, histopathology diagnoses | Exports clinician-reconciled oncology diagnoses |
| **Procedure** | `http://hl7.org/fhir/StructureDefinition/Procedure` | Extracts prior surgeries (mastectomy, lumpectomy, biopsy) | Exports recorded surgical & radiation completion events |
| **MedicationStatement**| `http://hl7.org/fhir/StructureDefinition/MedicationStatement` | Ingests chemotherapy cycles, targeted therapies | Exports approved systemic therapy regimens |
| **Practitioner** | `https://nrces.in/ndhm/fhir/r4/StructureDefinition/Practitioner` | Preserves ordering oncologist, HPR ID, registration | Attaches verified attending oncologist metadata |
| **Organization** | `https://nrces.in/ndhm/fhir/r4/StructureDefinition/Organization` | Preserves originating hospital, HFR facility ID | Attaches issuing facility (e.g. Tata Memorial, AIIMS, RCI)|

### Strict Provenance Rules for Structured FHIR:
- If an incoming FHIR resource has an embedded narrative or PDF attachment, exact OCR character spans and bounding boxes are preserved.
- If an incoming FHIR resource is purely structured JSON (no image/PDF canvas), OncoBrief **never fabricates an artificial OCR quotation or fake bounding box**.
- Purely structured resources utilize the **Structured-Resource Provenance Pathway**:
  - `provenance_kind: 'fhir_element'`
  - `source_element_path: 'Bundle.entry[3].resource.valueQuantity'`
  - `immutable_source_json: { ... }`
  - Verifiable cryptographic SHA-256 of the source resource.

---

## 3. ABDM Gateway API V3 Architecture

The ABDM architecture segregates into two distinct operational roles:
1. **Health Information Provider (HIP - M2):** Shares authorized patient medical records upon receiving a validated consent notification from the gateway.
2. **Health Information User (HIU - M3):** Requests, retrieves, and decrypts outside health records on behalf of an attending clinician under explicit patient consent.

### 3.1 Gateway Endpoints Matrix
| Environment | Gateway Base URL | CM ID | Session / Auth URL |
|---|---|---|---|
| **Simulated (Local)** | Loopback in-process (`/api/v3/...`) | `simulated-cm` | In-memory token generator |
| **ABDM Sandbox** | `https://dev.abdm.gov.in/gateway` | `sbx` | `https://dev.abdm.gov.in/gateway/v0.5/sessions` |
| **ABDM Production** | `https://gateway.abdm.gov.in` | `prod` | `https://gateway.abdm.gov.in/v0.5/sessions` |

### 3.2 Authentication & Session Token Lifecycle
- **Credentials:** `CLIENT_ID`, `CLIENT_SECRET` (issued by National Health Authority).
- **Exchange:** `POST /sessions` with `grantType: "client_credentials"`.
- **Token Validity:** Returns JWT bearer token valid for 900 seconds.
- **Refresh Policy:** Automatic background refresh at `expiresIn - 60s` (T+840s). Failed requests trigger immediate token cache invalidation and single-flight bounded retry.
- **Secret Redaction:** Plaintext client secrets must **never** be logged or stored in client-accessible browser bundles.

---

## 4. Cryptographic Specifications (ABDM Fidelius)

ABDM mandates end-to-end data transfer encryption between HIP and HIU using Diffie-Hellman Key Exchange over BouncyCastle's short Weierstrass Curve25519, HKDF-SHA256, and AES-256-GCM.

### 4.1 Curve Parameters (Short Weierstrass Form)
- Equation: $y^2 = x^3 + ax + b \pmod{p}$
- $p = 2^{255} - 19 = \text{0x7fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffed}$
- $a = \text{0x2AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA984914A144}$
- $b = \text{0x7B425ED097B425ED097B425ED097B425ED097B425ED097B4260B5E9C7710C864}$
- Base Point $G$: $(G_x, G_y)$ on Curve25519
- Order $n$: $\text{0x1000000000000000000000000000000014def9dea2f79cd65812631a5cf5d3ed}$

### 4.2 Key Derivation & Encryption Protocol
1. **Ephemeral Key Generation:** Each transfer generates a cryptographically random ephemeral private scalar $d \in [1, n-1]$ and computes public point $Q = d \times G$.
2. **Shared Secret:** Compute point $P = d_{\text{local}} \times Q_{\text{peer}}$. Shared secret $Z = P_x$.
3. **Key Derivation (HKDF-SHA256):**
   - Salt: XOR of ephemeral nonces: $\text{Salt} = \text{Nonce}_{\text{local}} \oplus \text{Nonce}_{\text{peer}}$
   - PRK = HMAC-SHA256(Salt, $Z$)
   - Derived Key (32 bytes) = HKDF-Expand(PRK, "ABDM-HIE-CM-ECDH-AES-GCM", 32)
4. **Authenticated Symmetric Encryption:**
   - Algorithm: AES-256-GCM
   - IV: First 12 bytes of derived key material / nonce derivation.
   - Tag: 16-byte GCM authentication tag appended to ciphertext.
5. **Zero-Retention Ephemeral Wipe:** Ephemeral private keys are wiped from memory immediately after encryption/decryption completes.

---

## 5. Consent Lifecycle & Negative Boundary Rules

Under DISHA and ABDM consent architecture, health information cannot be requested, transferred, or decrypted without a cryptographically signed, unexpired consent artifact.

| State | Allowed HIP Action | Allowed HIU Action | Evidence Ledger Impact |
|---|---|---|---|
| **INITIATED** | Reject transfer | Wait for patient approval | Zero records shared |
| **GRANTED** | Prepare encrypted push | Request health information | Ingests unverified records |
| **DENIED** | Block transfer | Display honest refusal | Zero records shared |
| **EXPIRED** | Reject transfer (403) | Block further requests | Data purged if past `dataEraseAt` |
| **REVOKED** | Terminate active transfers | Retain existing ledger facts | Mark source `access_withdrawn` |

### Absolute Invariant:
> **Consent Revocation Never Destroys Historical Ledger Audit Trail.**  
> When a patient revokes ABDM consent, the source document status is transitioned to `consent_revoked_or_expired` and further queries are blocked, but immutable audit event records and clinician sign-off hashes remain permanently in PostgreSQL.

---

## 6. Operational Modes Matrix

OncoBrief supports 4 explicit provider modes configured via environment variables:

| Mode | Environment Flag | Network Activity | Gateway Auth | Typical Usage |
|---|---|---|---|---|
| **DISABLED** | `ABDM_ENABLED=false` | None | None | Air-gapped deployments |
| **SIMULATED** | `ABDM_MODE=simulated` | Loopback only | Mocked in-process | Local development, unit/E2E tests |
| **SANDBOX** | `ABDM_MODE=sandbox` | Real outbound to `dev.abdm.gov.in` | Real Sandbox JWT | Pre-production certification |
| **PRODUCTION** | `ABDM_MODE=production` | Real outbound to `gateway.abdm.gov.in`| Production HFR/HPR | Authorized live clinical hospital HIS |

---

## 7. Sign-Off & Standards Alignment

This contract baseline governs all implementations in `packages/domain/src/fhir`, `packages/adapters/src/abdm-*`, `packages/db/src/services/abdm-*`, and `apps/web/src/app/api/v3/[...abdmPath]`.
