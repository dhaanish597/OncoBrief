# OncoBrief — Comprehensive Assessment Remediation & 100% V4 Implementation Master Plan

- **Document Version:** 2.0 (Unified 100% Scope Edition — Supersedes Strategy A vs. Strategy B Split)
- **Target Repository:** `/Users/dhaanish/Documents/OncoBrief`
- **Active Branch:** `feat/v4-assessment-remediation`
- **Track Scope:** **Cancer Care Only** ([National Cancer Grid / NCG-KCDO](https://www.kcdo.in/oncologyemr) — Use Case 01 Care Continuity, Use Case 02 Consultation Readiness, Use Case 04 Clinic Operations & Patient Flow, Use Case 05 Doctor Productivity & Knowledge Assistant, plus Milestones A & B)
- **Master Scope Policy:** **Zero Deferred In-Scope Features.** This master plan unifies every requirement from `ONCOBRIEF_ENHANCEMENT_PLAN.md`, `docs/milestone-a.md`, `docs/milestone-b.md`, `CLAUDE.md`, `README.md`, and the Health-a-thon 2026 Independent Code Audit (`reports/`) into a single, dependency-ordered, parallelizable 26-task engineering blueprint (`TASK-001` through `TASK-026`) covering 100% of `REQ-001` through `REQ-065`.

---

## 1. Executive Summary & Architectural Posture

### 1.1 Why We Eliminated the Strategy A vs. Strategy B Split
In the initial planning iteration, several promised V4 capabilities (most notably the Manifest V3 EHR Browser Extension `REQ-034`, multi-report packet segmentation wiring `REQ-055`, interactive Guideline PDF upload & viewer `REQ-051`, real outbound webhook/Twilio delivery `REQ-059`, and bounded OPD/Continuity state-graph agents) were either deferred as non-goals or split between a "Minimum Prototype" and a "Full V4" track.

Under this revised **Unified 100% Scope Master Plan**:
- **Zero In-Scope Features Are Deferred:** All 65 requirements (`REQ-001`–`REQ-065`) are mapped to concrete implementation tasks (`TASK-001`–`TASK-026`).
- **60–90 Days Is the Clinical Pilot Measurement Window, Not the Build Schedule:** The software implementation is structured for an intensive AI-assisted engineering sprint organized into **5 parallel execution waves** (Waves 0–4) with strict file-ownership isolation.
- **Preservation of Completed Work:** `TASK-001` (Canonical Readiness Vocabulary & `/workspace` Filter Fix) and `TASK-002` (Migration `0020_remediation_rls_and_governance.sql` enforcing `ENABLE + FORCE RLS` on all 14 Milestone A/B tables + DB provenance triggers) are already implemented on branch `feat/v4-assessment-remediation` (`IMPLEMENTED BUT UNVERIFIED` in sandbox pending host CLI run) and are preserved intact.

### 1.2 Ten Mandatory Special-Attention Areas Addressed in Full
1. **Browser Extension (`REQ-034` → `TASK-016`):** Complete Chrome/Edge Manifest V3 extension (`apps/extension/`) + `POST /api/v1/patients/[id]/extension-grants` and `POST /api/v1/extension/capture` consuming the existing `extension_grant` table (`0002_schema.sql:405-419`).
2. **Guideline PDF Ingestion & Source Viewer (`REQ-024`, `REQ-051` → `TASK-018`):** Interactive upload of real institutional SOP / NCG guideline PDFs (`ingestGuidelineDocumentPdf`), OCR span & bounding-box extraction into `guideline_document` + `guideline_span`, and a dedicated Guideline Source Viewer on `/patients/[id]/sources?guideline=<id>&page=<n>&span=<id>`.
3. **WCAG 2.2 AA Accessibility (`REQ-045`, `REQ-052` → `TASK-019`):** Contrast token remediation (`#7c530b` `6.12:1`, `#857d6f` `3.45:1`, replacing low-contrast `text-slate-400`), `0` unlabeled form controls across all V4 & Milestone A/B pages, `<main id="main-content">`, skip links, `aria-live="polite"`, and `@axe-core/playwright` zero-violation verification (`E2E-014`).
4. **375px Mobile Responsiveness (`REQ-046`, `REQ-053` → `TASK-020`):** Responsive table/card wrappers and mobile date-rail layout across all 12 V4 and Milestone A/B routes, verified by automated Playwright assertion `document.documentElement.scrollWidth <= 375` (`E2E-015`).
5. **Original Four Studio Deliverables & Dead Server Actions (`REQ-011`, `REQ-025`, `REQ-054` → `TASK-021`, `TASK-022`):** Complete support for `referral_letter`, `tumor_board_deck` (with printable **Slides View**), `academic_case_abstract` (with automatic PHI redaction and `Day 0 / Day +N` relative dates), and `patient_info_sheet`, plus interactive `[G#]` guideline citation picker, `withdrawPacketAction` UI on `/packet`, and `waiveGapAction` on `/record-map`.
6. **Multi-Report Packet Segmentation (`REQ-055` → `TASK-017`):** Wires `segmentDocumentPacket()` (`packages/domain/src/ingestion/packet-segmenter.ts`) into `ingestNormalizedPages()` (`packages/db/src/services/documents.ts`), persists sub-documents in `document_subpacket` (`0021_complete_v4_scope.sql`), passes per-subpacket stated dates/facilities to candidate extraction, and renders the segmented sub-document breakdown on `/patients/[id]/sources`.
7. **Real OPD Notifications, Two-Step Offer Acceptance & OPD Agent (`REQ-020`, `REQ-021`, `REQ-056` → `TASK-007`, `TASK-008`):** Bidirectional sync between Milestone B `appointment` and V4 `opd_appointment_slot`, `opdBackfillWorkflowGraph` execution, automatic `patient_message` queuing on `offerOpdSlot`, and two-step `acceptOpdSlotOffer` / `releaseOpdSlotOffer`.
8. **Multilingual Voice Workflows & Continuity Agent (`REQ-028`–`REQ-030`, `REQ-057` → `TASK-012`, `TASK-023`):** All 11 Indic languages (`en`, `hi`, `ta`, `te`, `bn`, `mr`, `kn`, `ml`, `gu`, `pa`, `or`) seeded with native-script templates + `SarvamTranslationAdapter` (`mayura:v1`), `SarvamSpeechAdapter` (`bulbul:v3` TTS & `saaras:v3` STT) + audible multi-tone PCM WAV fallback (`generateAudibleFallbackWav`), and `continuityOutreachWorkflowGraph` + `/api/v1/continuity/webhook` for two-way patient/caregiver attendance confirmation.
9. **ABDM v6.5.0 Integration (`REQ-016`–`REQ-018`, `REQ-058` → `TASK-025`):** End-to-end M2 HIP Care Context linking (`linkPacketCareContextAction`), M3 HIU consent request/notification/Fidelius X25519 ECDH encrypted transfer/ingestion, standard TMC/AIIMS FHIR bundle intake, and `Link to Existing` duplicate resolution in `DocumentUploadForm.tsx`.
10. **Real External Provider Connections & Contract Suite (`REQ-013`, `REQ-015`, `REQ-049`, `REQ-059`, `REQ-061` → `TASK-014`, `TASK-024`, `TASK-026`):** Adds `WebhookDeliveryAdapter` (Twilio SMS/WhatsApp + HMAC webhook), `/api/v1/system/providers` health & verification-tier endpoint (`Code Complete` vs `Sandbox Verified` vs `Live Verified`), `ProviderModeBadge` across UI surfaces, and `provider-contracts.test.ts`.

---

## 2. Master Wave Execution Plan (`TASK-001` through `TASK-026`)

| Wave | Execution Mode | Tasks in Wave | Key Deliverables & Milestone Gate |
| :--- | :--- | :--- | :--- |
| **Wave 0** | **Completed on Branch** (`IMPLEMENTED BUT UNVERIFIED` in sandbox) | `TASK-001`, `TASK-002` | Canonical readiness vocabulary (`ready \| gaps \| blocked \| none`) in `readiness.ts` & `workspace/page.tsx`; Migration `0020_remediation_rls_and_governance.sql` enforcing `ENABLE + FORCE RLS` on all 14 Milestone A/B tables + DB provenance triggers. |
| **Wave 1** | **7 Parallel Tracks** (Disjoint File Ownership) | `TASK-003`, `TASK-004`, `TASK-005`, `TASK-007`, `TASK-009`, `TASK-010`, `TASK-012` | Middleware CVE-2025-29927 & Server Action RBAC hardening (`TASK-003`); Encounter & Tumor Board provenance/boundary governance (`TASK-004`); `documentIngestionWorkflowGraph` wiring (`TASK-005`); `appointment` ↔ `opd_appointment_slot` sync (`TASK-007`); `assistantQueryWorkflowGraph` Co-Pilot with confirmation-gated action proposals (`TASK-009`); `ClinicalContextView` real-fact scoping (`TASK-010`); 11-locale templates, `SarvamTranslationAdapter` & audible WAV TTS fallback (`TASK-012`). |
| **Wave 2** | **9 Parallel Tracks** (Feature & Workflow Completion) | `TASK-006`, `TASK-008`, `TASK-011`, `TASK-013`, `TASK-016`, `TASK-017`, `TASK-018`, `TASK-022`, `TASK-023` | Local raster image OCR (`TASK-006`); `opdBackfillWorkflowGraph` + two-step slot offer/accept/release (`TASK-008`); dynamic `PatientSnapshotHeader` alerts (`TASK-011`); live `/analytics` & `/workspace` KPI queries (`TASK-013`); **Manifest V3 Browser Extension (`apps/extension`) & `extension_grant` API (`TASK-016`)**; **Multi-Report Packet Segmentation (`0021`, `TASK-017`)**; **Interactive Guideline PDF Upload & `[G#]` Source Viewer (`TASK-018`)**; `withdrawPacketAction` & `waiveGapAction` UI (`TASK-022`); **Continuity Attendance Agent & `/api/v1/continuity/webhook` (`TASK-023`)**. |
| **Wave 3** | **7 Parallel Tracks** (Polish, External Adapters, A11y & Mobile) | `TASK-014`, `TASK-019`, `TASK-020`, `TASK-021`, `TASK-024`, `TASK-025`, `TASK-026` | `ProviderModeBadge` across UI (`TASK-014`); **WCAG 2.2 AA remediation & `@axe-core/playwright` gate (`TASK-019`)**; **375px mobile zero-overflow remediation & Playwright gate (`TASK-020`)**; **4-Deliverable Studio + `[G#]` picker & Slide View (`TASK-021`)**; **`WebhookDeliveryAdapter` for Twilio/WhatsApp/SMS (`TASK-024`)**; **ABDM M2/M3 & Fidelius ECDH E2E verification (`TASK-025`)**; **`/api/v1/system/providers` & `provider-contracts.test.ts` (`TASK-026`)**. |
| **Wave 4** | **Unified Final Gate** | `TASK-015` | Full 5-layer verification run (`typecheck`, `lint`, `boundary:check`, `branding:check`, `db:migrate`, `db:seed`, `domain`, `adapters`, `db`, `web`, and `E2E-001`–`E2E-016`). |

---

## 3. Projected Post-Implementation Scorecard Impact

| Evaluation Dimension | Weight | Baseline Audit Score (`reports/`) | Post-`TASK-001`..`TASK-026` Target | Key Evidence Driving Score Uplift |
| :--- | :---: | :---: | :---: | :--- |
| **1. Problem Understanding & Track Alignment (NCG Cancer Care)** | 15% | 8.2 / 10 | **9.6 / 10** | 100% oncology-scoped across UC01, UC02, UC04, UC05, and Milestones A/B; zero synthetic lab charts on real patients (`TASK-010`). |
| **2. Functional Completeness (UC01, UC02, UC04, UC05 + Milestones A/B)** | 20% | 6.4 / 10 | **9.7 / 10** | Zero deferred features: Browser Extension (`TASK-016`), Packet Segmentation (`TASK-017`), Guideline PDF Upload & Viewer (`TASK-018`), 4 Studio formats (`TASK-021`), OPD two-step backfill (`TASK-008`), and 11-locale voice continuity (`TASK-012`, `TASK-023`). |
| **3. Technical Architecture, Agentic AI & Interoperability** | 20% | 6.5 / 10 | **9.6 / 10** | `WorkflowStateGraph` wired across all 4 production workflows (`TASK-005`, `TASK-008`, `TASK-009`, `TASK-023`); ABDM v6.5.0 M2/M3 + Fidelius ECDH + HL7 mCODE STU4 (`TASK-025`); contract-tested cloud adapters (`TASK-024`, `TASK-026`). |
| **4. Clinical Safety, Provenance & Regulatory Guardrails** | 20% | 6.8 / 10 | **9.8 / 10** | Two-Stage Span Gate (`REQ-002`) + DB-level provenance triggers (`0020` in `TASK-002`) + `checkTextForBoundary` enforced across Encounter Notes, Tumor Board, Studio, and Assistant (`TASK-004`, `TASK-009`, `TASK-021`). |
| **5. Security, Multi-Tenant Isolation & Auditability** | 15% | 5.0 / 10 | **9.8 / 10** | `ENABLE + FORCE RLS` on 100% of tenant tables (`0002`–`0021`), middleware CVE-2025-29927 mitigation & Server Action RBAC (`TASK-003`), single-use SHA-256 `extension_grant` tokens (`TASK-016`), and PHI-redacted hash-chained `audit_event` log. |
| **6. UX, Accessibility (WCAG 2.2 AA), Multilingual & Mobile (375px)** | 10% | 6.2 / 10 | **9.5 / 10** | `<= 4 clicks` batch verify, 11 Indic languages with playable audio (`TASK-012`), `0` axe-core WCAG 2.2 AA violations (`TASK-019`), and `0px` horizontal overflow at `375px` width (`TASK-020`). |
| **COMPOSITE WEIGHTED SCORE** | **100%** | **66.3 / 100** | **96.9 / 100** | **Ready for Final-Round Technical & Clinical Jury Evaluation** |

---

## 4. Document Index (`docs/implementation-planning/`)

1. **[`ONCOBRIEF_100_PERCENT_SCOPE_COVERAGE.md`](./ONCOBRIEF_100_PERCENT_SCOPE_COVERAGE.md):** Complete 65-requirement inventory (`REQ-001`–`REQ-065`), omitted/simulated gap resolution, `TASK-001`–`TASK-026` summary, parallel execution waves, `E2E-001`–`E2E-016` acceptance matrix, external provider verification tiers, and zero-deferral coverage matrix.
2. **[`ONCOBRIEF_ASSESSMENT_REMEDIATION_MASTER_PLAN.md`](./ONCOBRIEF_ASSESSMENT_REMEDIATION_MASTER_PLAN.md):** Executive blueprint, 10 special-attention area architectures, wave execution plan, and scorecard uplift projections.
3. **[`ONCOBRIEF_IMPLEMENTATION_TASKS.md`](./ONCOBRIEF_IMPLEMENTATION_TASKS.md):** Detailed task specifications (`TASK-001` through `TASK-026`) with exact files, database schemas, function signatures, and verification commands.
4. **[`ONCOBRIEF_IMPLEMENTATION_DECISIONS.md`](./ONCOBRIEF_IMPLEMENTATION_DECISIONS.md):** Architecture Decision Records (`ADR-001` through `ADR-011`) governing readiness vocabulary, universal RLS, middleware security, clinical boundary governance, `WorkflowStateGraph` orchestration, OPD backfill, Manifest V3 Browser Extension, Packet Segmentation, Guideline PDF ingestion, Dual-Mode Providers, and WCAG 2.2 AA / 375px Mobile compliance.
5. **[`ONCOBRIEF_AGENTIC_AI_IMPLEMENTATION_PLAN.md`](./ONCOBRIEF_AGENTIC_AI_IMPLEMENTATION_PLAN.md):** Complete specification of the 4 bounded state-graph agents (`documentIngestionWorkflowGraph`, `assistantQueryWorkflowGraph`, `opdBackfillWorkflowGraph`, `continuityOutreachWorkflowGraph`).
6. **[`ONCOBRIEF_PLAN_VS_CODE_GAP_MATRIX.csv`](./ONCOBRIEF_PLAN_VS_CODE_GAP_MATRIX.csv):** Machine-readable 65-row traceability CSV mapping `REQ-001`–`REQ-065` to code locations, tasks (`TASK-001`–`TASK-026`), and E2E tests (`E2E-001`–`E2E-016`).
7. **[`ONCOBRIEF_TEST_AND_DEMO_VALIDATION_PLAN.md`](./ONCOBRIEF_TEST_AND_DEMO_VALIDATION_PLAN.md):** 5-layer test architecture, `E2E-001`–`E2E-016` assertions, and the 7-stage live judge demonstration walkthrough.
