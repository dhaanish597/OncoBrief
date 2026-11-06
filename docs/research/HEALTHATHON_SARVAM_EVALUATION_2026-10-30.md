# ONCOBRIEF — HEALTH-A-THON 2026 SARVAM AI IMPLEMENTATION AUDIT & JURY EVALUATION REPORT

- **Audit Date:** 2026-10-30 (Asia/Kolkata, IST)
- **Repository Root:** `/Users/dhaanish/Documents/OncoBrief`
- **Git Branch & Commit SHA:** `main` @ `7b2edec` (`feat(operations): implement Milestone A and B oncology operations and management`)
- **Working-Tree State:** Clean on tracked files (`0` modified tracked files; untracked `docs/implementation-planning/` and `reports/` present prior to audit; this audit adds `HEALTHATHON_SARVAM_EVALUATION_2026-10-30.md` and `SARVAM_IMPLEMENTATION_TRACEABILITY.csv` without modifying any application code)
- **Target Hackathon & Track:** [Health-a-thon 2026](https://healthathon.reskilll.com/) ([Participant Guide](https://healthathon.reskilll.com/guide) · [Koita Foundation](https://www.koitafoundation.org/health-a-thon)) — **Cancer Care Track** (in partnership with the [National Cancer Grid / NCG](https://www.koitafoundation.org/health-a-thon)), targeting **Use Case 02** (Consultation Readiness & Patient Journey Review), **Use Case 04** (Clinic Operations & Patient Flow), **Use Case 05** (Doctor Productivity & Knowledge Assistant), and **Cancer-Patient & Caregiver Care Continuity**
- **Traceability Matrix Companion File:** [`SARVAM_IMPLEMENTATION_TRACEABILITY.csv`](./SARVAM_IMPLEMENTATION_TRACEABILITY.csv)

---

## 1. Executive Verdict

### Is OncoBrief's Sarvam AI Implementation Genuinely Competitive and Useful?

**Verdict: CONDITIONAL GO FOR DEMO (Currently NO-GO for Live Multilingual/Sarvam AI Demo Until 5 Critical P0 Blockers Are Patched — Estimated 4–6 Hours of Targeted Engineering).**

OncoBrief’s **core deterministic clinical-operations foundation**—its append-only PostgreSQL Evidence Ledger (`packages/db/migrations/0002_schema.sql`, `0003_policies_grants.sql`), two-stage span provenance architecture (`packages/domain/src/provenance/span-validation.ts`), 14 oncology-specific administrative fact schemas (`packages/domain/src/vocab/fact-types.ts`), automated ER/PR/HER2 and numeric lab conflict comparators (`packages/domain/src/conflict/comparators.ts`), side-by-side Reconciliation Room (`apps/web/src/app/(app)/patients/[id]/conflicts/[conflictId]/page.tsx`), 2-click batch verification (`packages/db/src/services/ledger.ts:379`), and source-locked continuity messaging gate (`packages/db/src/services/messages.ts:169`)—is **genuinely strong, architecturally distinctive, and well-aligned with the National Cancer Grid (NCG) consultation-readiness problem**.

However, **the Sarvam AI integration and multilingual layer are currently crippled by a P0 case-normalization bug, missing regional-language extraction/template support, ungraceful runtime error handling when `OCR_DRIVER=auto`, and misleading UI simulation timers.** Specifically:

1. **P0 Casing Bug Breaks All Indic STT and TTS (`packages/adapters/src/sarvam-voice.ts:59-64`):**
   `normalizeLanguageCode(code)` converts the input code to lowercase (`code.toLowerCase().replace(/_/g, '-')`, turning `'hi-IN'` into `'hi-in'` and `'ta-IN'` into `'ta-in'`) and immediately checks `isSupportedLanguage(normalized)` against `SUPPORTED_LANGUAGES` (`['en-IN', 'hi-IN', 'ta-IN', ...]`). Because `'hi-in' !== 'hi-IN'`, `isSupportedLanguage()` **always returns `false`**, and `normalizeLanguageCode()` **silently forces every single Sarvam STT (`saaras:v3`) and TTS (`bulbul:v3`) API call in the entire application to `'en-IN'`!** Furthermore, Odia is configured as `'or-IN'` in `sarvam-voice.ts:49` and `locales.ts:12`, whereas [Sarvam AI’s official API](https://docs.sarvam.ai/api/getting-started/models/saaras) requires `'od-IN'`.
2. **P0 Zero Indic Translation & Only 2 Seeded Message Templates (`packages/db/src/seed.ts:434-460`, `ContinuityAudioPlayer.tsx:174`):**
   Despite `ONCOBRIEF_ENHANCEMENT_PLAN.md` (KR4.1) promising 11-language continuity reminders, `seed.ts` only creates `message_template` rows for English (`locale: 'en'`) and Hindi (`locale: 'hi'`). No translation service (neither [Sarvam Mayura / Sarvam-Translate](https://docs.sarvam.ai/api/getting-started/models/mayura) nor pre-authored approved templates for the other 9 Indic languages) exists. Selecting Tamil (`ta-IN`), Telugu (`te-IN`), or Kannada (`kn-IN`) in `ContinuityAudioPlayer` passes untranslated English or Hindi text to TTS—which then speaks it in an `en-IN` voice because of Bug #1.
3. **P0 Regional-Language OCR Produces Zero Facts on Web Uploads (`packages/db/src/services/documents.ts:436`, `apps/web/src/lib/actions.ts:472`, `packages/db/src/container.ts:75`):**
   Even when `SarvamVisionOcrAdapter` extracts Hindi or Tamil text from a document, (a) `DocumentUploadForm.tsx` has no language selector and `documents.ts:436` does not pass `language` to `extractDocument()`, defaulting to `OCR_LANGUAGE=en-IN`; and (b) both `actions.ts:472` and `container.ts:75` hardcode `new RuleBasedExtractor()`, whose regexes (`Diagnosis:`, `Stage:`, `Hemoglobin`, `January..December`) are **100% English-only**. Thus, a Tamil or Hindi oncology report yields **zero extracted facts**.
4. **P0 Fake Upload Stepper & Static "Sarvam Vision: Active" Badges (`DocumentUploadForm.tsx:188-228`, `ProcessingStatusCard.tsx:94-130, 373`):**
   Uploading any file runs a hardcoded 4.0-second `setTimeout` animation displaying `"Extracting tabular text spans with Sarvam Vision…"` and `"Sarvam Vision (OCR): Active"` (`12.5s`) even when `OCR_DRIVER=local-pdf` and Sarvam is never called. Worse, in `.env`, `OCR_DRIVER=auto` and a 36-character `SARVAM_API_KEY` are set; if that key is expired, rate-limited, or offline during judging, `SarvamVisionOcrAdapter` throws `ocr_extraction_failed` and **fails the upload completely without falling back to `LocalMultimodalOcrAdapter`**.
5. **P0 Milestone A/B Regressions Break the Main Dashboard & Demo Seed (`workspace/page.tsx:107, 189-196`, `seed.ts:1244`, `tumor-board/page.tsx:246, 354`):**
   Commit `7b2edec` broke `/workspace` so it always displays **`0 Record Complete`** (`readinessBand === 'complete'` instead of `'ready'`), broke Milestone B seeding (`WHERE email = 'ananya.mukhopadhyay@rci.invalid'` instead of `'dr.ananya@rci.demo'`), and introduced unanchored free-text TNM staging (`cT2aN1M0 Stage IIB`) and treatment recommendation inputs on `/tumor-board` and `/encounters/[encounterId]`.

---

### Three Distinct Quality Assessments

| Assessment Dimension | Rating | Justification |
| :--- | :---: | :--- |
| **A. Architecture Quality** | **8.5 / 10 (Strong)** | Clean hexagonal port/adapter separation (`@oncobrief/ports`, `@oncobrief/adapters`, `@oncobrief/domain`, `@oncobrief/db`), database-enforced append-only triggers (`oncobrief_block_mutation`), SHA-256 hash chains, forced PostgreSQL RLS on 37 core/V4 tables, restart-safe base64url batch job envelopes in `SarvamVisionOcrAdapter`, and strict server-side authorization in `scopedTts.ts`. |
| **B. Demonstrated Implementation Quality** | **5.8 / 10 (Mixed)** | Local digital PDF ingestion, conflict detection, batch verification, longitudinal lab flowsheets, and security gates are verified by 886 unit/integration tests and 51 Playwright tests. However, Sarvam STT/TTS language normalization is broken (`toLowerCase()` bug), multi-chunk TTS WAV concatenation is corrupt, web uploads hardcode `RuleBasedExtractor` and fake timers, and Milestone A/B introduced dashboard and seed regressions. |
| **C. Health-a-thon Submission Readiness** | **6.8 / 10 (Conditional)** | Strongly aligned with Cancer Care Use Cases 02, 04, and 05 and the non-diagnostic guardrail (except for the Milestone B free-text staging/recommendation regression). Once the 5 P0 bugs are fixed (~4–6 hours), readiness rises to **8.8 / 10**. |

---

### Plain-Language Summary for the Technical Lead

- **What is actually wrong:**
  1. In `packages/adapters/src/sarvam-voice.ts:60`, `code.toLowerCase()` turns `'hi-IN'` into `'hi-in'`, which fails `SUPPORTED_LANGUAGES.includes(...)` and forces **every** STT and TTS request to `'en-IN'`. Also, Odia is `'or-IN'` instead of Sarvam's `'od-IN'`.
  2. In `packages/adapters/src/sarvam-voice.ts:194`, `data.audios?.join('')` concatenates base64-encoded WAV files directly, leaving mid-stream base64 `=` padding and embedded 44-byte RIFF/WAVE headers when Sarvam returns multiple audio chunks.
  3. In `apps/web/src/components/assistant/useVoice.ts:226-264`, when `SARVAM_API_KEY` is present in `.env`, `startListening()` uses `MediaRecorder` and never falls back to browser `SpeechRecognition` if `/api/v1/assistant/voice/stt` returns 503 or fails.
  4. In `packages/adapters/src/ocr-routing.ts:15-21` and `packages/db/src/services/documents.ts:435-465`, when `OCR_DRIVER=auto` and `SARVAM_API_KEY` is set, `createOcrAdapter` returns `SarvamVisionOcrAdapter` with no fallback to `LocalMultimodalOcrAdapter` on network/key failure, and `SarvamVisionOcrAdapter` calls `/doc-ai/v1/job/{id}/results?format=json` without handling Sarvam's ZIP download flow (`/download-url`) if `/results` returns 404/400 on digitise jobs.
  5. `DocumentUploadForm.tsx:188-228` and `ProcessingStatusCard.tsx:373` fake a 4-second `"Sarvam Vision"` stepper, `actions.ts:472` and `container.ts:75` hardcode `RuleBasedExtractor` (ignoring `Stage B` `validateCandidateProvenance` in `ledger.ts:218`), `workspace/page.tsx:107` checks `'complete'` instead of `'ready'`, and `seed.ts:1244` queries `'ananya.mukhopadhyay@rci.invalid'`.
- **What to fix first:**
  1. Fix `normalizeLanguageCode()` in `sarvam-voice.ts` to normalize casing to `xx-YY` (`parts[0].toLowerCase() + '-' + parts[1].toUpperCase()`) and map `'or-IN'` → `'od-IN'` for Sarvam API calls.
  2. Decode each base64 chunk in `data.audios[]` to a `Buffer`, strip the 44-byte WAV header on chunks `1..N`, update the RIFF/data length bytes in chunk `0`, and re-encode to a single valid WAV base64 string.
  3. Seed approved `message_template` rows for all 11 supported locales in `packages/db/src/seed.ts` and lock/sync `ContinuityAudioPlayer` to the message's template locale.
  4. Remove the 4.0s `setTimeout` fake stepper in `DocumentUploadForm.tsx`, add runtime fallback to `LocalMultimodalOcrAdapter` for digital PDFs when `OCR_DRIVER=auto` fails, and wire `validateCandidateProvenance` (Stage B) in `ledger.ts`.
  5. Fix `'complete'` → `'ready'` in `workspace/page.tsx`, fix `'ananya.mukhopadhyay@rci.invalid'` → `'dr.ananya@rci.demo'` in `seed.ts`, and bind `/tumor-board` staging to verified `stage_text.as_written` ledger facts.
- **How to verify it:**
  Run `pnpm verify`, inspect the outbound payload in `providers.test.ts` to assert `target_language_code: 'ta-IN'` (not `'en-IN'`), run a 1-call live smoke test against `https://api.sarvam.ai/text-to-speech` and `/speech-to-text`, and verify `/workspace`, `/appointments`, `/tumor-board`, and `/patients/[id]/continuity` in Chromium.

---

### Plain-Language Summary for the Clinical Lead

- **How Sarvam improves the real oncology workflow:**
  In National Cancer Grid (NCG) tertiary cancer centres, patients arrive with thick folders of multi-hospital paper/PDF reports and family caregivers who speak Hindi, Tamil, Telugu, Marathi, or Bengali rather than English. OncoBrief uses Sarvam AI in two non-diagnostic operational places: (1) digitizing scanned referral letters, histopathology reports, and lab tables into source-linked timeline facts (`Sarvam Vision`), and (2) letting clinicians query the chart by voice (`Sarvam Saaras`) and letting coordinators preview approved appointment and document-bring reminders as regional-language voice notes for patients and consented caregivers (`Sarvam Bulbul`).
- **What is still unreliable today:**
  1. **Spoken regional reminders currently speak in an Indian English voice (`en-IN`)** because of a software casing bug, and only English and Hindi reminder templates are pre-loaded in the database—selecting Tamil or Telugu does not translate an English reminder into Tamil or Telugu.
  2. **Uploaded non-English reports (e.g., a Hindi or Tamil referral note) will not automatically populate the timeline** because the downstream fact-extraction rules only look for English medical headings (`Diagnosis:`, `Stage:`, `Hemoglobin`).
  3. **Voice notes are previewed on the coordinator's screen**, not actually transmitted over WhatsApp or phone calls (outbound delivery is a labeled simulation).
- **What must remain human-controlled:**
  Every extracted date, lab value, receptor status (`ER/PR/HER2`), or surgical procedure starts as `extracted` (unverified) and **must be verified by a clinician or records officer** before entering an approved consultation packet or triggering a patient reminder. Cross-document contradictions (e.g., two different surgery dates) **must be resolved by a clinician in the Reconciliation Room**, and tumor-board staging or consultation notes must never be generated autonomously by AI.

---

## 2. Audit Scope and Methodology

### 2.1 Repository & Git State Inspected
- **Repository Path:** `/Users/dhaanish/Documents/OncoBrief`
- **Git Branch:** `main` (local branches: `main`, `codex/merge-clinical-ui`; remotes: `origin/main`, `origin/feat/oncobrief-clinical-ui`)
- **HEAD Commit SHA:** `7b2edec` (`feat(operations): implement Milestone A and B oncology operations and management`)
- **Prior Recent Commits:**
  - `afa0875` — `feat(platform): merge Clinical UI with V4 evidence workflows`
  - `ee0b1e5` — `feat(platform): implement V4 consultation readiness, smart OPD flow, and clinician studio`
  - `b6236eb` — `feat: improve clinical context UI and charts`
  - `1b606f9` — `feat(platform): implement V3 multimodal pipeline, design parity, and evidence viewer remediation`
  - `067c3e2` — `fix(reconciliation): resolve conflict state machine bug and enable superseding`
  - `06c4dbf` — `feat(assistant): enforce strict evidence grounding and fix missing-document reconciliation`
- **Environment Inspection (Safe, Zero-Secret Disclosure):**
  We inspected `.env.example` and checked key presence/lengths in `.env` without printing secret values. In `.env`:
  - `OCR_DRIVER=auto` (length 4)
  - `EXTRACTION_DRIVER=rule` (length 4)
  - `STORAGE_DRIVER=fs` (length 2)
  - `QUEUE_DRIVER=memory` (length 6)
  - `ABDM_DRIVER=simulated` (length 9)
  - `SARVAM_API_KEY` is **SET** (length 36 characters)
  - `NVIDIA_API_KEY` is **SET** (length 70 characters)
  - `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, and `BEDROCK_MODEL_ID` are **EMPTY**

### 2.2 Chronology of Project Documents & Authority Hierarchy
We inspected all planning, research, architecture, and audit documents in the repository and established their exact chronology:

| Chronological Stage | Document(s) | Role & Authority Status |
| :--- | :--- | :--- |
| **Stage 1: Initial Concept & Deep Research (Early Oct 2026)** | `docs/cancer_track.md`, `docs/oncobrief_deep_research_health-a-thon-2026.md`, `docs/oncobrief_clinician_platform_design.md`, `ONCOBRIEF_ENHANCEMENT_PLAN (old).pdf` | **Aspirational / Foundational Research:** Proposed a full Sarvam Indic stack (`Sarvam Vision OCR`, `Sarvam-105B` LLM via LangChain/Hermes, `Saaras v3` ASR, `Bulbul v3` TTS, WhatsApp/IVR) and a browser extension overlay. `oncobrief_deep_research_health-a-thon-2026.md` §4.4 explicitly discredited unverified Reddit/vendor impact numbers (`8→2 min`, `35–50% attrition`) and established the Evidence Ledger design. |
| **Stage 2: V1–V2 Evidence Ledger Core & ADRs 0001–0016 (20 Oct 2026)** | `README.md`, `CLAUDE.md`, `AGENTS.md`, `docs/decisions/0001`–`0016`, `audit/AUDIT-REPORT.md` | **Foundational Architecture:** Built the PostgreSQL 16 append-only Evidence Ledger, RLS, span provenance, rule-based extraction, AWS Textract/Bedrock worker, NVIDIA NIM assistant, and simulated delivery (`ADR 0011`). |
| **Stage 3: V3 Multimodal Intake & Sarvam Adapters (21–23 Oct 2026)** | `docs/ONCOBRIEF_V3_BUILD_AND_TEST_PLAN.md`, `docs/decisions/0017`–`0021` | **V3 Implementation Spec:** Added `SarvamVisionOcrAdapter` (`sarvam-vision-ocr.ts`), `sarvamStt`/`sarvamTts` (`sarvam-voice.ts`), `LocalMultimodalOcrAdapter`, DICOM header scrubbing, ABDM M2/M3 simulated loopback, and Stage B provenance (`span-validation.ts`). |
| **Stage 4: V4 Enhancement Plan & ADRs 0022–0025 (23–24 Oct 2026)** | `ONCOBRIEF_ENHANCEMENT_PLAN.md`, `docs/decisions/0022`–`0025`, `docs/v4-codex-independent-review.md`, `docs/v4-final-test-report.md`, `docs/v4-judge-demo-runbook.md` | **Authoritative V4 Submission Blueprint:** Scoped OncoBrief to Cancer Care Use Cases 02, 04, 05 + Caregiver Continuity. Added interval deltas, longitudinal lab flowsheets, 2-click batch verify, Smart OPD queue/waitlist, Guideline RAG, Productivity Studio, Consented Caregivers, `scopedTts.ts`, and `ContinuityAudioPlayer.tsx`. |
| **Stage 5: V5 Milestones A & B Operations Merge (24–25 Oct 2026)** | `docs/milestone-a.md`, `docs/milestone-b.md`, `docs/appointment-workflows.md`, `docs/encounter-lifecycle.md` (`commit 7b2edec`) | **Current HEAD (`7b2edec`) Additions:** Added facilities, departments, clinician profiles, user invitations, `/appointments`, `/patients/[id]/encounters`, and `/tumor-board`. Introduced the 4 P0 regressions documented in Section 9. |
| **Stage 6: Pre-Audit Gap Analysis & Remediation Plans (29–30 Oct 2026)** | `reports/HEALTHATHON_2026_*.md/csv/json`, `docs/implementation-planning/ONCOBRIEF_*.md/csv` | **Internal Pre-Submission Audit & Planning:** Identified the Milestone A/B regressions and missing `WorkflowStateGraph`, but **missed** the P0 `normalizeLanguageCode()` casing bug in `sarvam-voice.ts:59-64` and the multi-chunk WAV header concatenation bug in `sarvam-voice.ts:194`. |

### 2.3 What Was Inspected, Executed, and Blocked
- **Inspected 100% of relevant source files:** All files in `packages/adapters/src/`, `packages/domain/src/`, `packages/db/src/`, `packages/db/migrations/` (`0001`–`0019`), `apps/worker/src/`, `apps/web/src/`, `apps/web/e2e/`, and `tools/`.
- **Web & Official Documentation Research Executed:** Live-browsed [healthathon.reskilll.com](https://healthathon.reskilll.com/), [healthathon.reskilll.com/guide](https://healthathon.reskilll.com/guide), [koitafoundation.org/health-a-thon](https://www.koitafoundation.org/health-a-thon), and [docs.sarvam.ai](https://docs.sarvam.ai/) ([Models](https://docs.sarvam.ai/api/getting-started/models), [Saaras](https://docs.sarvam.ai/api/getting-started/models/saaras), [Bulbul Voices](https://docs.sarvam.ai/api/api-guides-tutorials/text-to-speech/voices), [Sarvam-105B](https://docs.sarvam.ai/api/getting-started/models/sarvam-105b), [Sarvam Vision](https://docs.sarvam.ai/api/getting-started/models/sarvam-vision), [Document Intelligence Overview](https://docs.sarvam.ai/api/api-guides-tutorials/document-intelligence/overview), [Digitise API](https://docs.sarvam.ai/api-reference/doc-ai/job/digitise), [Get Job Status](https://docs.sarvam.ai/api-reference/doc-ai/job/status), and [Get Job Results](https://docs.sarvam.ai/api-reference/doc-ai/job/results)).
- **Sandbox Execution Constraint Explicitly Disclosed:** Inside this macOS evaluation agent sandbox, the Node/pnpm runtime binary is not mounted in the restricted sandbox shell `PATH`, and outbound network requests from shell commands are disabled by default. Therefore, we did **not** fabricate live CLI test runs; instead, we combined (1) deterministic line-by-line static execution tracing of the TypeScript AST/source, (2) verification of the committed test execution logs in `docs/review-evidence/2026-10-24/final-verify.log` (`886 passed` unit/integration tests, `51 passed` Playwright browser tests at commit `ee0b1e5`/`afa0875`), and (3) exact diff analysis of commit `7b2edec` against those logs. All live Sarvam cloud API behaviors are marked **NOT EVALUABLE (Live Cloud Unverified)** or **BROKEN (Deterministic Code Bug Proven)**.

---

## 3. Official Health-a-thon 2026 Requirements vs. Simulated Criteria

### 3.1 Published Timeline Verification
Per [healthathon.reskilll.com](https://healthathon.reskilll.com/) and [healthathon.reskilll.com/guide](https://healthathon.reskilll.com/guide) (verified 30 October 2026):
- **Doctor & Healthcare Professional Registration:** 1 August – 3 October 2026
- **Technology Team Registration:** 15 August – 3 October 2026
- **Matchmaking & Team Formation:** 22 August – 3 October 2026
- **Round 1 Idea Submission & Shortlisting:** 12 September – 3 October 2026 (**150 teams shortlisted** across 3 tracks, **50 teams in Cancer Care** including team **ICONIX**)
- **Build Sprint & Final Submission:** **10 October – 7 November 2026** *(Note: [koitafoundation.org/health-a-thon](https://www.koitafoundation.org/health-a-thon) lists an earlier overview timeline of 5 Oct – 8 Nov 2026; the active submission platform [healthathon.reskilll.com](https://healthathon.reskilll.com/) is authoritative: **Build Sprint ends 7 November 2026**, leaving **8 days** from today, 30 October 2026)*
- **Top 30 Finalists Announced:** By **14 November 2026**
- **Grand Finale (In-Person Live Demo at IIT Bombay, Powai):** **28 November 2026**

### 3.2 Strict Classification of Requirements & Criteria

| Requirement / Criterion | Category Label | Source & Exact Scope | OncoBrief Alignment |
| :--- | :---: | :--- | :--- |
| **Assistive, Not Diagnostic Hard Rule:** Must NOT diagnose, prescribe, recommend treatment, replace clinical judgment, act as clinical decision support (CDS), compute clinical risk scores, or interpret medical data. | **OFFICIAL REQUIREMENT** | [healthathon.reskilll.com](https://healthathon.reskilll.com/) & [Guide](https://healthathon.reskilll.com/guide) ("The hard rule") | **CONDITIONAL PASS:** Enforced in V3/V4 core (`clinical-boundary.ts`), but violated by Milestone B free-text staging/recommendation inputs on `/tumor-board` and `/encounters` (`7b2edec`). |
| **Fake or Fully Anonymized Data Only:** No real patient data on the platform, with mentors, or in demos. | **OFFICIAL REQUIREMENT** | [healthathon.reskilll.com/guide](https://healthathon.reskilll.com/guide) ("What may teams build?") | **PASS:** All seeded records (`DEMO-001`, `DEMO-002`, `DEMO-003`) are synthetic fixtures guarded by `is_demo_fixture = true`. |
| **Care Domain Alignment:** Build within Cancer Care (partnered with National Cancer Grid / NCG) for Doctor/Care-Team and/or Patient/Caregiver workflows. | **OFFICIAL REQUIREMENT** | [healthathon.reskilll.com](https://healthathon.reskilll.com/) | **PASS:** Dedicated to NCG oncology workflows (Use Cases 02, 04, 05 + Caregiver Continuity). |
| **Working Prototype Live Demo:** Build a functional working prototype during the Build Sprint and present a live demonstration at the Grand Finale. | **OFFICIAL REQUIREMENT** | [healthathon.reskilll.com/guide](https://healthathon.reskilll.com/guide) | **PASS (Core) / BROKEN (Sarvam Locale & Milestone B Seed):** Needs P0 fixes before live finale demo. |
| **Human Override & Audit Trail:** Keep a human override and an audit trail for operational actions. | **OFFICIAL GUIDANCE** | [healthathon.reskilll.com/guide](https://healthathon.reskilll.com/guide) ("What makes a strong entry?") | **PASS:** Exemplary SHA-256 hash-chained `ledger_entry` and `audit_event` streams with mandatory human sign-off. |
| **Minimal Phase-1 Integration ("Meet the Clinic Where It Is"):** Work with paper registers, Excel, PDFs, scans, WhatsApp, or hospital systems rather than requiring a full HIS/EHR rewrite. | **OFFICIAL GUIDANCE** | [healthathon.reskilll.com/guide](https://healthathon.reskilll.com/guide) ("How much system integration is expected?") | **PASS:** Ingests PDFs, scans, DICOM headers, and FHIR bundles without requiring hospital HIS database integration. |
| **Multilingual & Caregiver-Friendly Use:** Design for the languages of doctors, patients, and caregivers; treat caregivers as first-class users when family support is involved. | **OFFICIAL GUIDANCE** | [healthathon.reskilll.com/guide](https://healthathon.reskilll.com/guide) ("Must solutions be multilingual?") | **PARTIAL / BROKEN:** Caregiver consent table is solid, but `normalizeLanguageCode()` forces `en-IN`, only En/Hi templates exist, and regional OCR text is not extracted by `RuleBasedExtractor`. |
| **Measurable Operational KPI & 60–90 Day Pilot Path:** Pick a concrete operational metric (e.g., recall completion, time-to-note, no-show rate, handoff lag) and show how baseline and change are measured in 60–90 days. | **OFFICIAL GUIDANCE** | [healthathon.reskilll.com/guide](https://healthathon.reskilll.com/guide) ("Do we need a measurable KPI?") | **PARTIAL:** Timestamps exist in DB (`opd_appointment_slot`, `record_readiness_snapshot`), but no baseline-vs-target telemetry strip is surfaced in the UI. |
| **Use of Sarvam AI (`doc-digitise`, `saaras:v3`, `bulbul:v3`) across 11 Indic Languages:** Specific commitment to use Sarvam Vision OCR, Saaras STT, and Bulbul TTS. | **INTERNAL COMMITMENT** | `ONCOBRIEF_ENHANCEMENT_PLAN.md` §1, §3, §4; `submission/OncoBrief_Healthathon_2026_Final_Submission.pdf` | **PARTIAL / BROKEN:** Adapters exist, but P0 language normalization bug, missing Indic templates, and English-only regex extraction prevent real Indic end-to-end execution. |
| **100-Point Weighted Evaluation Rubric (15/20/20/15/15/10/5):** Quantitative scoring weights used in Section 11 of this report. | **SIMULATED JUDGE CRITERION** | Independently developed by this audit panel (organizers do not publish numeric point weights). | Scored at **62.5 / 100** in current state (`7b2edec`). |

---

## 4. Planned vs. Actual Implementation — Complete Traceability Matrix

The full machine-readable matrix is saved at [`SARVAM_IMPLEMENTATION_TRACEABILITY.csv`](./SARVAM_IMPLEMENTATION_TRACEABILITY.csv). Below is the consolidated traceability table across all **25 planned Sarvam AI and related multimodal/agentic capabilities**:

| ID | Capability | Source Plan | Actual Code Location | Runtime & Test Status | Primary Status Verdict |
| :--- | :--- | :--- | :--- | :--- | :---: |
| **SRV-DOC-01** | Sarvam Vision / Document AI job lifecycle (`POST /doc-ai/v1/job/digitise`, `/status`, `/results`) | `ONCOBRIEF_ENHANCEMENT_PLAN.md` §1, §3; `ADR 0021` | `packages/adapters/src/sarvam-vision-ocr.ts:36-273` | Wired in `createOcrAdapter()`; mocked HTTP tests in `ocr-correctness.test.ts:53-107`. Live API uses ZIP download URL for Parse/Digitise outputs; `/results?format=json` is not live-verified. | **IMPLEMENTED, NOT LIVE-VERIFIED** |
| **SRV-DOC-02** | OCR for printed English oncology reports (pathology, lab, discharge, referral) | `docs/cancer_track.md`; `ONCOBRIEF_ENHANCEMENT_PLAN.md` §2.2 | `local-multimodal-ocr.ts:116-226`; `sarvam-vision-ocr.ts:219-243`; `documents.ts:207-485` | Digital PDFs verified end-to-end via `LocalMultimodalOcrAdapter`; Sarvam path wired when configured but not live-verified. | **IMPLEMENTED, NOT LIVE-VERIFIED** |
| **SRV-DOC-03** | OCR for scanned image-only PDFs (faxes, scanned charts without text layer) | `oncobrief_clinician_platform_design.md` §3.3 | `local-multimodal-ocr.ts:49-56`; `sarvam-vision-ocr.ts:116-157`; `documents.ts:448-482` | Local mode quarantines image-only PDFs (`manual_transcription_required`). Sarvam adapter posts PDF bytes to `/doc-ai/v1/job/digitise`, not live-verified. | **IMPLEMENTED, NOT LIVE-VERIFIED** |
| **SRV-DOC-04** | OCR for mobile phone photos & raster scans (`image/jpeg`, `image/png`, `image/tiff`, `image/webp`) | `ONCOBRIEF_V3_BUILD_AND_TEST_PLAN.md` Task 2.3 | `sarvam-vision-ocr.ts:51-63`; `local-multimodal-ocr.ts:471-474` | Local mode returns empty text (quarantined). Sarvam accepts PNG/JPEG but throws `ocr_unsupported_media` on TIFF/WebP (`upload-url/route.ts` allows TIFF/WebP, causing downstream failure). | **PARTIALLY IMPLEMENTED** |
| **SRV-DOC-05** | Regional-language & mixed-language document extraction (Tamil, Hindi, etc.) | `docs/cancer_track.md`; `ONCOBRIEF_ENHANCEMENT_PLAN.md` §1 | `container.ts:64`; `documents.ts:436`; `rule-based-extractor.ts:59-515` | No UI language selector; `documents.ts:436` omits `language`; `RuleBasedExtractor` uses English-only regexes, extracting **0 facts** from Indic script text. | **PARTIALLY IMPLEMENTED** |
| **SRV-DOC-06** | Tabular lab reports & multi-column reading order preservation | `ONCOBRIEF_V3_BUILD_AND_TEST_PLAN.md` §2 | `local-multimodal-ocr.ts:165-218`; `sarvam-vision-ocr.ts:275-336`; `rule-based-extractor.ts:461-512` | Row-grouping (`\|y1-y2\| < 0.012`) and `reading_order` sorting verified on real CBC PDF fixture (`multimodal-intake.test.ts:195-232`). | **VERIFIED WORKING** |
| **SRV-DOC-07** | Multi-page PDF batching (`>10` pages split into `<=10`-page chunks) & page ordering | `ADR 0021`; `ONCOBRIEF_V3_BUILD_AND_TEST_PLAN.md` Task 2.3 | `packages/adapters/src/sarvam-vision-ocr.ts:64-86, 155, 213-217` | `splitPdfIntoBatches()` uses `pdf-lib` to split 23-page PDF into `10+10+3` and restores global page numbers (`ocr-correctness.test.ts:24-45, 240-308`). | **VERIFIED WORKING** |
| **SRV-DOC-08** | Bounding-box (`[0..1]`) & source-coordinate accuracy + confidence | `ADR 0021`; `SourcePaneView.tsx` | `sarvam-vision-ocr.ts:275-336`; `SourcePaneView.tsx:168-246` | Normalized `[0..1]` bbox validation and SVG `<rect>` overlay verified; however, Stage B `<0.85` confidence routing is not called in `ledger.ts`. | **PARTIALLY IMPLEMENTED** |
| **SRV-DOC-09** | Handling missing/unreadable text, partial failures, and job polling/recovery | `ADR 0021` | `sarvam-vision-ocr.ts:87-108, 158-218`; `documents.ts:448-482`; `ocr-result.ts:57-105` | Retries 429/503, rejects `partially_completed` jobs so missing pages are never promoted, and quarantines 0-span outputs (`ocr-correctness.test.ts:144-200`). | **VERIFIED WORKING** |
| **SRV-DOC-10** | Evidence Ledger integration & Two-Stage Provenance Gate (Stage A + Stage B) | `ONCOBRIEF_ENHANCEMENT_PLAN.md` §1, §3 | `documents.ts:207-355`; `ledger.ts:202-275`; `span-validation.ts:44-358` | Stage A (`validateSpans`) is enforced in `insertFact()`. Stage B (`validateCandidateProvenance`) exists in `domain` but is **never called** in `ledger.ts` or `documents.ts`. | **PARTIALLY IMPLEMENTED** |
| **SRV-DOC-11** | OCR provider routing (`OCR_DRIVER=auto`), fallback, and honest UI attribution | `ADR 0021`; `ONCOBRIEF_ENHANCEMENT_PLAN.md` §3 | `ocr-routing.ts:15-39`; `DocumentUploadForm.tsx:188-228`; `ProcessingStatusCard.tsx:373` | `OCR_DRIVER=auto` picks `SarvamVisionOcrAdapter` if key is set, with **no runtime fallback** to local PDF if Sarvam errors. UI runs a fake 4.0s timer claiming `"Sarvam Vision"` even when running `local-pdf`. | **PARTIALLY IMPLEMENTED** |
| **SRV-STT-01** | Sarvam Saaras v3 REST integration (`POST /speech-to-text`, `saaras:v3`) | `docs/cancer_track.md`; `ADR 0025` | `packages/adapters/src/sarvam-voice.ts:80-154`; `app/api/v1/assistant/voice/stt/route.ts` | Multipart form upload, MIME stripping, and timeout implemented and mocked in `providers.test.ts:92-111`, but not live-verified and affected by P0 language bug. | **IMPLEMENTED, NOT LIVE-VERIFIED** |
| **SRV-STT-02** | Browser microphone capture (`MediaRecorder`) & Web Speech API fallback | `useVoice.ts:1-383`; `AssistantPanel.tsx:66-72` | `apps/web/src/components/assistant/useVoice.ts:109-314` | When `configured=true` (`SARVAM_API_KEY` set), `useVoice.ts` uses `MediaRecorder`; if `/api/v1/assistant/voice/stt` fails (503/network), it enters `'error'` state and **never falls back** to browser `SpeechRecognition`. | **PARTIALLY IMPLEMENTED** |
| **SRV-STT-03** | Language-code normalization across 11 locales (`en-IN`, `hi-IN`, `ta-IN`, etc.) | `sarvam-voice.ts:37-65`; `locales.ts:1-15` | `packages/adapters/src/sarvam-voice.ts:59-64` | **BROKEN (P0):** `code.toLowerCase()` produces `'hi-in'`, which fails `isSupportedLanguage('hi-in')` against `'hi-IN'` and forces **all** STT and TTS calls to `'en-IN'`. Also uses `'or-IN'` instead of Sarvam's `'od-IN'`. | **BROKEN** |
| **SRV-STT-04** | Hinglish/Tanglish code-mixed speech & oncology terminology prompting | `docs/cancer_track.md`; `ONCOBRIEF_V3_BUILD_AND_TEST_PLAN.md` | `packages/adapters/src/sarvam-voice.ts:80-154` | Does not pass `mode="codemix"` or `saaras:v4` `keyterms` for oncology vocabulary; forced to `en-IN` by `normalizeLanguageCode()`. | **PARTIALLY IMPLEMENTED** |
| **SRV-STT-05** | STT error/retry (`sarvamSttWithRetry`), RBAC, and input size bounds | `sarvam-voice.ts:207-225`; `stt/route.ts:11-75` | `apps/web/src/app/api/v1/assistant/voice/stt/route.ts:21-75` | `sarvamSttWithRetry()` is dead code (never called by `stt/route.ts`). `POST /stt` has no `can(session.role, ...)` check and no upper byte-size cap before `file.arrayBuffer()`. | **PARTIALLY IMPLEMENTED** |
| **SRV-STT-06** | Transcript integration with Ask OncoBrief & clinical boundary enforcement | `AssistantPanel.tsx:66-72`; `orchestrator.ts:299-335` | `apps/web/src/components/assistant/AssistantPanel.tsx:66-72`; `classify.ts:31-60` | Transcripts route through `sendMessage()` → `runAssistant()` → `classifyIntent()`. English boundary regexes work; Indic-script medical questions bypass regexes to `ambiguous_question`. | **PARTIALLY IMPLEMENTED** |
| **SRV-TTS-01** | Sarvam Bulbul v3 REST integration (`POST /text-to-speech`, `bulbul:v3`, `shubh`) | `ONCOBRIEF_ENHANCEMENT_PLAN.md` §1, §4; `ADR 0025` | `packages/adapters/src/sarvam-voice.ts:156-205`; `scoped-tts.ts:1-60` | Endpoint, header, `bulbul:v3`, and `shubh` are valid, but **BROKEN (P0)** for all 10 Indic languages because `normalizeLanguageCode()` always sends `target_language_code: 'en-IN'`. | **BROKEN** |
| **SRV-TTS-02** | Multi-chunk WAV base64 concatenation & sample rate handling | `sarvam-voice.ts:192-198` | `packages/adapters/src/sarvam-voice.ts:192-198` | `data.audios?.join('')` naively concatenates base64 strings, embedding mid-stream `=` padding and duplicate 44-byte RIFF/WAVE headers on multi-chunk responses; hardcodes `22050` Hz instead of Bulbul v3's `24000` Hz default. | **PARTIALLY IMPLEMENTED** |
| **SRV-TTS-03** | Scoped TTS authorization, consent & source-withdrawal gate, `no-store` headers | `ADR 0025`; `scoped-tts.ts:1-60` | `apps/web/src/lib/scoped-tts.ts:1-60` | Enforces session auth, RBAC `patient:read`, tenant/patient match, `checkMessageGate()`, withdrawn-source blocking (`409`), and `Cache-Control: no-store`. Verified by 10 unit tests (`tts-scope.test.ts`). | **VERIFIED WORKING** |
| **SRV-TTS-04** | Offline browser `speechSynthesis` fallback & synthetic WAV control fixture | `ADR 0025`; `ContinuityAudioPlayer.tsx` | `apps/web/src/components/ContinuityAudioPlayer.tsx:10-12, 70-137` | Honestly labeled in UI, but `SYNTHETIC_DEMO_WAV_BASE64` is a 44-byte **0-sample silent WAV header**, and macOS/Chromium often lacks `localService` Indic voices. | **MOCKED / SIMULATED** |
| **SRV-TTS-05** | Outbound voice note delivery to patients and consented caregivers | `ONCOBRIEF_ENHANCEMENT_PLAN.md` §1, KR4.1; `ADR 0011` | `packages/db/src/services/messages.ts:242-332` | Voice notes are **preview-only** in the browser (`ContinuityAudioPlayer`). `deliverMessage()` sends text-only simulated outbox rows (`simulated = true`). | **MOCKED / SIMULATED** |
| **SRV-TRN-01** | Multilingual message translation / 11-locale template coverage | `ONCOBRIEF_ENHANCEMENT_PLAN.md` KR4.1; `ADR 0025` | `packages/db/src/seed.ts:434-460`; `ContinuityAudioPlayer.tsx:148-174` | **STUB / UI ONLY (P0):** Only 2 templates (`en` and `hi`) exist in `seed.ts`; 0 translation API calls exist; selecting Tamil/Telugu in the audio player does not translate the English/Hindi message. | **STUB / UI ONLY** |
| **SRV-TRN-02** | Bilingual document intelligence (side-by-side original & translated document) | `oncobrief_clinician_platform_design.md` §4 USP 7 | None (`SourcePaneView.tsx` has no translation layer) | Documented in platform design USP 7, never implemented in code. | **PLANNED ONLY** |
| **SRV-LLM-01** | Sarvam-105B LLM & LangChain / Hermes / `WorkflowStateGraph` orchestration | `docs/cancer_track.md`; `ONCOBRIEF_ENHANCEMENT_PLAN.md` §1, §3 | `nvidia-llm.ts`; `bedrock-llm.ts`; `orchestrator.ts` (`workflow-graph.ts` missing) | `Sarvam-105B`, LangChain, Hermes, and `WorkflowStateGraph` are **not used anywhere**. Ask OncoBrief uses `nvidia-llm.ts` (`meta/llama-3.2-11b-vision-instruct`) + deterministic templates; web extraction uses `RuleBasedExtractor`. | **PLANNED ONLY** |

---

## 5. Sarvam Architecture and Actual Data Flow

### 5.1 Actual Document Ingestion & OCR Data Flow (What Really Happens in Code)

```
┌───────────────────────────────────────────────────────────────────────────────────────┐
│ 1. WEB UPLOAD (apps/web/src/components/DocumentUploadForm.tsx)                        │
│    • User selects file and clicks "Upload and ingest"                                 │
│    • UI runs runStepSequence() (lines 188-228): 6 hardcoded setTimeout sleeps         │
│      totaling 4,000 ms, displaying "Extracting tabular text spans with Sarvam Vision" │
│      regardless of which OCR driver is actually configured!                           │
└──────────────────────────────────────────┬────────────────────────────────────────────┘
                                           ▼
┌───────────────────────────────────────────────────────────────────────────────────────┐
│ 2. SERVER ACTION (apps/web/src/lib/actions.ts:403 uploadDocumentAction)               │
│    • Checks session + can(role, 'document:upload')                                    │
│    • Streams up to 25 MB via readBoundedUploadFile()                                  │
│    • Calls createDocument() -> SHA-256 dedup -> writes to LocalFsStorage (.var/...)   │
│    • Calls ingestDocument(q, { storage, ocr: getOcr(), extractor: extractorPort() })  │
│      NOTE: extractorPort() (line 472) hardcodes `new RuleBasedExtractor()`!           │
└──────────────────────────────────────────┬────────────────────────────────────────────┘
                                           ▼
┌───────────────────────────────────────────────────────────────────────────────────────┐
│ 3. OCR ROUTING (packages/db/src/container.ts:57 -> packages/adapters/src/ocr-routing) │
│    • Reads OCR_DRIVER ('auto' in .env) and SARVAM_API_KEY (36 chars in .env)          │
│    • Branch A: If OCR_DRIVER='sarvam' OR (OCR_DRIVER='auto' && SARVAM_API_KEY set):   │
│        -> Instantiates SarvamVisionOcrAdapter(language = OCR_LANGUAGE ?? 'en-IN')     │
│        -> Splits PDF >10 pages into <=10p chunks via pdf-lib (splitPdfIntoBatches)    │
│        -> POST https://api.sarvam.ai/doc-ai/v1/job/digitise (6s rate limit + retry)   │
│        -> Polls GET /doc-ai/v1/job/{id}/status every 1.5s (max 40 polls)              │
│        -> Fetches GET /doc-ai/v1/job/{id}/results?format=json                         │
│        -> Normalizes blocks[] into [0..1] bbox OcrSpanDraft[]                         │
│        -> IF SARVAM FAILS: ingestDocument() catches error and marks document          │
│           ingest_status = 'failed' (NO fallback to LocalMultimodalOcrAdapter!)        │
│    • Branch B: If OCR_DRIVER='local-pdf' OR (OCR_DRIVER='auto' && no cloud keys):     │
│        -> Instantiates LocalMultimodalOcrAdapter                                      │
│        -> Parses PDF FlateDecode streams & CMap tables, groups rows (Δy < 0.012)      │
│        -> For PNG/JPG images or scanned PDFs with /Subtype /Image: returns empty      │
│           or throws ocr_manual_transcription_required -> status = 'quarantined'       │
└──────────────────────────────────────────┬────────────────────────────────────────────┘
                                           ▼
┌───────────────────────────────────────────────────────────────────────────────────────┐
│ 4. EXTRACTION & PROVENANCE GATE (packages/db/src/services/documents.ts & ledger.ts)   │
│    • Persists document_page and immutable text_span rows                              │
│    • Runs classifyDocumentText() (FILENAME_HINTS then TEXT_HINTS, advisory only)      │
│    • Runs RuleBasedExtractor.extract() (English-only regexes)                         │
│    • For each candidate, calls insertFact() (ledger.ts:202):                          │
│        -> Calls validateSpans() (Stage A: exact quote-in-span substring check)        │
│        -> SKIPS validateCandidateProvenance() (Stage B is never called!)              │
│        -> Inserts evidence_fact (state='extracted'), ledger_entry (SHA-256 chained),  │
│           and timeline_event                                                          │
│    • Runs detectAndRecordConflicts() and detectNearDuplicates()                       │
└───────────────────────────────────────────────────────────────────────────────────────┘
```

### 5.2 Actual Voice (Saaras STT & Bulbul TTS) Data Flow

```
┌───────────────────────────────────────────────────────────────────────────────────────┐
│ A. ASK ONCOBRIEF SPEECH-TO-TEXT (useVoice.ts -> /api/v1/assistant/voice/stt)          │
│    1. On mount, useVoice.ts fetches GET /api/v1/assistant/voice/stt -> { configured } │
│    2. User selects language (e.g. 'ta-IN') in AssistantPanel.tsx & clicks Mic button  │
│    3. If configured === true:                                                         │
│         • Captures audio via navigator.mediaDevices.getUserMedia + MediaRecorder      │
│         • Sends Blob + languageCode='ta-IN' to POST /api/v1/assistant/voice/stt       │
│         • Route checks getSession() (no RBAC check, no max size check)                │
│         • Calls sarvamStt({ audioData, languageCode: 'ta-IN' })                       │
│         • BUG (sarvam-voice.ts:60): normalizeLanguageCode('ta-IN') lowercases to      │
│           'ta-in', fails isSupportedLanguage(), and returns 'en-IN'!                  │
│         • Sends POST https://api.sarvam.ai/speech-to-text with model='saaras:v3'      │
│           and language_code='en-IN'                                                   │
│         • BUG (useVoice.ts:257): If POST /stt returns 503, sets state='error' and     │
│           NEVER falls back to browser SpeechRecognition!                              │
└───────────────────────────────────────────────────────────────────────────────────────┘

┌───────────────────────────────────────────────────────────────────────────────────────┐
│ B. CONTINUITY & ASSISTANT TEXT-TO-SPEECH (scoped-tts.ts -> sarvamTts)                 │
│    1. User clicks "Generate & Preview Spoken Voice Note" on /patients/[id]/continuity │
│       with selected locale (e.g. 'ta-IN' or 'hi-IN')                                  │
│    2. POST /api/v1/continuity/tts runs scopedTts('continuity'):                       │
│         • Verifies session, can(role, 'patient:read'), ALLOWED_LOCALES                │
│         • Loads patient_message inside withTenant() RLS transaction                   │
│         • Verifies message.status !== 'withdrawn' and checkMessageGate(q, message.id) │
│         • Resolves authoritative server text: message.bodyRendered (English or Hindi) │
│           (NO translation into selected locale occurs!)                               │
│    3. Calls sarvamTts({ text: resolved.text, languageCode }):                         │
│         • BUG (sarvam-voice.ts:60): normalizeLanguageCode(languageCode) ALWAYS        │
│           returns 'en-IN'!                                                            │
│         • Sends POST https://api.sarvam.ai/text-to-speech with:                       │
│           { text, target_language_code: 'en-IN', speaker: 'shubh', model: 'bulbul:v3',│
│             enable_preprocessing: true }                                              │
│         • Concatenates data.audios?.join('') (corrupts multi-chunk WAV headers)       │
│    4. If Sarvam returns 503: returns { error: { code: 'sarvam_unavailable' },         │
│       fallbackText } with Cache-Control: no-store                                     │
│    5. ContinuityAudioPlayer offers Browser Speech Synthesis (if localService voice    │
│       installed) or loads SYNTHETIC_DEMO_WAV_BASE64 (44-byte silent WAV header)       │
└───────────────────────────────────────────────────────────────────────────────────────┘
```

### 5.3 Architectural Division of Responsibility Across LLMs and Deterministic Engines
- **Is `Sarvam-105B` used anywhere?** **No.** Despite early research docs (`docs/cancer_track.md`) proposing `sarvam-105b`, zero code references `sarvam-105b` or Sarvam's `/v1/chat/completions` endpoint.
- **What actually handles reasoning, extraction, and drafting?**
  1. **Document Fact Extraction:** `RuleBasedExtractor` (`packages/adapters/src/rule-based-extractor.ts`) runs on all synchronous web uploads and demo seeds. `BedrockLlmProvider` (`packages/adapters/src/bedrock-llm.ts`, using AWS Bedrock Converse API with forced tool use `emit_operational_facts`) is only wired in the async cloud worker (`apps/worker/src/ports.ts:61`).
  2. **Ask OncoBrief Assistant:** `classify.ts` runs deterministic regexes first, falling back to a 1-token call to `nvidia-llm.ts` (`meta/llama-3.2-11b-vision-instruct` via `https://integrate.api.nvidia.com/v1/chat/completions`). `orchestrator.ts` runs deterministic PostgreSQL queries and formats the answer via `nvidia-llm.ts` or, if unconfigured, `synthesizeDeterministicGroundedAnswer()`.
  3. **Clinician Productivity Studio & OPD Waitlist Optimizer:** 100% deterministic TypeScript (`draft-generator.ts` and `slot-optimizer.ts`). Zero LLM calls.
- **Would replacing the LLM with `Sarvam-105B` materially improve the workflow?**
  **No for core English record operations, and only marginally for Indic Q&A.** The safety and value of OncoBrief come from deterministic span validation, deterministic conflict comparators, and deterministic template rendering—not open-ended LLM generation. Adding `Sarvam-105B` just to claim another Sarvam model would add latency and token cost without fixing the actual blockers. However, using **Sarvam Translate (`mayura:v1` or `sarvam-translate:v1`)** or **pre-translated clinician-approved templates** for the 11 locales is essential for patient/caregiver continuity.

---

## 6. OCR Evaluation (`SarvamVisionOcrAdapter` & `LocalMultimodalOcrAdapter`)

### 6.1 Detailed Capability & Protocol Audit
1. **Endpoint & Wire Protocol (`packages/adapters/src/sarvam-vision-ocr.ts:127-143`):**
   - Posts multipart `FormData` (`file`, `language`, `output_format: 'json'`) to `POST https://api.sarvam.ai/doc-ai/v1/job/digitise` with header `api-subscription-key: this.apiKey`.
   - Polls `GET /doc-ai/v1/job/{id}/status` and fetches `GET /doc-ai/v1/job/{id}/results?format=json`.
   - **Protocol Risk Identified Against Official Sarvam Docs:** Per [Sarvam Document Intelligence Overview](https://docs.sarvam.ai/api/api-guides-tutorials/document-intelligence/overview) and [Digitise API Docs](https://docs.sarvam.ai/api-reference/doc-ai/job/digitise), Sarvam's Document AI `parse` / `digitise` pipeline delivers full-document outputs via `GET /doc-ai/v1/job/{id}/download-url` (a signed URL to a `.zip` containing Markdown/HTML and `metadata/page_NNN.json`), whereas `GET /doc-ai/v1/job/{id}/results` is primarily documented for `extract`, `classify`, and `split` pipelines (or structured `parse` results). Because `SarvamVisionOcrAdapter` has only been tested against a unit-test mock returning `{ status: 'completed', documents: [{ pages: [{ page_number: 1, content: '{"width":1000,"height":2000,"blocks":[...]}' }] }] }` (`ocr-correctness.test.ts:74-93`), **its response parser has never been verified against a live Sarvam `digitise` response payload**.
2. **Multi-Page PDF Batching & Restart Safety (`sarvam-vision-ocr.ts:64-86, 109-115`):**
   - Respects Sarvam Vision's **10-page hard cap per job** by loading the PDF with `pdf-lib` (`PDFDocument.load`), copying up to 10 pages per batch into new `PDFDocument` instances (`useObjectStreams: false`), and encoding the batch job IDs, page offsets (`i * 10`), and page counts into a stateless `sarvam:<base64url>` job token.
   - Tested with a 23-page synthetic PDF (`10 + 10 + 3` pages), preserving exact page content and global page numbering `1..23`.
3. **Rate Limiting & Synchronous Timeout Hazard (`sarvam-vision-ocr.ts:89-93`):**
   - `request()` enforces `minIntervalMs ?? 6000` (1 request every 6 seconds = 10 requests/minute, matching [Sarvam Vision's 10 req/min rate limit](https://docs.sarvam.ai/api/getting-started/models/sarvam-vision)).
   - **Hazard:** Because `request()` applies the 6-second delay to **every** HTTP call—including `GET /status` and `GET /results`—a single 1-page PDF requires at least 3 HTTP calls (`POST /digitise`, `GET /status`, `GET /results`), taking a minimum of **12–18 seconds**, and a 23-page PDF (3 batches × 3 calls = 9 calls) takes **at least 48–54 seconds**, easily timing out a synchronous Next.js Server Action (`uploadDocumentAction`).
4. **Bounding-Box Normalization (`sarvam-vision-ocr.ts:275-336`):**
   - Validates `block.bbox` as `[x0, y0, x1, y1]`, normalizes pixel coordinates by page `width` and `height` when values exceed `1`, and verifies `0 <= x, y` and `x + w <= 1.001`. Rejects missing or malformed geometry with `ocr_sarvam_invalid_bbox` rather than inventing coordinates.

### 6.2 OCR Test Campaign Matrix (Executed Unit/Integration Evidence vs. Unverified Live Cases)

*Note: We report exact observed results from the repository's test suite and static code paths. No performance metrics or Character/Word Error Rates (CER/WER) are invented.*

| Test ID | Input Document Scenario | Expected Behavior | Actual Observed Behavior | Result | Evidence (`File:Line` / Log) | Severity |
| :--- | :--- | :--- | :--- | :---: | :--- | :---: |
| **OCR-01** | **Clear Digital English PDF** (`02_CBC_with_Differential_02_Jun_2026_DEMO.pdf`, 1 page, 4-column lab table) | Extract text, preserve row alignment (`Hb 11.4 g/dL`, `WLC 7,200`, `Platelets 240,000`), normalized `[0..1]` bbox, SHA-256 `5b8c3be7f550ba59...`. | `LocalMultimodalOcrAdapter` extracts all lab rows with `>=8` spans and valid `[0..1]` bounding boxes; `RuleBasedExtractor` promotes dated lab facts. | **PASS** | `multimodal-intake.test.ts:195-232`; `final-verify.log:55` | — |
| **OCR-02** | **Scanned Image-Only English PDF** (2-page PDF where Page 2 contains an embedded PNG `/Subtype /Image` and no text stream) | In local mode: refuse to guess and quarantine with `manual_transcription_required`. In Sarvam mode: OCR via `digitise`. | `LocalMultimodalOcrAdapter` throws `ocr_manual_transcription_required`; `ingestDocument()` sets `ingest_status = 'quarantined'`. Live Sarvam OCR not executed. | **PASS (Local Quarantine) / NOT EVALUABLE (Live Sarvam)** | `ocr-correctness.test.ts:331-351`; `ocr-ingestion.test.ts:69-88` | P1 |
| **OCR-03** | **Tamil (`ta-IN`) or Hindi (`hi-IN`) Document** | Pass document language to Sarvam OCR, extract Indic text spans, and extract oncology facts into Evidence Ledger. | `SarvamVisionOcrAdapter.processDocument(buf, mime, 'ta-IN')` sends `language='ta-IN'` in unit test (`ocr-correctness.test.ts:60`), **BUT** `ingestDocument()` (`documents.ts:436`) never passes `language`, and `RuleBasedExtractor` extracts **0 facts** from Tamil/Hindi text. | **FAIL (End-to-End Fact Extraction)** | `documents.ts:436-441`; `rule-based-extractor.ts:59-515` | **P0** |
| **OCR-04** | **Mixed-Language Document** (English headers + Hindi/Tamil clinical notes) | Extract both English and Indic spans and promote supported facts. | English regexes in `RuleBasedExtractor` match only English lines; Indic lines are stored in `text_span` (if OCR succeeds) but ignored by extraction. | **PARTIAL** | `rule-based-extractor.ts:59-515` | P1 |
| **OCR-05** | **Multi-Page PDF > 10 Pages** (23-page synthetic PDF) | Split into 3 batches (`10 + 10 + 3`), submit each once, preserve page order `1..23` and global offsets. | `splitPdfIntoBatches()` produces 3 valid PDFs; `getResults()` reassembles 23 pages in exact order `1..23` with `charStart`/`charEnd` intact. | **PASS (Unit / Mocked Transport)** | `ocr-correctness.test.ts:24-45, 240-308` | — |
| **OCR-06** | **JPEG / PNG Smartphone Scan** | Local mode: return empty spans and quarantine. Sarvam mode: accept `image/png` and `image/jpeg`. | `LocalMultimodalOcrAdapter.extractImage()` returns `{ plainText: '', spans: [] }` (`ocr-correctness.test.ts:8-15`). `SarvamVisionOcrAdapter.transcodeIfNeeded()` accepts PNG/JPEG. Live image accuracy not measured (no ground-truth dataset or live call). | **PARTIAL / NOT EVALUABLE (Live)** | `local-multimodal-ocr.ts:471-474`; `sarvam-vision-ocr.ts:51-63` | P1 |
| **OCR-07** | **TIFF / WebP Scan** (`image/tiff`, `image/webp`) | Transcode to PNG/PDF (per V3 Plan Task 2.3) or reject at upload validation. | `upload-url/route.ts:23-24` and `DocumentUploadForm.tsx:419` allow `.tiff` and `.webp`, but `SarvamVisionOcrAdapter.transcodeIfNeeded()` throws `ocr_unsupported_media`, causing ingestion to fail. | **FAIL (Contract Mismatch)** | `upload-url/route.ts:23-24`; `sarvam-vision-ocr.ts:51-63` | P2 |
| **OCR-08** | **Conflicting Document Dates Across Facilities** (`DEMO-001`: Pathology `12 June 2025` vs. Discharge `3 July 2025`) | Extract both surgery dates, create `conflict_set`, transition both facts to `conflicting`, block readiness (`blocked`). | Both dates extracted and linked to respective spans; `detectAndRecordConflicts()` opens conflict set; Reconciliation Room displays both side by side. | **PASS** | `packages/db/test/oncology-fixtures.test.ts`; `demo-flow.spec.ts` | — |
| **OCR-09** | **Missing Pages / `partially_completed` Provider Job** | Reject partial job (`ocr_sarvam_incomplete`) and never promote incomplete document as complete. | `SarvamVisionOcrAdapter.getJob()` returns `FAILED` on `partially_completed`; `handleOcrResult` marks job failed with 0 facts promoted. | **PASS** | `ocr-correctness.test.ts:145-168`; `ocr-result.test.ts:108-115` | — |

---

## 7. Saaras Speech-to-Text (STT) Evaluation

### 7.1 Implementation & Protocol Analysis (`packages/adapters/src/sarvam-voice.ts:80-154`)
- **Endpoint & Model:** Sends `POST https://api.sarvam.ai/speech-to-text` with header `api-subscription-key`, multipart `file` (`audio.webm` / `audio.mp4` / `audio.wav`), `model: 'saaras:v3'`, and `language_code`.
- **Compatibility with Current Official Sarvam Docs:**
  - Per [Sarvam Saaras Docs](https://docs.sarvam.ai/api/getting-started/models/saaras), `/speech-to-text` is the current REST endpoint (cap: 30 seconds per real-time REST request). `saaras:v3` is supported; `saaras:v4` is now the default recommended model and adds `keyterms` (up to 50 domain-specific terms) and Global English support.
- **Four Concrete Defects Identified in STT:**
  1. **P0 — `normalizeLanguageCode()` Forces `language_code = 'en-IN'` (`sarvam-voice.ts:59-64`):**
     ```ts
     export function normalizeLanguageCode(code: string): SupportedLanguage {
       const normalized = code.toLowerCase().replace(/_/g, '-');
       if (isSupportedLanguage(normalized)) return normalized;
       // Default to English India
       return 'en-IN';
     }
     ```
     Because `SUPPORTED_LANGUAGES` contains `'hi-IN'`, `'ta-IN'`, `'te-IN'`, etc. (with uppercase `-IN`), `normalized` (`'hi-in'`) never matches `isSupportedLanguage(normalized)`, so **every call to `sarvamStt()` sends `language_code = 'en-IN'`**!
  2. **P1 — Odia Language Code Mismatch (`sarvam-voice.ts:49`, `useVoice.ts:28`, `locales.ts:12`):**
     OncoBrief uses `'or-IN'` for Odia, whereas [Sarvam Saaras and Bulbul](https://docs.sarvam.ai/api/getting-started/models/saaras) require `'od-IN'`.
  3. **P1 — Broken Client Fallback When `SARVAM_API_KEY` Is Set (`useVoice.ts:226-264`):**
     Because `.env` has `SARVAM_API_KEY` set (36 chars), `GET /api/v1/assistant/voice/stt` returns `{ configured: true }`. In `useVoice.ts:226`, `startListening()` enters the `MediaRecorder` branch and records a blob. If `POST /api/v1/assistant/voice/stt` returns HTTP `503` (e.g., invalid key, rate limit, or network failure), `catch (err)` at line 257 sets `setError('Voice transcription failed: ...')` and `setState('error')`—**it never falls back to `startBrowserRecognition()`**.
  4. **P1 — Missing Retry Wiring, Missing RBAC, and Unbounded ArrayBuffer in `/api/v1/assistant/voice/stt/route.ts`:**
     - `sarvamSttWithRetry()` (`sarvam-voice.ts:207-225`) is never called by `stt/route.ts:57` (which calls `sarvamStt()` with 0 retries).
     - `stt/route.ts:21-38` checks `getSession()` but does **not** check `can(session.role, 'patient:read')`, and calls `await file.arrayBuffer()` without checking `file.size <= MAX_AUDIO_BYTES`, allowing an authenticated user to buffer a huge payload into memory or submit >30s audio that Sarvam's REST endpoint rejects with HTTP 400.

### 7.2 STT Test Campaign Matrix

| Test ID | Input Scenario | Expected Behavior | Actual Observed Behavior | Result | Evidence (`File:Line`) | Severity |
| :--- | :--- | :--- | :--- | :---: | :--- | :---: |
| **STT-01** | **English (`en-IN`) Audio Transcription** (Mocked HTTP 200) | Send `language_code='en-IN'`, return transcript. | Sends `language_code='en-IN'` (by fallback coincidence) and returns transcript. | **PASS (Mocked)** | `providers.test.ts:92-106` | — |
| **STT-02** | **Hindi (`hi-IN`) & Tamil (`ta-IN`) Audio Transcription** | Send `language_code='hi-IN'` or `'ta-IN'` to `POST /speech-to-text`. | `normalizeLanguageCode('hi-IN')` returns `'en-IN'`; `FormData` sends `language_code='en-IN'` to Sarvam API! (`providers.test.ts:103` did not assert on the outbound `FormData` fields, hiding the bug). | **FAIL** | `sarvam-voice.ts:59-64` | **P0** |
| **STT-03** | **Odia (`or-IN` vs `od-IN`) Audio Transcription** | Map UI `'or-IN'` to Sarvam's `'od-IN'` BCP-47 code. | Neither `'or-IN'` nor `'od-IN'` reaches Sarvam; both become `'en-IN'`. | **FAIL** | `sarvam-voice.ts:49, 59-64` | **P1** |
| **STT-04** | **Hinglish / Tanglish Code-Mixed Oncology Query** | Transcribe code-mixed query with medical/admin terms (`histopathology`, `PET-CT`, `OPD`). | No `mode` (`codemix`/`transcribe`) or `saaras:v4` `keyterms` configured; language forced to `'en-IN'`. Live WER not evaluable in sandbox. | **PARTIAL / NOT EVALUABLE (Live)** | `sarvam-voice.ts:80-115` | P2 |
| **STT-05** | **Silence / Short Audio (< 100 bytes)** | Reject audio < 100 bytes before calling Sarvam API. | `useVoice.ts:251` (`blob.size < 100`) and `stt/route.ts:39` (`arrayBuffer.byteLength < 100`) return HTTP `400 audio_too_short`. | **PASS** | `stt/route.ts:38-41`; `useVoice.ts:251` | — |
| **STT-06** | **Missing API Key / Provider 503 Failure** | Return HTTP `503 sarvam_unavailable` and fall back to browser `SpeechRecognition`. | Server returns `503 sarvam_unavailable` (`providers.test.ts:108-111`), **but** if `configured` was `true` at mount, `useVoice.ts:257` displays an error instead of falling back to browser recognition. | **FAIL (Client Fallback)** | `useVoice.ts:226-264` | **P1** |
| **STT-07** | **Transcript Boundary Safety** (`"What chemo dose should this patient receive?"`) | Transcribed text goes through Ask OncoBrief and is refused by `classifyIntent()`. | `onTranscript` calls `sendMessage(text)` (`AssistantPanel.tsx:69`), which hits `classifyIntent()` and returns the non-diagnostic boundary refusal. | **PASS** | `AssistantPanel.tsx:66-72`; `assistant.spec.ts:73-83` | — |

---

## 8. Bulbul Text-to-Speech (TTS) Evaluation

### 8.1 Implementation & Protocol Analysis (`packages/adapters/src/sarvam-voice.ts:156-205`, `apps/web/src/lib/scoped-tts.ts`)
- **Endpoint, Model & Speaker:** Sends `POST https://api.sarvam.ai/text-to-speech` with JSON body `{ text, target_language_code, speaker: 'shubh', model: 'bulbul:v3', enable_preprocessing: true }`.
- **Compatibility with Current Official Sarvam Docs:**
  - Verified against [Sarvam Voices Docs](https://docs.sarvam.ai/api/api-guides-tutorials/text-to-speech/voices): `bulbul:v3` supports all 11 languages (`en-IN`, `hi-IN`, `bn-IN`, `ta-IN`, `te-IN`, `kn-IN`, `ml-IN`, `mr-IN`, `gu-IN`, `pa-IN`, `od-IN`), and `shubh` is a valid lowercase male speaker on `bulbul:v3` across all 11 languages.
- **Four Concrete Defects Identified in TTS & Continuity Audio:**
  1. **P0 — `normalizeLanguageCode()` Always Sends `target_language_code: 'en-IN'` (`sarvam-voice.ts:160`):**
     Just like STT, `sarvamTts()` calls `normalizeLanguageCode(options.languageCode)`, which lowercases `'ta-IN'` to `'ta-in'`, fails `isSupportedLanguage()`, and sends `target_language_code: 'en-IN'` on every single TTS call.
  2. **P0 — Language Selector Changes Only the Requested Voice Tag, Never Translates the Message (`ContinuityAudioPlayer.tsx:148-174`, `seed.ts:434-460`):**
     On `/patients/[id]/continuity`, `DEMO-003`'s delivered reminder is in English (`"Your appointment is on 2025-05-15 at Surgical Oncology OPD..."`). When a coordinator selects `Tamil (தமிழ்) · ta-IN` in `ContinuityAudioPlayer` and clicks `Generate & Preview Spoken Voice Note`, `scoped-tts.ts:39` loads `message.bodyRendered` (the English string) and passes it to `sarvamTts` without translation. While `ContinuityAudioPlayer.tsx:174` includes a small disclaimer (`"Reads existing message text. Locale selects a voice; it does not translate the message"`), `seed.ts` only seeds `'en'` and `'hi'` templates—so a coordinator **cannot even compose a Tamil, Telugu, Kannada, Malayalam, Bengali, Marathi, Gujarati, Punjabi, or Odia message**!
  3. **P1 — Multi-Chunk WAV Base64 Concatenation Corrupts Audio (`sarvam-voice.ts:194`):**
     ```ts
     const data = (await response.json()) as { audios?: string[]; audio_base64?: string };
     const audioBase64 = data.audios?.join('') ?? data.audio_base64 ?? '';
     ```
     Sarvam's `/text-to-speech` REST API returns `audios: string[]`, where each item is a standalone base64-encoded WAV file. Joining two base64 strings directly (`chunk1 + chunk2`) leaves base64 padding characters (`=`) in the middle of the string (causing browser `data:audio/wav;base64,...` decoders to truncate or fail) and leaves a second 44-byte `RIFF....WAVEfmt ` header in the middle of the PCM stream (producing a loud click or stopping playback after chunk 1).
  4. **P2 — Silent 44-Byte Control WAV in Offline Fallback (`ContinuityAudioPlayer.tsx:11-12`):**
     `SYNTHETIC_DEMO_WAV_BASE64 = 'UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA='` decodes to exactly 44 bytes (`RIFF` size `36`, `WAVEfmt ` 8000 Hz mono 8-bit PCM, `data` chunk size `0`). It contains **0 audio samples (0.00 seconds)**. While honestly labeled in the UI as `"Synthetic Demo Audio — silent control fixture, no speech"`, clicking play produces zero sound.

### 8.2 TTS Test Campaign Matrix

| Test ID | Input Scenario | Expected Behavior | Actual Observed Behavior | Result | Evidence (`File:Line`) | Severity |
| :--- | :--- | :--- | :--- | :---: | :--- | :---: |
| **TTS-01** | **Authorized Assistant Answer Read-Aloud** | Verify conversation ownership and source document access, then synthesize speech. | `scopedTts('assistant')` verifies `getConversation`, matches exact `saved.content`, verifies every source document exists, and calls `sarvamTts`. | **PASS (Auth Gate)** | `scoped-tts.ts:41-50`; `tts-scope.test.ts:22, 34-39` | — |
| **TTS-02** | **Approved Appointment Reminder & Caregiver Preview** | Verify `getMessage`, tenant/patient match, and `checkMessageGate()`, then synthesize authoritative `message.bodyRendered` (ignoring client-tampered text). | `scopedTts('continuity')` ignores any client-supplied `text`, verifies `checkMessageGate()`, and synthesizes `message.bodyRendered` with `Cache-Control: no-store`. | **PASS (Auth & Privacy Gate)** | `scoped-tts.ts:33-40`; `tts-scope.test.ts:19-32` | — |
| **TTS-03** | **Tamil (`ta-IN`) / Hindi (`hi-IN`) Playback** | Send `target_language_code: 'ta-IN'` or `'hi-IN'` with matching language text to Sarvam Bulbul v3. | `normalizeLanguageCode()` rewrites `'ta-IN'` and `'hi-IN'` to `'en-IN'`, and no Tamil template exists in `seed.ts`. | **FAIL** | `sarvam-voice.ts:59-64, 160`; `seed.ts:434-460` | **P0** |
| **TTS-04** | **Missing or Withdrawn Source Document** (ABDM consent revoked or message withdrawn) | Block TTS synthesis with HTTP `409 source_unavailable` and omit `fallbackText`. | Returns HTTP `409` `{ error: { code: 'source_unavailable' } }`; `sarvamTts` is never called and no `fallbackText` is leaked. | **PASS** | `scoped-tts.ts:36-38, 46-48`; `tts-scope.test.ts:21, 34-39` | — |
| **TTS-05** | **Unauthorized Conversation / Arbitrary Client Text / Cross-Tenant Message** | Reject with HTTP `400`, `401`, `403`, or `404` before calling Sarvam. | All rejected cleanly (`400` on missing `conversationId`, `404` on wrong patient/tenant or unsaved text). | **PASS** | `tts-scope.test.ts:17-23`; `phase5-continuity-voice.test.ts:75-115` | — |
| **TTS-06** | **Unapproved or Tampered Message Source** (Backing fact is `extracted` or `conflicting`) | `checkMessageGate()` returns `ok: false` -> HTTP `409 source_unavailable`. | Blocked with HTTP `409` before calling `sarvamTts`. | **PASS** | `scoped-tts.ts:37-38`; `continuity-grounding.test.ts:20-34` | — |
| **TTS-07** | **API Unavailability (`503`) & Browser / Synthetic Fallback** | Return HTTP `503` with `fallbackText` (for authorized messages only) and show honest fallback controls in UI. | Returns `503` with `fallbackText`; Playwright E2E test 2 (`phase5-continuity-voice.spec.ts:71-104`) verifies fallback note and labeled synthetic demo audio element. | **PASS (Honest Labeling)** | `scoped-tts.ts:55-57`; `phase5-continuity-voice.spec.ts:71-104` | — |
| **TTS-08** | **Multiple Audio Response Chunks (`data.audios = [wav1, wav2]`)** | Merge PCM data into a single valid WAV buffer with updated RIFF/data headers. | `data.audios.join('')` produces invalid mid-stream base64 padding and duplicate WAV headers. | **FAIL** | `sarvam-voice.ts:194` | **P1** |

---

## 9. Adversarial Technical Audit Findings (15 Hypotheses Investigated)

We independently tested all 15 adversarial hypotheses against the codebase. Below are the exact verified findings, classified by severity (`P0`–`P3`) with file and line references:

| ID | Adversarial Hypothesis | Verdict | Severity | Exact File & Line References | Reproducible Technical Evidence |
| :--- | :--- | :---: | :---: | :--- | :--- |
| **ADV-01** | **Language-code normalization & BCP-47 casing mismatch** | **CONFIRMED BUG** | **P0** | `packages/adapters/src/sarvam-voice.ts:40-64`; `apps/web/src/lib/locales.ts:12`; `packages/db/src/seed.ts:439, 449` | `normalizeLanguageCode(code)` (line 60) runs `code.toLowerCase()`, turning `'hi-IN'` into `'hi-in'`, which fails `SUPPORTED_LANGUAGES.includes('hi-in')` and returns `'en-IN'`. Additionally, Odia is `'or-IN'` instead of Sarvam's `'od-IN'`, and `seed.ts` stores template locales as `'en'` and `'hi'` instead of `'en-IN'` and `'hi-IN'`, causing `ContinuityAudioPlayer`'s `initialLocale={m.locale}` (`'en'`/`'hi'`) to not match any `<option value="en-IN">` in the `<select>`. |
| **ADV-02** | **API endpoint, payload, response-schema, model-version, and speaker compatibility** | **CONFIRMED RISK** | **P1** | `packages/adapters/src/sarvam-vision-ocr.ts:141, 179-214`; `packages/adapters/src/sarvam-voice.ts:34-36, 156-198` | `saaras:v3` (`/speech-to-text`), `bulbul:v3` (`/text-to-speech`), and speaker `shubh` are valid. However, `SarvamVisionOcrAdapter` calls `POST /doc-ai/v1/job/digitise` with `output_format: 'json'` and expects `GET /doc-ai/v1/job/{id}/results?format=json` to return `documents[0].pages[].content` with JSON blocks, whereas Sarvam's official docs specify fetching Parse/Digitise outputs via `GET /doc-ai/v1/job/{id}/download-url` (ZIP containing `metadata/page_NNN.json`). |
| **ADV-03** | **Document AI batch integrity, polling, job persistence, partial failures, and provenance** | **VERIFIED SOUND (With Timeout Risk)** | **P2** | `packages/adapters/src/sarvam-vision-ocr.ts:64-86, 89-93, 155-218` | Batch splitting (`<=10` pages), base64url job persistence (`sarvam:...`), `partially_completed` rejection, and `[0..1]` bbox normalization are well-engineered. However, `minIntervalMs: 6000` sleeps 6 seconds before **every** status poll and results fetch, causing multi-batch synchronous uploads to take 48+ seconds. |
| **ADV-04** | **TTS response handling, base64/audio chunk concatenation, and sample-rate assumptions** | **CONFIRMED BUG** | **P1** | `packages/adapters/src/sarvam-voice.ts:192-198` | `data.audios?.join('')` concatenates base64 strings directly without decoding base64 or stripping the 44-byte RIFF/WAVE header on subsequent chunks, and hardcodes `sampleRate: 22050` (Bulbul v3 defaults to `24000`). |
| **ADV-05** | **Does error handling mislabel a failed provider request as successful?** | **VERIFIED SAFE** | — | `packages/adapters/src/sarvam-vision-ocr.ts:104, 169`; `packages/db/src/services/documents.ts:448-465`; `apps/web/src/lib/scoped-tts.ts:55-57` | Neither OCR nor TTS mislabels a failed HTTP call as successful. Failed OCR marks `ingest_status = 'failed'` (or `'quarantined'`); failed TTS returns HTTP `503 sarvam_unavailable`. |
| **ADV-06** | **Does a Sarvam failure cause the entire upload or assistant workflow to fail unnecessarily?** | **CONFIRMED BUG** | **P0** | `packages/adapters/src/ocr-routing.ts:15-21`; `packages/db/src/services/documents.ts:435-465`; `apps/web/src/components/assistant/useVoice.ts:226-264` | **Yes, in two places:** (1) With `OCR_DRIVER=auto` and `SARVAM_API_KEY` set in `.env`, `createOcrAdapter()` returns `SarvamVisionOcrAdapter` with no fallback to `LocalMultimodalOcrAdapter` if Sarvam fails—so even uploading a clean digital PDF fails completely if the key is invalid or offline. (2) In `useVoice.ts:226-264`, when `configured=true`, a failed `POST /api/v1/assistant/voice/stt` enters `'error'` state and never falls back to browser `SpeechRecognition`. |
| **ADV-07** | **Is the selected OCR provider really called from every intended upload route?** | **VERIFIED** | **P1** | `apps/web/src/lib/actions.ts:415, 513, 527`; `packages/db/src/container.ts:57-73`; `apps/worker/src/ports.ts:50-60` | Both `uploadDocumentAction` (`actions.ts:415`) and worker `handleDocumentIngest` (`document-ingest.ts:138`) call `getOcr()` / `buildAsyncOcr()`. However, `actions.ts:472` and `container.ts:75` hardcode `RuleBasedExtractor()`, so LLM extraction is **never** called on web uploads. |
| **ADV-08** | **Does language switching change only the voice rather than the message language?** | **CONFIRMED BUG** | **P0** | `apps/web/src/components/ContinuityAudioPlayer.tsx:148-174`; `apps/web/src/lib/scoped-tts.ts:39`; `packages/db/src/seed.ts:434-460` | **Yes.** `scoped-tts.ts:39` always returns `message.bodyRendered` (which is only English or Hindi because `seed.ts` only seeds `'en'` and `'hi'` templates). Selecting Tamil (`ta-IN`) in `ContinuityAudioPlayer` does not translate the message, and due to ADV-01, doesn't even switch the voice from `'en-IN'`. |
| **ADV-09** | **Are browser fallbacks accurate, honestly labeled, and functional?** | **PARTIAL** | **P2** | `apps/web/src/components/ContinuityAudioPlayer.tsx:10-12, 85-137, 224-260` | Labels are 100% honest (`"Provider Notice: Sarvam TTS is unavailable..."` and `"Synthetic Demo Audio — silent control fixture, no speech"`). However, `SYNTHETIC_DEMO_WAV_BASE64` is a 0-sample silent WAV header, and `window.speechSynthesis.getVoices()` requires `candidate.localService === true`, which rejects network/Google voices in Chrome and leaves 0 voices in headless/default Chromium. |
| **ADV-10** | **Does the demo inadvertently use hardcoded fixture output while claiming live AI?** | **CONFIRMED BUG** | **P0** | `apps/web/src/components/DocumentUploadForm.tsx:188-228`; `apps/web/src/components/ProcessingStatusCard.tsx:94-130, 371-379` | **Yes.** `DocumentUploadForm.tsx:219` runs a hardcoded 4.0-second `setTimeout` sequence displaying `"Extracting tabular text spans with Sarvam Vision…"`, and `ProcessingStatusCard.tsx:373` displays `"Sarvam Vision (OCR): Active"` and `"12.5s"` even when `OCR_DRIVER=local-pdf`! |
| **ADV-11** | **Is a text-only or simulated delivery adapter presented as real patient outreach?** | **VERIFIED HONEST** | — | `packages/adapters/src/simulated-delivery.ts`; `apps/web/src/app/(app)/patients/[id]/continuity/page.tsx:54, 307` | No. The UI prominently badges every message and the page header with `"simulated delivery · verified administrative facts only"` (`continuity/page.tsx:54, 307`). |
| **ADV-12** | **Do tests genuinely exercise integration behavior rather than asserting component existence?** | **PARTIAL** | **P1** | `apps/web/src/lib/assistant/providers.test.ts:92-129`; `packages/adapters/test/ocr-correctness.test.ts`; `packages/db/test/*.test.ts` | Database and domain tests (`886` tests) genuinely exercise real PostgreSQL RLS, triggers, and hash chains. However, `providers.test.ts:103, 123` mocked `fetch(() => new Response(...))` **without inspecting the outbound request body**, which is why the `normalizeLanguageCode()` `'hi-in'` → `'en-IN'` bug went undetected! And Milestone A/B (`7b2edec`) had 0 E2E tests on `/workspace`, `/appointments`, and `/tumor-board`, missing the `'complete'` vs `'ready'` and `ananya.mukhopadhyay@rci.invalid` bugs. |
| **ADV-13** | **Is sensitive information exposed through request logs, errors, caches, or improperly scoped endpoints?** | **MOSTLY SAFE (1 Minor Gap)** | **P2** | `apps/web/src/lib/scoped-tts.ts:9, 32-50`; `packages/db/src/services/audit.ts:119-182`; `apps/web/src/app/api/v1/assistant/voice/stt/route.ts:69` | `scoped-tts.ts` sets `Cache-Control: no-store` and prevents arbitrary text synthesis; `audit.ts` redacts 35+ PHI keys (`transcript`, `audioBase64`, `phone`, `verbatim_quote`); `sarvam-vision-ocr.ts:104` strips response body text from errors. Minor gap: `stt/route.ts:69` logs `console.error('[STT API] Sarvam transcription failed:', error)` and returns `error.message` to the client, and `GET /api/v1/assistant/voice/stt` is unauthenticated. |
| **ADV-14** | **Is `SARVAM_API_KEY` exposed client-side, stored insecurely, or included in build artifacts?** | **VERIFIED SAFE** | — | `packages/adapters/src/sarvam-voice.ts:71`; `packages/adapters/src/sarvam-vision-ocr.ts:44`; `.gitignore` | `SARVAM_API_KEY` has no `NEXT_PUBLIC_` prefix, is read lazily on the server (`process.env.SARVAM_API_KEY`), is git-ignored in `.env`, and our grep across `apps/web/.next/` confirmed only server/action module references—never the key value or client exposure. |
| **ADV-15** | **Is the implementation susceptible to unsupported evidence, hallucination, silent omissions, or unauthorized data transfer?** | **CONFIRMED GAPS** | **P0 / P1** | `packages/db/src/services/ledger.ts:218`; `apps/web/src/app/(app)/tumor-board/page.tsx:246, 354`; `apps/web/src/app/(app)/patients/[id]/encounters/[encounterId]/page.tsx` | (1) **P0:** Milestone B (`7b2edec`) added unanchored free-text `clinicalStaging` (`cT2aN1M0 Stage IIB`) and `recommendationNotes` on `/tumor-board` and `/encounters` outside the Evidence Ledger. (2) **P1:** `insertFact()` in `ledger.ts:218` calls Stage A (`validateSpans`) but never calls Stage B (`validateCandidateProvenance`), so if an LLM extractor proposes a valid quote `"Report Date: 14/05/2026"` with a hallucinated value `"2026-09-01"`, Stage A passes and inserts the wrong date! |

---

## 10. Clinical Safety, Privacy, and Health-a-thon Scope Audit

### 10.1 Guardrail-by-Guardrail Verification

| Health-a-thon Safety & Privacy Guardrail | Verification Result | Code Evidence & Audit Finding |
| :--- | :---: | :--- |
| **1. Does not independently diagnose cancer** | **PASS** | `fact-types.ts` only records `diagnosis_text.as_written` linked to a verbatim document span. `classify.ts:31-60` refuses diagnostic questions. |
| **2. Does not interpret pathology or radiology findings** | **PASS** | `dicom-header-parser.ts` extracts only non-pixel administrative tags (`Modality`, `StudyDate`) and scrubs `PatientName`; `longitudinal-review.ts` computes only arithmetic lab deltas (`latest - previous`). |
| **3. Does not assign or infer cancer staging** | **CONDITIONAL FAIL (P0 in Milestone B)** | V3/V4 core only records `stage_text.as_written` from source spans. **However**, `apps/web/src/app/(app)/tumor-board/page.tsx:246` (added in commit `7b2edec`) renders `<input name="clinicalStaging" placeholder="e.g. cT2aN1M0 Stage IIB" />` allowing manual entry of unanchored staging outside the Evidence Ledger. |
| **4. Does not recommend treatment or drug dosages** | **CONDITIONAL FAIL (P0 in Milestone B)** | Ask OncoBrief and Studio block treatment recommendations (`clinical-boundary.ts`). **However**, `tumor-board/page.tsx:354` (`placeholder="Board treatment recommendations, trial eligibility..."`) and `encounters/[encounterId]/page.tsx:385` (`Plan & Medical Instructions`) store unanchored free-text treatment plans without `scanForBoundaryViolation()` or ledger provenance. |
| **5. Does not calculate clinical risk scores or prioritize by inferred clinical severity** | **PASS** | `slot-optimizer.ts` (`rankWaitlistForVacantSlot`) orders waitlisted patients strictly by administrative readiness (`readinessBand === 'ready'`), provenance-backed `expedited_slot_requested` tag, and `requestedDate`. Zero clinical acuity or risk scoring. |
| **6. Does not convert source material into unsupported medical claims** | **PARTIAL (P1 Stage B Gap)** | `validateSpans` (Stage A) enforces that `verbatimQuote` is an exact substring of `text_span`. However, `validateCandidateProvenance` (Stage B value-in-quote check) is not called in `ledger.ts:insertFact()`. |
| **7. Does not trigger consequential patient communications without human approval** | **PASS** | `approveMessage()` requires `can(role, 'message:approve')` (`clinician` only) and `checkMessageGate()` (`messages.ts:169`), blocking approval or TTS if any variable's backing fact is not `verified`/`corrected`. |
| **8. Caregiver consent is recorded and revocation is immediately enforced** | **PASS** | `caregivers.ts` records `consent_recorded_at` and `consent_recorded_by`; `revokeCaregiverConsent()` sets `is_active = false`, `sync_reminders = false`, and `revoked_at = now()`, immediately halting caregiver outbox rows in `deliverMessage()`. |
| **9. Authorization, tenant isolation, and source revocation are honored** | **PARTIAL (P1 Missing `FORCE RLS` on 13 Milestone A/B Tables)** | Core and V4 tables (37 tables) enforce `ENABLE + FORCE ROW LEVEL SECURITY` and `0010_abdm_revoked_source_access.sql` hides withdrawn sources across packet/studio exports and TTS. However, migrations `0016` and `0019` omitted `FORCE ROW LEVEL SECURITY` on 13 Milestone A/B tables (`facility`, `department`, `clinician_profile`, `user_invitation`, `patient_care_team`, `clinic_session`, `clinician_unavailability`, `appointment`, `appointment_status_history`, `encounter`, `encounter_participant`, `encounter_note_version`, `tumor_board_meeting`, `tumor_board_case`). |

> **⚠️ SUBMISSION-DISQUALIFYING RISK CALLOUT:**
> While Milestone B's `/tumor-board` and `/encounters` forms are labeled `"Human Clinician Authoring"` (not AI-generated), presenting a form with `placeholder="Board treatment recommendations, trial eligibility..."` and unanchored free-text `clinicalStaging` directly contradicts OncoBrief's own core thesis (`CLAUDE.md`, `README.md`, `docs/milestone-a.md`) and invites immediate challenge from Health-a-thon judges enforcing the non-clinical guardrail. **This must be remediated (P0) before submission** by binding `tumor_board_case` staging to a verified `stage_text.as_written` fact selector from the Evidence Ledger and restricting tumor-board/encounter textareas to administrative care-coordination notes validated by `scanForBoundaryViolation()`.

---

## 11. Simulated Health-a-thon Jury Scorecard (Out of 100)

*Disclaimer: These are **INDEPENDENT SIMULATED WEIGHTS** specified in the audit mandate, NOT official Health-a-thon 2026 scoring weights. Scores reflect the current repository state at commit `7b2edec` under strict evidence standards.*

| # | Evaluation Criterion | Max | Earned | Confidence | Evidence & Justification |
| :---: | :--- | :---: | :---: | :---: | :--- |
| **1** | **Cancer Care relevance and clinical-scope compliance** | 15 | **11.5** | High | **Done well:** Directly targets NCG pre-consult "chart archaeology" (UC02), OPD slot bottlenecks (UC04), SOP lookups & referral drafting (UC05), and caregiver continuity; strong automated boundary guard (`clinical-boundary.ts`).<br>**Missing / Deductions (-3.5):** Milestone B (`7b2edec`) added unanchored free-text TNM staging (`cT2aN1M0`) and treatment recommendation fields on `/tumor-board` and `/encounters`, blurring the non-clinical boundary. |
| **2** | **Planned-to-implemented completeness** | 20 | **12.5** | High | **Done well:** V4 database schema, 14 oncology fact types, conflict room, batch verify, longitudinal lab flowsheets, OPD optimizer, Studio 4 formats, and caregiver registry are implemented.<br>**Missing / Deductions (-7.5):** Out of 25 Sarvam/AI requirements (`SARVAM_IMPLEMENTATION_TRACEABILITY.csv`), only 4 are `VERIFIED_WORKING` (16.0%); `WorkflowStateGraph` (`workflow-graph.ts`) is missing; web uploads hardcode `RuleBasedExtractor`; Stage B provenance is unwired in `ledger.ts`; only 2 of 11 continuity locales are seeded; Milestone B seed (`seed.ts:1244`) and `/workspace` readiness filter (`workspace/page.tsx:107`) are broken. |
| **3** | **Sarvam API correctness, reliability, and end-to-end functionality** | 20 | **8.0** | High | **Done well:** Clean REST clients in `sarvam-vision-ocr.ts` (`<=10`-page `pdf-lib` batching, rate-limit backoff, bbox normalization) and `sarvam-voice.ts` (`saaras:v3`, `bulbul:v3`), plus rock-solid `scopedTts.ts` security.<br>**Missing / Deductions (-12.0):** (1) **P0 bug** in `normalizeLanguageCode()` (`sarvam-voice.ts:60`) forces **every** STT and TTS call to `'en-IN'`; (2) Odia code `'or-IN'` vs `'od-IN'` mismatch; (3) multi-chunk `data.audios.join('')` corrupts WAV headers; (4) `useVoice.ts` fails to fall back to browser STT when `configured=true`; (5) `OCR_DRIVER=auto` fails uploads without falling back to `local-pdf` if Sarvam errors; (6) zero live Sarvam API verification. |
| **4** | **Indic multilingual usefulness and patient/caregiver accessibility** | 15 | **6.5** | High | **Done well:** Consented caregiver network (`caregiver_contact`) with relationship, preferred locale, and instant revocation; WCAG 2.2 AA contrast fixes (`#7c530b`, `#962123`) and 375px mobile responsiveness.<br>**Missing / Deductions (-8.5):** (1) Selecting Tamil/Telugu/etc. in `ContinuityAudioPlayer` does not translate the message, and `seed.ts` only has English and Hindi templates; (2) `normalizeLanguageCode()` forces TTS voice to `'en-IN'`; (3) `RuleBasedExtractor` extracts 0 facts from Indic-script documents; (4) offline WAV fallback is a 44-byte 0-sample silent header. |
| **5** | **Privacy, evidence grounding, human oversight, and auditability** | 15 | **13.0** | High | **Done well:** Standout engineering: PostgreSQL `REVOKE UPDATE, DELETE` + `oncobrief_block_mutation` triggers, SHA-256 hash-chained `ledger_entry` and `audit_event`, 35-key PHI metadata redaction (`audit.ts`), ABDM consent revocation hiding raw spans/blocking exports (`409`), and `scopedTts.ts` `no-store` headers.<br>**Missing / Deductions (-2.0):** Stage B `validateCandidateProvenance()` is not called in `insertFact()`; 13 Milestone A/B tables omit `FORCE ROW LEVEL SECURITY`; `/api/v1/assistant/voice/stt` lacks RBAC and size caps. |
| **6** | **Demo readiness, deployment feasibility, and technical robustness** | 10 | **6.0** | High | **Done well:** Runs locally with Docker Postgres, has AWS ECS/RDS/S3/SQS Terraform modules, and 886 passing unit/integration tests.<br>**Missing / Deductions (-4.0):** (1) Main `/workspace` dashboard shows **`0 Record Complete`** due to `'complete'` vs `'ready'` bug; (2) `/appointments` and `/tumor-board` are empty on fresh seed due to `ananya.mukhopadhyay@rci.invalid` typo; (3) `DocumentUploadForm.tsx` runs a fake 4.0s `"Sarvam Vision"` timer; (4) `OCR_DRIVER=auto` + unverified `.env` key risks live upload failure. |
| **7** | **Operational KPIs and 60–90-day pilot evidence plan** | 5 | **3.5** | High | **Done well:** Honest repudiation of fabricated Reddit/vendor percentages in `README.md`; DB captures real operational timestamps (`checked_in_at`, `consultation_started_at`, `record_readiness_snapshot`).<br>**Missing / Deductions (-1.5):** No 60–90-day pilot KPI telemetry strip is rendered on `/workspace`, and baseline-vs-pilot measurement protocol is not surfaced in the app. |
| — | **TOTAL SIMULATED SCORE** | **100** | **61.0 / 100** | **High** | **Projected Score After Fixing Top 5 P0/P1 Blockers (~6 hrs work): 86.5 / 100** |

---

## 12. What Would Judges Challenge? (6-Perspective Simulation — 30 Questions)

### Perspective 1: National Cancer Grid (NCG) Oncologist

#### Q1.1: *"In an NCG centre like Tata Memorial or Adyar Cancer Institute, a referred patient brings a Tamil or Hindi discharge summary or a handwritten chemo sheet. If I upload a Tamil referral PDF right now, what appears on the OncoBrief timeline?"*
1. **Evidence-Based Code Answer:** If `SARVAM_API_KEY` is valid and `OCR_DRIVER=auto`, `SarvamVisionOcrAdapter` will send the PDF to `/doc-ai/v1/job/digitise` with `language='en-IN'` (because `ingestDocument` in `documents.ts:436` does not pass a language parameter). Even if Sarvam extracts Tamil text spans into `text_span`, `uploadDocumentAction` (`actions.ts:472`) runs `RuleBasedExtractor` (`rule-based-extractor.ts`), whose regexes only match English labels (`Diagnosis:`, `Stage:`, `Modified radical mastectomy`, `Hemoglobin`). Therefore, **zero timeline events or evidence facts will be extracted from a Tamil or Hindi document**.
2. **Strength Rating:** **Unconvincing / Weak.**
3. **Exact Improvement Needed:** Add a document language selector (`en-IN`, `hi-IN`, `ta-IN`, etc.) to `DocumentUploadForm.tsx`, pass `language` through `ingestDocument()` to `SarvamVisionOcrAdapter`, and wire `HybridExtractor` (or multilingual regex patterns + LLM extraction passed through Stage A/B provenance) so Indic-script documents produce verified timeline facts.
4. **Most Effective Live Demo:** Upload a bilingual English/Hindi or English/Tamil oncology referral PDF, show the extracted spans in `SourcePaneView`, and show the resulting `extracted` fact waiting for clinician verification.

#### Q1.2: *"What happens if Sarvam OCR misreads a handwritten or faded date—say, reading '12/06/2025' as '12/08/2025'—or misses a critical pathology addendum page?"*
1. **Evidence-Based Code Answer:** Three mechanisms protect the clinician: (1) Every extracted fact enters the ledger in `'extracted'` (unverified) state (`ledger.ts:258`) and is excluded from approved consultation packets until a human verifies it; (2) hovering or clicking the fact opens `SourcePaneView.tsx` with the exact `[0..1]` SVG bounding box highlighted over the original scan so the clinician sees `'12/06/2025'` vs `'12/08/2025'` in 1 second and can click `Correct` (`correctEvidenceAction`); and (3) if a Sarvam batch job returns `partially_completed` or a page count mismatch (`sourcePages.length !== batch.count`), `SarvamVisionOcrAdapter` (`sarvam-vision-ocr.ts:169, 193`) rejects the job with `ocr_sarvam_incomplete` rather than silently dropping a page.
2. **Strength Rating:** **Strong.**
3. **Exact Improvement Needed:** Wire `validateCandidateProvenance()` (Stage B in `span-validation.ts:242`) into `ledger.ts:insertFact()` so spans with `ocr_confidence < 0.85` are automatically flagged `needs_review` and blocked from 2-click batch verification (`verifyEvidenceBatch` already requires `confidence >= 0.90`).
4. **Most Effective Live Demo:** Open `DEMO-001` → click `Review & Verify High-Confidence Batch` to show that only `>=90%` confidence non-conflicting facts are batch-eligible, then open the Reconciliation Room on the surgery date conflict (`12 June 2025` vs `3 July 2025`).

#### Q1.3: *"Two outside labs report discordant HER2 status (one says HER2 3+ Positive, the other says Equivocal 2+) or two serial CBCs show Hemoglobin dropping from 11.4 to 10.2 g/dL. How does OncoBrief distinguish a true contradiction from a longitudinal lab trend?"*
1. **Evidence-Based Code Answer:** In `packages/domain/src/conflict/comparators.ts` and `fact-types.ts`, serial `lab_result.as_written` and `medication.recorded` facts are scoped by `observed_on` date (`slotQualifier`), so Hemoglobin `11.4 g/dL` on `02 Jun 2025` and `10.2 g/dL` on `26 Jul 2025` do **not** trigger a false conflict—instead, `buildLongitudinalLabFlowsheet()` (`longitudinal-review.ts`) renders them side by side with an arithmetic delta (`-1.2 g/dL`). Conversely, same-date lab divergences `>5%` or conflicting surgery/pathology dates across documents trigger an open `conflict_set`.
2. **Strength Rating:** **Strong (Verified Working).**
3. **Exact Improvement Needed:** None for domain logic; ensure the demo clearly contrasts the `DEMO-001` Longitudinal Lab Flowsheet (serial Hb trend) against the Reconciliation Room (conflicting surgery dates).
4. **Most Effective Live Demo:** On `DEMO-001`, click `Longitudinal Lab Flowsheet` (`data-testid="filter-labs"`) to show the `-1.2 g/dL` serial Hb row, then click `Conflicts` to show the competing surgery dates.

#### Q1.4: *"Your README says OncoBrief never permits manual staging or treatment recommendations outside the Evidence Ledger. Why does your `/tumor-board` page have a free-text input for `cT2aN1M0 Stage IIB` and `Board treatment recommendations`?"*
1. **Evidence-Based Code Answer:** That is a genuine contradiction introduced in commit `7b2edec` (`apps/web/src/app/(app)/tumor-board/page.tsx:246, 354` and `encounters/[encounterId]/page.tsx`). Those fields write directly to `tumor_board_case.clinical_staging` and `recommendation_notes` without linking to an `evidence_fact` ID or running `scanForBoundaryViolation()`.
2. **Strength Rating:** **Unconvincing (Critical Vulnerability).**
3. **Exact Improvement Needed:** Replace the free-text `clinicalStaging` input on `/tumor-board` with a `<select>` bound to verified `stage_text.as_written` / `diagnosis_text.as_written` facts from `evidence_fact`, relabel the textareas strictly as `"Administrative & Pre-Board Coordination Notes (Non-Diagnostic)"`, and enforce `scanForBoundaryViolation()` on save.
4. **Most Effective Live Demo:** After patching, show that registering a case on `/tumor-board` pulls its documented stage directly from the verified Evidence Ledger with a clickable source link.

#### Q1.5: *"How many clicks does it take me as an oncologist to review a referred patient's 9 documents before my 9:30 AM OPD consult?"*
1. **Evidence-Based Code Answer:** Four clicks: (1) Click patient on `/workspace` → lands on `/patients/[id]/evidence` showing the `Changes Since Last Consultation` banner and `Longitudinal Lab Flowsheet`; (2) Click `Review & Verify High-Confidence Batch` → Click `Confirm Verification` (2 clicks to verify all high-confidence facts); (3) Reconcile any open conflict in 1 click; (4) Approve packet on `/packet`.
2. **Strength Rating:** **Strong.**
3. **Exact Improvement Needed:** Fix the `/workspace` readiness counter bug (`workspace/page.tsx:107`) so the oncologist sees accurate `Record Ready` counts on the landing page.
4. **Most Effective Live Demo:** Live 60-second walkthrough of `DEMO-001` batch verification + conflict resolution.

---

### Perspective 2: Reskilll Technical Evaluator

#### Q2.1: *"When I upload a PDF in your UI, a progress card steps through 6 stages over 4 seconds saying 'Extracting tabular text spans with Sarvam Vision…' and shows 'Sarvam Vision (OCR): Active (12.5s)'. Is that real telemetry from the backend?"*
1. **Evidence-Based Code Answer:** **No.** In `apps/web/src/components/DocumentUploadForm.tsx:188-228`, `runStepSequence()` is a hardcoded client-side loop of six `setTimeout` delays (`600+600+700+800+700+600 = 4000ms`), and `ProcessingStatusCard.tsx:94-130, 373` hardcodes `duration: '12.5s'` and `Sarvam Vision (OCR): Active` even when `OCR_DRIVER=local-pdf` and `LocalMultimodalOcrAdapter` finishes in `<50ms`.
2. **Strength Rating:** **Unconvincing (High Penalty Risk if Discovered by Technical Jury).**
3. **Exact Improvement Needed:** Delete `runStepSequence()`'s artificial `setTimeout` sleeps in `DocumentUploadForm.tsx`, return the real `IngestionResult` (`pages`, `spans`, `candidates`, `promoted`, `engine`, `durationMs`) from `uploadDocumentAction`, and pass the actual active `ocrDriver` and `extractionDriver` props into `ProcessingStatusCard.tsx`.
4. **Most Effective Live Demo:** Upload `02_CBC_with_Differential_02_Jun_2026_DEMO.pdf` and show instantaneous real server metrics (`1 page · 14 spans · 6 facts extracted · Engine: local-multimodal / sarvam-vision · 42ms`).

#### Q2.2: *"Your architecture docs describe a `WorkflowStateGraph` multi-agent system and `BedrockLlmProvider` extraction. Where is `workflow-graph.ts`, and what extractor runs when I upload a file in the web app?"*
1. **Evidence-Based Code Answer:** `packages/domain/src/orchestration/workflow-graph.ts` does not exist in the repository. `Ask OncoBrief` (`apps/web/src/lib/assistant/orchestrator.ts`) uses a deterministic regex/LLM intent classifier (`classify.ts`) followed by `if/else` SQL retrieval branches and a single LLM synthesis call. And in `apps/web/src/lib/actions.ts:472` (`extractorPort`) and `packages/db/src/container.ts:75` (`getExtractor`), the code hardcodes `new RuleBasedExtractor()`, so synchronous web uploads never call `BedrockLlmProvider`.
2. **Strength Rating:** **Incomplete (Overclaimed in Docs, Though Deterministic Code Is Solid).**
3. **Exact Improvement Needed:** Either implement the compact `WorkflowStateGraph<TState>` (`docs/implementation-planning/ONCOBRIEF_AGENTIC_AI_IMPLEMENTATION_PLAN.md`) and wire `getExtractor()` to support `EXTRACTION_DRIVER`, **or** honestly frame the architecture in all judge pitches as a **Deterministic Safety-Gated State Machine with Bounded LLM/Indic AI Adapters** (which is actually safer for healthcare).
4. **Most Effective Live Demo:** Show how `RuleBasedExtractor` + `validateSpans` deterministically rejects any unanchored claim in `<5ms` with zero hallucination risk.

#### Q2.3: *"Why does your `/workspace` dashboard say `Record Complete: 0` when `DEMO-003` has a green `READY` badge in the table right below it, and why do `/appointments` and `/tumor-board` show empty states?"*
1. **Evidence-Based Code Answer:** Two bugs introduced in commit `7b2edec`: (1) `apps/web/src/app/(app)/workspace/page.tsx:107` filters for `p.readinessBand === 'complete'` (and lines 189–196 offer filter values `'complete' | 'high' | 'medium' | 'low' | 'incomplete'`), whereas the PostgreSQL enum `readiness_band` is `'ready' | 'gaps' | 'blocked'`; and (2) `packages/db/src/seed.ts:1149` returns early on initial `seed()` and line 1244 queries `WHERE email = 'ananya.mukhopadhyay@rci.invalid'` instead of `'dr.ananya@rci.demo'`, so Milestone B tables are never seeded.
2. **Strength Rating:** **Unconvincing (Broken Demo State).**
3. **Exact Improvement Needed:** Fix `'complete'` → `'ready'` in `workspace/page.tsx:107, 189-196` (15 minutes) and fix `seed.ts:1149, 1244` to seed Milestone B data using `'dr.ananya@rci.demo'` (30 minutes).
4. **Most Effective Live Demo:** Open `/workspace` showing `Record Ready: 1`, filter by `Ready` to isolate `DEMO-003`, then open `/appointments` and `/tumor-board` showing populated schedules.

#### Q2.4: *"In `ledger.ts:insertFact()`, you call `validateSpans()` (Stage A), which checks that `verbatimQuote` is in `text_span`. Where do you check that `candidate.value` actually matches `verbatimQuote` (Stage B)?"*
1. **Evidence-Based Code Answer:** `validateCandidateProvenance()` (Stage B—which checks `verifyDateInQuote`, `verifyLabValueInQuote`, and `verifyTokensOrVocabInQuote`) is implemented and unit-tested in `packages/domain/src/provenance/span-validation.ts:242-358`, **but it is never called in `packages/db/src/services/ledger.ts:insertFact()` or `documents.ts:ingestNormalizedPages()`**.
2. **Strength Rating:** **Incomplete.**
3. **Exact Improvement Needed:** Call `validateCandidateProvenance()` inside `insertFact()` (`packages/db/src/services/ledger.ts:220`) right after `validateSpans()`.
4. **Most Effective Live Demo:** Show unit test `span-validation.test.ts` (`DOM-02`: quote says `"14/05/2026"`, candidate value says `"2026-09-01"` → rejected at `STAGE_B`) and show it wired directly inside `insertFact()`.

#### Q2.5: *"How do you prove your unit tests for Sarvam STT/TTS didn't just pass against a trivial mock?"*
1. **Evidence-Based Code Answer:** Our existing test in `apps/web/src/lib/assistant/providers.test.ts:92-129` stubbed `global.fetch` to return `{ transcript: 'namaste doctor' }` and `{ audio_base64: 'AAAA' }` **without asserting on the request URL, headers, or payload sent to `fetch`**. That is why the `normalizeLanguageCode()` bug (`'hi-IN'` → `'hi-in'` → `'en-IN'`) passed all 886 tests undetected.
2. **Strength Rating:** **Weak Test Assertion.**
3. **Exact Improvement Needed:** Update `providers.test.ts` to inspect `fetchMock.mock.calls[0]` and assert that passing `languageCode: 'ta-IN'` sends `target_language_code: 'ta-IN'` in `sarvamTts` and `language_code: 'ta-IN'` in `sarvamStt`, and that `languageCode: 'or-IN'` maps to `'od-IN'`.
4. **Most Effective Live Demo:** Run `vitest run src/lib/assistant/providers.test.ts` showing strict payload assertions passing.

---

### Perspective 3: Sarvam AI API Integration Engineer

#### Q3.1: *"Look at `packages/adapters/src/sarvam-voice.ts` lines 59–64. What does `normalizeLanguageCode('ta-IN')` or `normalizeLanguageCode('hi-IN')` actually return?"*
1. **Evidence-Based Code Answer:** Line 60 computes `const normalized = code.toLowerCase().replace(/_/g, '-')`, which turns `'ta-IN'` into `'ta-in'`. Line 61 checks `isSupportedLanguage('ta-in')` against `SUPPORTED_LANGUAGES` (`['en-IN', 'hi-IN', 'ta-IN', ...]`). Because `'ta-in' !== 'ta-IN'`, `isSupportedLanguage` returns `false`, and line 63 returns `'en-IN'`. **Every single STT and TTS call in OncoBrief sends `'en-IN'` to Sarvam AI.**
2. **Strength Rating:** **Broken (P0 Showstopper for Sarvam Evaluation).**
3. **Exact Improvement Needed:** Rewrite `normalizeLanguageCode()` in `packages/adapters/src/sarvam-voice.ts:59-64`:
   ```ts
   export function normalizeLanguageCode(code: string): SupportedLanguage {
     const parts = code.trim().replace(/_/g, '-').split('-');
     const formatted = parts.length === 2
       ? `${parts[0]!.toLowerCase()}-${parts[1]!.toUpperCase()}`
       : code.trim();
     if (formatted === 'or-IN' || formatted === 'od-IN') return 'or-IN'; // map to 'od-IN' on wire
     if (isSupportedLanguage(formatted)) return formatted;
     return 'en-IN';
   }
   ```
   And map `'or-IN'` → `'od-IN'` when constructing the Sarvam API request payload.
4. **Most Effective Live Demo:** Open browser DevTools Network tab on `/patients/[id]/continuity`, select `Tamil (ta-IN)`, click `Generate & Preview Spoken Voice Note`, and show the real WAV audio synthesized in Tamil.

#### Q3.2: *"In `sarvamTts()` (`sarvam-voice.ts:194`), you write `const audioBase64 = data.audios?.join('') ?? ''`. What happens when `bulbul:v3` returns multiple base64 WAV chunks in `audios[]`?"*
1. **Evidence-Based Code Answer:** Each element of `data.audios` returned by `POST /text-to-speech` is a complete base64-encoded WAV file starting with a 44-byte `RIFF....WAVEfmt ` header and ending with base64 padding (`=` or `==`). Concatenating the base64 strings directly (`data.audios.join('')`) produces invalid mid-string `=` characters and embeds 44-byte WAV headers inside the audio stream.
2. **Strength Rating:** **Broken for Multi-Chunk Audio.**
3. **Exact Improvement Needed:** Decode each base64 string in `data.audios` into a `Buffer`. If `buffers.length === 1`, return `buffers[0].toString('base64')`. If `buffers.length > 1`, take the 44-byte header from `buffers[0]`, concatenate `buffers[0].subarray(44)` with `buffers[i].subarray(44)` for all subsequent chunks, write the new total file size (`36 + totalPcmBytes`) at byte offset `4` (`writeUInt32LE`) and `totalPcmBytes` at byte offset `40` (`writeUInt32LE`), and base64-encode the combined buffer.
4. **Most Effective Live Demo:** Synthesize a 2-sentence Hindi or Tamil reminder and play it back smoothly from start to finish.

#### Q3.3: *"In `SarvamVisionOcrAdapter` (`sarvam-vision-ocr.ts:141, 179`), you post to `/doc-ai/v1/job/digitise` with `output_format: 'json'` and fetch `/doc-ai/v1/job/{id}/results?format=json`. Have you tested this against the live Sarvam Document AI endpoint?"*
1. **Evidence-Based Code Answer:** No—it was only tested against a mocked `fetchImpl` in `ocr-correctness.test.ts:57-107`. In Sarvam's live Document AI API, `parse`/`digitise` jobs output `.zip` archives via `GET /doc-ai/v1/job/{id}/download-url` (containing `.md`/`.html` and `metadata/page_NNN.json`), or return `parse` JSON structures that may differ from `documents[0].pages[].content` stringified JSON.
2. **Strength Rating:** **Unverified Against Live Endpoint.**
3. **Exact Improvement Needed:** Run a 1-page live smoke test with the configured `SARVAM_API_KEY` against `https://api.sarvam.ai/doc-ai/v1/job/digitise` (and `/parse`), inspect the exact JSON returned by `/results?format=json` and `/download-url`, and update `getResults()` in `sarvam-vision-ocr.ts:175-218` to handle both direct JSON and ZIP/download-url page metadata.
4. **Most Effective Live Demo:** Show a live 1-page scan processed by Sarvam Vision with bounding boxes rendered in `SourcePaneView`.

#### Q3.4: *"Why are you using `saaras:v3` without `mode` or `keyterms` instead of `saaras:v4` with oncology keyterm prompting?"*
1. **Evidence-Based Code Answer:** `sarvam-voice.ts:34` hardcodes `DEFAULT_STT_MODEL = 'saaras:v3'` and only appends `file`, `model`, and `language_code` to `FormData` (`lines 108-110`). It does not use `saaras:v4` or pass `keyterms` for oncology/hospital vocabulary (`histopathology`, `mastectomy`, `trastuzumab`, `neutropenia`, `ABHA`, `PET-CT`).
2. **Strength Rating:** **Missed Opportunity (Easy High-Value Upgrade).**
3. **Exact Improvement Needed:** Support `saaras:v4` (or configurable `SARVAM_STT_MODEL`) and pass an oncology administrative `keyterms` list (or `mode: 'codemix'` when appropriate) in `sarvamStt()`.
4. **Most Effective Live Demo:** Dictate a code-mixed Hinglish/Tanglish query naming `"histopathology report"` and `"PET-CT scan"` into `Ask OncoBrief` and show accurate transcription.

#### Q3.5: *"Why does `SarvamVisionOcrAdapter.request()` wait 6 seconds before `GET /status` and `GET /results` calls?"*
1. **Evidence-Based Code Answer:** `sarvam-vision-ocr.ts:89-91` applies the 6,000 ms rate-limit interval (`minIntervalMs ?? 6000`) to **every** call inside `request()`, not just job-creation `POST /doc-ai/v1/job/digitise` calls.
2. **Strength Rating:** **Poorly Tuned Polling Logic.**
3. **Exact Improvement Needed:** Apply the 6,000 ms token-bucket delay **only** to `POST` job-submission requests (which are subject to the 10 jobs/minute limit), and allow `GET /status` and `GET /results` to poll every 1.5–2.0 seconds without artificial 6-second pre-delays.
4. **Most Effective Live Demo:** Show a 1-page document completing Sarvam OCR polling in ~3–5 seconds instead of 18+ seconds.

---

### Perspective 4: Hospital Administrator (NCG Tertiary Cancer Centre)

#### Q4.1: *"If our hospital internet drops or our Sarvam AI quota is exhausted during a busy 200-patient Monday morning OPD, what happens when a records clerk uploads a digital PDF lab report?"*
1. **Evidence-Based Code Answer:** Currently, if `OCR_DRIVER=auto` and `SARVAM_API_KEY` is present in `.env`, `createOcrAdapter()` (`ocr-routing.ts:15-21`) returns `SarvamVisionOcrAdapter`. If the internet drops or the quota is exhausted, `SarvamVisionOcrAdapter` throws `ocr_extraction_failed` and `ingestDocument()` (`documents.ts:448-465`) marks the document `failed`—**it does not fall back to `LocalMultimodalOcrAdapter`**, even for a digital PDF that could be parsed locally in 20 ms!
2. **Strength Rating:** **Unconvincing (Critical Reliability Flaw).**
3. **Exact Improvement Needed:** Implement a composite `AutoFallbackOcrAdapter` in `packages/adapters/src/ocr-routing.ts`: (1) for digital PDFs with embedded text layers, use `LocalMultimodalOcrAdapter` first (0 cost, 20 ms, works offline), and only invoke `SarvamVisionOcrAdapter` if the PDF is a scan (`ocr_manual_transcription_required`), an image (`image/png`, `image/jpeg`), or has non-ASCII/Indic script hints; and (2) if Sarvam throws a network/5xx/403/429 error on a PDF, gracefully attempt `LocalMultimodalOcrAdapter` before failing.
4. **Most Effective Live Demo:** Show a digital PDF extracting in `<50ms` at ₹0 API cost, while a scanned image routes to Sarvam Vision OCR.

#### Q4.2: *"What is the per-patient API cost of running OncoBrief across 10 documents per referral?"*
1. **Evidence-Based Code Answer:** Currently, if `OCR_DRIVER=auto` with `SARVAM_API_KEY` set, **every** uploaded PDF (even digital lab reports) is sent to Sarvam Document AI, and `RuleBasedExtractor` runs locally for ₹0. If we route digital PDFs to `LocalMultimodalOcrAdapter` first and only send scanned pages to Sarvam Vision, ~60–70% of digital lab/EMR PDFs cost ₹0.00, while scanned pages use bounded `<=10`-page Sarvam jobs and 1 short (`<200` char) Bulbul TTS call per appointment reminder.
2. **Strength Rating:** **Incomplete Until Smart Routing Is Wired.**
3. **Exact Improvement Needed:** Wire page/document-level smart OCR routing in `ocr-routing.ts` so cloud OCR is only invoked when local PDF extraction finds no text layer or when Indic OCR is requested.
4. **Most Effective Live Demo:** Point to the document inventory on `/patients/[id]/sources` showing which documents used `local-multimodal` (₹0) vs `sarvam-vision` (scanned pages only).

#### Q4.3: *"We have `/workspace?view=opd` for live OPD slots and `/appointments` in the sidebar for appointment booking. If my front-desk receptionist checks in a patient on `/appointments`, does the OPD coordinator see them checked in on `/workspace?view=opd`?"*
1. **Evidence-Based Code Answer:** **No.** `appointments.ts` writes to the `appointment` table (Milestone B), while `opd-flow.ts` reads and writes `opd_appointment_slot` (V4). Although migration `0019` added `appointment_id` to `opd_appointment_slot`, neither service updates the other.
2. **Strength Rating:** **Broken (Split-Brain Scheduling).**
3. **Exact Improvement Needed:** Synchronize status transitions (`checked_in`, `in_consult`, `completed`, `cancelled`, `no_show`) transactionally between `appointment` and `opd_appointment_slot` via `opd_appointment_slot.appointment_id`.
4. **Most Effective Live Demo:** Check in a patient on `/workspace?view=opd` and show the status reflected on `/appointments`.

#### Q4.4: *"When a slot opens up in OPD and a coordinator clicks 'Offer Slot' to a waitlisted `ready` patient, how does the patient accept the slot?"*
1. **Evidence-Based Code Answer:** `offerOpdSlot()` (`opd-flow.ts`) sets `opd_waitlist_entry.status = 'offered'` and reserves the slot via a partial unique index (`0013_opd_reservation_overlap.sql`), while keeping the slot `vacant`. There is currently no `acceptOpdSlotOffer` button; the coordinator must release the offer and register the patient via `Register walk-in` once they arrive.
2. **Strength Rating:** **Partial (Works if Explained Honestly, Better if Acceptance Button Added).**
3. **Exact Improvement Needed:** Add a 1-click `Confirm Acceptance & Assign Slot` action next to `Release Offer` on offered waitlist entries in `OpdWorkspace.tsx`.
4. **Most Effective Live Demo:** Show vacant slot `10:30–11:00` → rank `DEMO-003` (`ready`) → Offer Slot → Confirm Acceptance / Register Walk-In.

#### Q4.5: *"What exactly will our oncology department measure in a 60–90-day pilot, and how does the software capture baseline vs. post-deployment numbers?"*
1. **Evidence-Based Code Answer:** The database already records exact timestamps for four operational KPIs without extra data entry:
   1. **Verification Click & Time Burden:** `ledger_entry.occurred_at` and `audit_event` (`evidence.batch_verified` vs individual `evidence.verified`).
   2. **Pre-Consult Record Readiness Rate:** `record_readiness_snapshot` (`band = 'ready'` vs `'gaps'`/`'blocked'` at T-24h before appointment).
   3. **Cross-Facility Discrepancy Catch Rate:** `conflict_set.detected_at` vs `resolved_at` prior to consultation packet approval.
   4. **Vacant OPD Slot Backfill Turnaround:** `opd_slot_event` timestamps from slot cancellation (`vacant`) to waitlist offer (`offered`) and walk-in assignment (`walk_in`).
2. **Strength Rating:** **Strong Database Telemetry, Missing UI Summary.**
3. **Exact Improvement Needed:** Surface these live database counts in a compact **60–90 Day Pilot Operational Telemetry** strip on `/workspace`.
4. **Most Effective Live Demo:** Show the live SQL-computed telemetry counters on `/workspace` updating as a batch verification and slot backfill are completed.

---

### Perspective 5: Patient & Caregiver Accessibility Expert

#### Q5.1: *"On the Care Continuity page (`/patients/[id]/continuity`), I see a language dropdown with 11 Indian languages. If I select Tamil (`ta-IN`) for an English appointment reminder and click 'Generate & Preview Spoken Voice Note', what will a Tamil-speaking caregiver hear?"*
1. **Evidence-Based Code Answer:** Two things go wrong: (1) The text of the message (`message.bodyRendered`) is still in English (`"Your appointment is on 15 May 2025 at Surgical Oncology OPD..."`) because `seed.ts` only has `'en'` and `'hi'` templates and no translation occurs; and (2) because of the `normalizeLanguageCode()` bug in `sarvam-voice.ts:60`, `target_language_code` is sent to Sarvam Bulbul as `'en-IN'`. So the caregiver hears **English text spoken in an Indian English voice**! Even if the `normalizeLanguageCode()` bug is fixed alone, Bulbul `ta-IN` would be asked to read English Latin-script sentences unless a Tamil `message_template` is used.
2. **Strength Rating:** **Broken (P0 Accessibility Failure).**
3. **Exact Improvement Needed:** (1) Fix `normalizeLanguageCode()` in `sarvam-voice.ts`; (2) Seed clinician-approved, deterministic `message_template` rows in `packages/db/src/seed.ts` for all 11 supported locales (`en-IN`, `hi-IN`, `ta-IN`, `te-IN`, `kn-IN`, `ml-IN`, `bn-IN`, `mr-IN`, `gu-IN`, `pa-IN`, `or-IN`) with native-script text and the exact same `{{appointment_date}}`, `{{appointment_location}}`, and `{{records_office_phone}}` verified placeholders; and (3) default `ContinuityAudioPlayer` to the message's own locale (or render the selected locale's approved template over the same verified variables).
4. **Most Effective Live Demo:** Compose a reminder using the approved Tamil (`ta-IN`) or Hindi (`hi-IN`) template on `/patients/[id]/continuity`, approve it, and play the genuine Tamil/Hindi spoken voice note.

#### Q5.2: *"How do you prevent a machine translation error from telling a cancer patient the wrong appointment date, wrong fasting instruction, or wrong hospital building?"*
1. **Evidence-Based Code Answer:** OncoBrief deliberately **never uses free-form LLM translation on patient reminders** (`ADR 0011`, `ADR 0025`, `messages.ts`). Instead, reminders are rendered deterministically via `renderTemplate()` from human-approved `message_template` rows where every dynamic slot (`{{appointment_date}}`) is bound in `message_variable_source` to a `verified` `evidence_fact` in the Evidence Ledger (`checkMessageGate()`).
2. **Strength Rating:** **Strong Architectural Design (Needs the 9 Missing Approved Indic Templates Seeded).**
3. **Exact Improvement Needed:** Seed the remaining 9 human-reviewed Indic `message_template` rows in `seed.ts` so all 11 languages use deterministic variable substitution rather than free-text machine translation.
4. **Most Effective Live Demo:** Show the `"every value traced"` pills on a Tamil/Hindi message card linking `appointment_date` directly to the verified source document and page, and show that unverified facts block message approval.

#### Q5.3: *"Are spoken voice reminders actually delivered to the patient or caregiver's phone?"*
1. **Evidence-Based Code Answer:** **No.** In `packages/db/src/services/messages.ts:242-332`, `deliverMessage()` dispatches text-only rows to `SimulatedDeliveryAdapter` (`message_outbox.simulated = true`), and `ContinuityAudioPlayer.tsx` only previews audio inside the coordinator's web browser.
2. **Strength Rating:** **Honest Simulation (Acceptable for Hackathon Prototype if Clearly Stated; Stronger if Downloadable `.wav` Voice Note Is Added).**
3. **Exact Improvement Needed:** Add a `"Download Voice Note (.wav) for WhatsApp / IVR Dispatch"` link on the `<audio>` player in `ContinuityAudioPlayer.tsx` when audio is generated, and clearly state in the pitch that external telecom dispatch is simulated to prevent accidental PHI transmission.
4. **Most Effective Live Demo:** Generate the voice preview on `/continuity`, play it aloud for the judges, and show the synchronized outbox receipts for the patient and consented caregiver (`Kavita Menon`).

#### Q5.4: *"What happens if a patient revokes consent for their family caregiver (e.g., due to family privacy concerns)?"*
1. **Evidence-Based Code Answer:** Clicking `Revoke Consent` calls `revokeCaregiverConsentAction` → `revokeCaregiverConsent()` (`caregivers.ts:185`), which locks the row `FOR UPDATE`, sets `is_active = false`, `sync_reminders = false`, `revoked_at = now()`, and `revoked_by = userId`, and logs `caregiver.revoked` to the hash-chained audit trail. In `deliverMessage()` (`messages.ts:276-285`), the query `WHERE is_active = true AND revoked_at IS NULL AND sync_reminders = true FOR SHARE` guarantees **zero future dispatches** to that caregiver.
2. **Strength Rating:** **Strong (Verified by Integration & E2E Tests).**
3. **Exact Improvement Needed:** None—this works end to end.
4. **Most Effective Live Demo:** Revoke consent for a caregiver on `/patients/[id]/continuity` and show the status badge immediately switch to `Consent Revoked`.

#### Q5.5: *"What happens when Sarvam TTS is offline and the coordinator clicks 'Load Labeled Synthetic Demo Audio'?"*
1. **Evidence-Based Code Answer:** `ContinuityAudioPlayer.tsx:11-12` loads `SYNTHETIC_DEMO_WAV_BASE64`, which is a 44-byte WAV header with `0` data bytes (complete silence), labeled `"Synthetic Demo Audio — silent control fixture, no speech"`.
2. **Strength Rating:** **Honest, but Confusing to Judges Expecting Sound.**
3. **Exact Improvement Needed:** Either generate a short audible 440 Hz / 880 Hz confirmation chime WAV in memory (while keeping the explicit `"Offline Control Chime — Configure SARVAM_API_KEY for Spoken TTS"` label) **or** relax `ContinuityAudioPlayer.tsx:92` (`candidate.localService` filter) so standard macOS/Chrome system voices (`window.speechSynthesis`) can speak when `localService` is false.
4. **Most Effective Live Demo:** Notice that in `ContinuityAudioPlayer.tsx:92` and `useVoice.ts:333`, `.find((candidate) => candidate.localService && ...)` blocks Chrome's built-in Google Hindi/Tamil voices (which have `localService === false`)! Falling back to any matching `candidate.lang` voice when no `localService` voice exists immediately enables working browser speech in Chrome!

---

### Perspective 6: Healthcare Security & Privacy Reviewer

#### Q6.1: *"Can an attacker or a crafted client request use your `/api/v1/continuity/tts` or `/api/v1/assistant/voice/tts` endpoints as an open proxy to synthesize arbitrary text or exfiltrate another patient's message?"*
1. **Evidence-Based Code Answer:** **No.** `apps/web/src/lib/scoped-tts.ts` is locked down: it requires an authenticated session (`401`), checks `can(session.role, 'patient:read')` (`403`), opens a tenant-scoped RLS transaction (`withTenant`), and for `continuity` ignores any client-supplied `text`—loading `message.bodyRendered` from `patient_message` only if `message.orgId === session.orgId && message.patientId === body.patientId`, `message.status !== 'withdrawn'`, and `checkMessageGate(q, message.id)` passes (`404`/`409`). For `assistant`, it requires `body.text` to match a saved `assistant` message inside a conversation owned by `session.userId` whose cited documents are all still accessible (`404`/`409`).
2. **Strength Rating:** **Exemplary (Verified by 10 Unit Tests in `tts-scope.test.ts`).**
3. **Exact Improvement Needed:** None on TTS; apply the same RBAC (`can(session.role, 'patient:read')`) and byte-size cap (`<= 5 MB`) to `POST /api/v1/assistant/voice/stt/route.ts`.
4. **Most Effective Live Demo:** Show `scoped-tts.ts` (60 lines of clean security code) and `tts-scope.test.ts`.

#### Q6.2: *"What happens to cached audio or approved packets after a patient revokes ABDM consent?"*
1. **Evidence-Based Code Answer:** (1) All TTS responses carry `Cache-Control: no-store, no-cache, must-revalidate, max-age=0` and `Pragma: no-cache` (`scoped-tts.ts:9`), and audio buffers are never written to S3 or PostgreSQL. (2) When ABDM consent is revoked (`purgeConsentData` in `abdm-hiu.ts`), `document.ingest_error` is set to `'consent_revoked_or_expired'`, migration `0010_abdm_revoked_source_access.sql` enforces a `RESTRICTIVE` RLS policy hiding all `evidence_fact` and `text_span` rows from that document, and `checkMessageGate()`, `assertPacketSourcesAccessible()`, `assertStudioArtifactSourcesAccessible()`, and `scopedTts()` all immediately return `409 Conflict` (`source_unavailable`).
2. **Strength Rating:** **Exemplary (Verified in `abdm-revocation.spec.ts` & `packet-withdrawal-review.test.ts`).**
3. **Exact Improvement Needed:** None.
4. **Most Effective Live Demo:** Revoke an ABDM consent on `/patients/[id]/sources` and show that any dependent export or TTS request immediately blocks with `409`.

#### Q6.3: *"Are patient names, phone numbers, transcripts, or audio payloads ever written into `audit_event.metadata_json` or error logs?"*
1. **Evidence-Based Code Answer:** `packages/db/src/services/audit.ts:119-182` defines `REDACT_KEYS` covering 35 sensitive keys (`text`, `note`, `notes`, `error`, `query`, `prompt`, `audio`, `verbatim_quote`, `body`, `body_rendered`, `markdownBody`, `plainText`, `patientName`, `abhaAddress`, `phone`, `phoneNumber`, `caregiver_name`, `transcript`, `audioBase64`, `attendance_note`, etc.) and recursively redacts objects and arrays before computing `entry_hash`. Furthermore, `sarvam-vision-ocr.ts:104` never copies HTTP response bodies into thrown `Error` messages (`throw new Error('ocr_sarvam_http_' + response.status)`).
2. **Strength Rating:** **Strong.**
3. **Exact Improvement Needed:** In `packages/adapters/src/sarvam-voice.ts:127-143, 181-190`, sanitize error responses from `/speech-to-text` and `/text-to-speech` so raw upstream error text is not echoed into `SarvamError.message` or `console.error` in `stt/route.ts:69`.
4. **Most Effective Live Demo:** Sign in as `auditor.k@rci.demo`, open `/patients/[id]/audit`, and show `<redacted>` placeholders in the hash-verified audit stream.

#### Q6.4: *"Is `SARVAM_API_KEY` exposed to the browser in Next.js client bundles?"*
1. **Evidence-Based Code Answer:** **No.** `SARVAM_API_KEY` is only accessed server-side inside `packages/adapters/src/sarvam-voice.ts`, `packages/adapters/src/sarvam-vision-ocr.ts`, `packages/db/src/env.ts`, and `apps/worker/src/config.ts`. The client hook `useVoice.ts` only receives a boolean `{ configured: true | false }` from `GET /api/v1/assistant/voice/stt`.
2. **Strength Rating:** **Strong.**
3. **Exact Improvement Needed:** Require an authenticated session on `GET /api/v1/assistant/voice/stt` so unauthenticated scanners cannot probe whether `SARVAM_API_KEY` is configured.
4. **Most Effective Live Demo:** Inspect `/api/v1/assistant/voice/stt` response showing only `{"configured":true}`.

#### Q6.5: *"Do all database tables enforce `FORCE ROW LEVEL SECURITY`?"*
1. **Evidence-Based Code Answer:** 37 core and V4 tables enforce both `ENABLE ROW LEVEL SECURITY` and `FORCE ROW LEVEL SECURITY` (`0003_policies_grants.sql`, `0011_v4_oncology_enhancement.sql`). However, the 13 tables added in Milestone A (`0016`) and Milestone B (`0019`) only run `ENABLE ROW LEVEL SECURITY` without `FORCE ROW LEVEL SECURITY`. While `oncobrief_app` is not the table owner (so RLS still applies at runtime), table-owner queries bypass RLS on those 13 tables.
2. **Strength Rating:** **Good, Needs 1 Migration to Be 100% Uniform.**
3. **Exact Improvement Needed:** Add migration `0020_remediation_rls_and_governance.sql` applying `FORCE ROW LEVEL SECURITY` to all 13 Milestone A/B tables.
4. **Most Effective Live Demo:** Show `packages/db/test/security.test.ts` verifying cross-tenant queries return 0 rows.

---

## 13. Improvement Backlog Within Actual Hackathon Scope

We evaluated all candidate enhancements against official Health-a-thon relevance, Cancer Care workflow value, technical feasibility, testability, time required, cost, clinical safety risk, demo impact, and complexity:

### P0 — Critical (Must Fix Immediately — Broken Core / Scope / Demo Blockers)
1. **Fix `normalizeLanguageCode()` Casing & Odia Code (`od-IN`) in `sarvam-voice.ts:59-64`:**
   - *Why P0:* Currently breaks 100% of Indic STT and TTS requests by forcing `'en-IN'`. (15 mins)
2. **Seed All 11 Approved Indic `message_template` Rows & Align Locale Codes (`en-IN`, `hi-IN`, `ta-IN`, etc.) in `seed.ts` & `ContinuityAudioPlayer.tsx`:**
   - *Why P0:* Without approved templates in Tamil, Telugu, Kannada, Malayalam, Bengali, Marathi, Gujarati, Punjabi, and Odia (`en-IN` and `hi-IN` normalized from `'en'`/`'hi'`), multilingual care continuity is just a voice dropdown reading English text. Deterministic pre-approved templates are safer and faster than live LLM translation. (1 hr)
3. **Fix `/workspace` Readiness Counter & Filter (`'complete'` → `'ready'`) and Milestone B Seed Typo (`'ananya.mukhopadhyay@rci.invalid'` → `'dr.ananya@rci.demo'`):**
   - *Why P0:* Main landing page currently shows `0 Record Complete` and `/appointments` + `/tumor-board` are empty on a fresh seed. (45 mins)
4. **Remediate Milestone B Clinical Boundary Contradiction on `/tumor-board` and `/encounters/[encounterId]`:**
   - *Why P0:* Free-text `clinicalStaging` and `recommendationNotes` violate OncoBrief's non-clinical boundary and Ledger-only clinical fact invariant. Bind staging to verified `stage_text.as_written` ledger facts and pass coordination notes through `scanForBoundaryViolation()`. (1.5 hrs)
5. **Remove Fake 4.0-Second `"Sarvam Vision"` Upload Stepper & Add Smart Auto-OCR Fallback (`DocumentUploadForm.tsx`, `ProcessingStatusCard.tsx`, `ocr-routing.ts`):**
   - *Why P0:* Presenting `setTimeout` animations and hardcoded `"Sarvam Vision: Active"` badges when running `local-pdf` destroys technical credibility, and `OCR_DRIVER=auto` currently crashes digital PDF uploads if `SARVAM_API_KEY` fails. (1.5 hrs)

### P1 — High-Value Before Build Sprint Completion (Strong Demo & Reliability Impact)
6. **Fix Multi-Chunk WAV Header Concatenation in `sarvamTts()` (`sarvam-voice.ts:194`) & Browser Voice Fallback Filter (`ContinuityAudioPlayer.tsx:92`, `useVoice.ts:257, 333`):**
   - *Why P1:* Ensures multi-sentence Sarvam TTS audio plays without corruption, falls back to browser STT if `/api/v1/assistant/voice/stt` returns 503, and allows non-`localService` browser voices (like Chrome's built-in Google Hindi/Tamil voices) when offline. (1 hr)
7. **Add Bilingual/Indic Label Patterns to `RuleBasedExtractor` & Pass Document Language to `ingestDocument()`:**
   - *Why P1:* Allows `RuleBasedExtractor` to extract dates, MRNs, ABHA IDs, Hemoglobin/WBC/Platelets, and key oncology fields from Hindi/Tamil/bilingual documents extracted by Sarvam Vision OCR without requiring an unconstrained LLM. (1.5 hrs)
8. **Wire Stage B `validateCandidateProvenance()` in `ledger.ts:insertFact()` & Restrict `SarvamVisionOcrAdapter` 6s Delay to `POST` Calls Only:**
   - *Why P1:* Closes the Stage B value-in-quote provenance gap and cuts Sarvam OCR polling latency from 18s+ down to ~3–5s. (1 hr)
9. **Synchronize `/appointments` (`appointment`) and `/workspace?view=opd` (`opd_appointment_slot`) + Add Waitlist Offer Acceptance Button:**
   - *Why P1:* Unifies the Use Case 04 clinic flow story so check-ins and waitlist backfills stay in sync across views. (2 hrs)

### P2 — Strong Extras (Only After P0 & P1 Are Verified Green)
10. **Upgrade STT Default to `saaras:v4` with Oncology Administrative `keyterms` & Add RBAC/Size Guard on `/api/v1/assistant/voice/stt`:**
    - *Why P2:* Improves recognition of `histopathology`, `mastectomy`, `PET-CT`, `ABHA`, `NCG` with 5 lines of code and hardens the STT endpoint. (45 mins)
11. **Wire `[G#]` Citation Deep-Links (`?guideline=<id>`) on `/patients/[id]/sources` & Relax Studio Line Validator to Stage B Entailment:**
    - *Why P2:* Makes clicking `[G1]` in Ask OncoBrief open the referenced SOP span and lets clinicians edit Studio prose naturally while keeping `[E#]` grounding. (2 hrs)
12. **Add 60–90-Day Pilot Operational KPI Telemetry Strip on `/workspace`:**
    - *Why P2:* Directly answers the Health-a-thon 60–90-day measurable impact criterion using live DB counts. (1 hr)

### P3 — Defer to Post-Hackathon 60–90-Day Hospital Pilot (Explicitly Rejected for Build Sprint)
- **Live WhatsApp Business API / Exotel IVR Telecom Integration:** Requires TRAI DLT registration and meta business verification; violates no-external-PHI safety rule during hackathon judging. Keep simulated outbox + downloadable `.wav` preview.
- **Replacing Extraction/Chat LLMs with `Sarvam-105B` or Building Heavy LangChain/Hermes Multi-Agent Servers:** Adds latency and failure modes without improving consultation readiness.
- **Full Browser Extension (`apps/extension`) or Live NHA ABDM Production Gateway Certification:** Out of critical path for the 7–10 minute finale demo.
- **Autonomous Clinical Summarization, Stage Inference, or Trial Matching:** **Strictly rejected**—violates Health-a-thon non-diagnostic rules.

---

## 14. Prioritized Build Sprint Execution Plan (Remaining 8 Days Before 7 Nov 2026 Deadline)

| Priority | Issue | Exact Files | Required Change | Acceptance Criteria | Test | Dependencies | Est. Effort | Demo Benefit |
| :---: | :--- | :--- | :--- | :--- | :--- | :--- | :---: | :--- |
| **P0-1** | `normalizeLanguageCode()` lowercases `'hi-IN'` to `'hi-in'`, forcing all Sarvam STT/TTS calls to `'en-IN'`; Odia is `'or-IN'` instead of `'od-IN'` | `packages/adapters/src/sarvam-voice.ts:40-64, 110, 165`; `apps/web/src/lib/assistant/providers.test.ts` | Normalize BCP-47 to `xx-YY` (`lang.toLowerCase() + '-' + region.toUpperCase()`); map `'or-IN'` ↔ `'od-IN'` on Sarvam wire payloads; assert outbound `target_language_code` and `language_code` in unit tests. | `normalizeLanguageCode('ta-IN') === 'ta-IN'`, `normalizeLanguageCode('hi_in') === 'hi-IN'`, and `sarvamTts({ text, languageCode: 'ta-IN' })` sends `target_language_code: 'ta-IN'`. | `providers.test.ts` | None | **20 mins** | Unlocks genuine Tamil, Hindi, Telugu, and 10-Indic-language voice synthesis and dictation in live demo. |
| **P0-2** | Only `'en'` and `'hi'` templates exist in `seed.ts`; locale codes (`'en'` vs `'en-IN'`) mismatch `ContinuityAudioPlayer` | `packages/db/src/seed.ts:434-460`; `apps/web/src/components/ContinuityAudioPlayer.tsx:22-45, 148-174` | Seed clinician-approved `appointment_reminder` templates for all 11 `SUPPORTED_LOCALES` (`en-IN`, `hi-IN`, `ta-IN`, `te-IN`, `bn-IN`, `mr-IN`, `kn-IN`, `ml-IN`, `gu-IN`, `pa-IN`, `or-IN`) with `{{appointment_date}}`, `{{appointment_location}}`, `{{records_office_phone}}`; sync audio player default locale to message locale. | Coordinator can compose a reminder in any of 11 locales on `/patients/[id]/continuity`, and clicking `Generate & Preview Spoken Voice Note` synthesizes native-script text in the matching voice. | `continuity-grounding.test.ts` & `phase5-continuity-voice.spec.ts` | `P0-1` | **1.0 hr** | Makes the 11-language care continuity & caregiver story 100% real and safe (zero hallucinated translations). |
| **P0-3** | `/workspace` shows `0 Record Complete` (`'complete'` vs `'ready'`) and Milestone B seed fails (`'ananya.mukhopadhyay@rci.invalid'`) | `apps/web/src/app/(app)/workspace/page.tsx:86-107, 189-196`; `packages/db/src/seed.ts:45-95, 1148-1350` | Replace `'complete'` with `'ready'` and dropdown options with `'ready' | 'gaps' | 'blocked' | 'none'` in `workspace/page.tsx`; fix `seed.ts` to seed Milestone B sessions, appointments, encounters, and tumor board cases using `'dr.ananya@rci.demo'` and `'dr.rao@rci.demo'`. | `/workspace` displays `Record Ready: 1` (`DEMO-003`), readiness filters return matching rows, and `/appointments` + `/tumor-board` render populated demo rows after `pnpm demo:reset`. | `demo-flow.spec.ts` & `milestone-b.test.ts` | None | **45 mins** | Eliminates the glaring `0 Record Complete` and empty `/appointments` / `/tumor-board` bugs on the main screens. |
| **P0-4** | Milestone B `/tumor-board` and `/encounters` allow unanchored free-text TNM staging and treatment recommendations | `packages/db/migrations/0020_remediation_rls_and_governance.sql`; `packages/db/src/services/tumor-board.ts`; `packages/db/src/services/encounters.ts`; `apps/web/src/app/(app)/tumor-board/page.tsx`; `apps/web/src/app/(app)/patients/[id]/encounters/[encounterId]/page.tsx` | Apply `FORCE ROW LEVEL SECURITY` to 13 Milestone A/B tables; replace free-text `clinicalStaging` on `/tumor-board` with a selector bound to verified `stage_text.as_written` facts in `evidence_fact`; relabel textareas as administrative coordination notes and enforce `scanForBoundaryViolation()`. | Cannot submit unanchored TNM staging or treatment prescriptions on `/tumor-board` or `/encounters`; `pnpm boundary:check` and security tests pass. | `milestone-b.test.ts` & `security-regression.test.ts` | `P0-3` | **1.5 hrs** | Eliminates a potential submission-disqualifying clinical-boundary violation during clinical judge review. |
| **P0-5** | Fake 4.0s `"Sarvam Vision"` upload timer in `DocumentUploadForm.tsx`, static `"Sarvam Vision: Active"` badge in `ProcessingStatusCard.tsx`, and no runtime fallback when `OCR_DRIVER=auto` fails | `apps/web/src/components/DocumentUploadForm.tsx:188-228`; `apps/web/src/components/ProcessingStatusCard.tsx:94-130, 371-379`; `packages/adapters/src/ocr-routing.ts:15-39`; `packages/db/src/services/documents.ts:435-465` | Remove `setTimeout` sleeps in `DocumentUploadForm.tsx`; bind `ProcessingStatusCard` to actual `ocrDriver`/`extractionDriver`; in `ocr-routing.ts` (`auto`), try `LocalMultimodalOcrAdapter` first for digital PDFs with embedded text, route scans/images/Indic to `SarvamVisionOcrAdapter`, and fall back cleanly if cloud OCR is unreachable. | Uploading a digital PDF completes in `<200ms` showing the true engine (`local-multimodal` or `sarvam-vision`), and an offline/expired `SARVAM_API_KEY` never breaks digital PDF uploads. | `ocr-correctness.test.ts` & `ocr-routing.test.ts` | None | **1.5 hrs** | Protects live demo from Wi-Fi/API failures and removes dishonest UI timers before technical code review. |
| **P1-1** | Multi-chunk TTS WAV header corruption (`data.audios.join('')`), STT client fallback failure when `configured=true`, and overly strict `localService` browser voice filter | `packages/adapters/src/sarvam-voice.ts:192-198`; `apps/web/src/components/assistant/useVoice.ts:226-264, 333`; `apps/web/src/components/ContinuityAudioPlayer.tsx:11-12, 92` | Merge PCM payloads across `data.audios[]` into a single valid WAV header (`24000` Hz default); in `useVoice.ts:257`, fall back to `startBrowserRecognition()` if `transcribeWithSarvam()` fails; in `ContinuityAudioPlayer.tsx:92` and `useVoice.ts:333`, prefer `localService` voice but allow any installed/browser voice matching `lang`; replace 0-byte WAV with audible chime WAV. | Multi-chunk Sarvam TTS plays cleanly; browser speech synthesis works in Chrome/macOS when Sarvam is offline; STT falls back to Web Speech API on 503. | `providers.test.ts` & `phase5-continuity-voice.spec.ts` | `P0-1` | **1.0 hr** | Guarantees working audible speech in both live Sarvam mode and offline fallback mode. |
| **P1-2** | Stage B `validateCandidateProvenance()` unwired in `ledger.ts`, 6s delay applied to `GET` polls in `sarvam-vision-ocr.ts`, and `RuleBasedExtractor` lacks Indic/bilingual label support | `packages/db/src/services/ledger.ts:218`; `packages/adapters/src/sarvam-vision-ocr.ts:87-108, 175-218`; `packages/adapters/src/rule-based-extractor.ts` | Call `validateCandidateProvenance()` in `insertFact()`; restrict `minIntervalMs` 6s delay in `SarvamVisionOcrAdapter` to `POST` requests only (poll `GET /status` every 1.5s); add bilingual/Hindi/Tamil header keywords and pass `language` into `ingestDocument()`. | Stage B rejects unentailed values in `insertFact()`; Sarvam OCR polls complete 3× faster; bilingual/Indic referral reports extract key dates/labs/diagnoses. | `ledger.test.ts` & `ocr-correctness.test.ts` | `P0-5` | **1.5 hrs** | Enables real end-to-end Indic/bilingual document upload → OCR → Evidence Ledger in the live demo. |
| **P1-3** | `/appointments` and `/workspace?view=opd` out of sync; no waitlist offer acceptance button | `packages/db/src/services/appointments.ts`; `packages/db/src/services/opd-flow.ts`; `apps/web/src/components/OpdWorkspace.tsx` | Synchronize status updates between `appointment` and `opd_appointment_slot` via `appointment_id`; add `acceptOpdSlotOffer()` and UI button in `OpdWorkspace.tsx`. | Checking in on `/appointments` updates `/workspace?view=opd`, and accepting a waitlist offer assigns the vacant slot. | `opd-flow.test.ts` & `phase3-opd.spec.ts` | `P0-3` | **2.0 hrs** | Completes the Use Case 04 Smart OPD Flow loop end to end. |
| **P2-1** | Broken `[G#]` citation deep-link (`?guideline=<id>`), rigid Studio exact-line validator, and missing 60–90d KPI strip | `apps/web/src/app/(app)/patients/[id]/sources/page.tsx`; `packages/domain/src/studio/draft-generator.ts:448-485`; `apps/web/src/app/(app)/workspace/page.tsx` | Render Guideline SOP Inspector on `/sources?guideline=<id>`; validate edited Studio lines via Stage B entailment; render 60–90-day Pilot KPI strip on `/workspace`. | Clicking `[G1]` opens the SOP span; clinicians can edit Studio prose; `/workspace` shows pilot KPIs. | `phase4-studio-guidelines.spec.ts` | `P1-2` | **2.5 hrs** | Polishes Use Case 05 and 60–90-day impact storytelling. |

---

## 15. Demo Readiness Checklist & Minimum Viable End-to-End Judging Path

### 15.1 Evaluation of the Required Minimum Viable End-to-End Judging Path

**Target Path:**
`Document upload → Sarvam OCR → Verified source-linked evidence → Clinician consultation readiness → Approved administrative reminder → Regional-language voice preview.`

| Step in End-to-End Path | Can Current Code (`7b2edec`) Complete This Without Mocks? | Weak or Missing Link Identified | Status After P0/P1 Fixes (4–6 Hrs) |
| :--- | :---: | :--- | :---: |
| **1. Document Upload** (`/patients/[id]/sources`) | **YES (Local FS / S3)** | UI runs a fake 4.0s `setTimeout` stepper claiming `"Sarvam Vision"` (`DocumentUploadForm.tsx:188-228`). | **100% Real & Instant** |
| **2. Sarvam OCR** (`SarvamVisionOcrAdapter`) | **PARTIAL / UNVERIFIED LIVE** | `SARVAM_API_KEY` is present in `.env`, and `OCR_DRIVER=auto` routes to `SarvamVisionOcrAdapter`, **but** (a) live response schema of `/doc-ai/v1/job/{id}/results?format=json` vs `/download-url` is unverified; (b) 6s delay on `GET /status` slows polling to 18s+; (c) `RuleBasedExtractor` only matches English labels. | **100% Real (With Instant Local PDF Fallback if Offline)** |
| **3. Verified Source-Linked Evidence** (`SourcePaneView` + `verifyEvidenceBatch`) | **YES (100% Real)** | Stage A (`validateSpans`), normalized `[0..1]` SVG bounding boxes in `SourcePaneView.tsx`, 2-click batch verification (`verifyEvidenceBatch`), and Reconciliation Room (`resolveConflict`) work end-to-end against real PostgreSQL. | **100% Real (With Stage B Wired)** |
| **4. Clinician Consultation Readiness** (`/patients/[id]/evidence` & `/packet`) | **YES (100% Real on Patient Page; Broken Counter on `/workspace`)** | `ChangesSinceLastVisitBanner`, `LongitudinalLabFlowsheet`, `MedicationHistoryView`, and `createPacket`/`approvePacket` work end-to-end; only `/workspace` readiness counter (`'complete'` vs `'ready'`) is broken. | **100% Real** |
| **5. Approved Administrative Reminder** (`/patients/[id]/continuity`) | **YES for En/Hi; NO for Tamil/Other 9 Indic Locales** | `composeMessage`, `checkMessageGate()` (tracing `{{appointment_date}}` to verified `evidence_fact`), and `approveMessage` (clinician-only) work end-to-end, but `seed.ts` only has `'en'` and `'hi'` templates. | **100% Real Across All 11 Locales** |
| **6. Regional-Language Voice Preview** (`ContinuityAudioPlayer` → `/api/v1/continuity/tts` → `sarvamTts`) | **NO (Broken by P0 Casing Bug)** | `scopedTts.ts` security gate works, **but** `normalizeLanguageCode()` (`sarvam-voice.ts:60`) rewrites `'ta-IN'`/`'hi-IN'` to `'en-IN'`, and multi-chunk WAV concatenation (`sarvam-voice.ts:194`) is buggy. | **100% Real Spoken Indic Audio via Bulbul v3** |

### 15.2 Live Demo vs. Explicit Backup Simulation Path

| Demo Component | Primary Live Judging Path (After P0/P1 Fixes + Live Key Smoke Check) | Backup Offline / Simulation Path (If Venue Wi-Fi Drops) | Explicit UI Badge Shown |
| :--- | :--- | :--- | :--- |
| **Document Upload & OCR** | Upload 1-page scanned oncology referral (`image/png` or scanned PDF) → `SarvamVisionOcrAdapter` (`sarvam-vision`) extracts spans & bounding boxes in ~4s. | Upload `02_CBC_with_Differential_02_Jun_2026_DEMO.pdf` → `LocalMultimodalOcrAdapter` (`local-multimodal`) extracts 4-column lab table & `[0..1]` bounding boxes in `40ms`. | `Engine: sarvam-vision` vs `Engine: local-multimodal (Local PDF)` |
| **Evidence Verification & Conflict Resolution** | Live PostgreSQL 16 (`verifyEvidenceBatchAction` + `resolveConflictAction` on `DEMO-001` surgery date conflict). | Identical (100% local PostgreSQL, zero external dependency). | `✓ Verified` / `ledger hash chain: verified` |
| **Ask OncoBrief Voice Input & Grounded Q&A** | Dictate question via `Sarvam Saaras` (`/api/v1/assistant/voice/stt`) → answered with `[E#]`/`[G#]` citations via `nvidia-llm.ts`. | Type or use browser `SpeechRecognition` → answered deterministically via `synthesizeDeterministicGroundedAnswer()` with `[E#]`/`[G#]` citations. | `Provider: Sarvam Saaras` vs `Browser Speech / Deterministic Ledger` |
| **Regional Voice Continuity Preview** | Compose & approve Tamil (`ta-IN`) or Hindi (`hi-IN`) reminder on `DEMO-003` → click `Generate & Preview Spoken Voice Note` → play live `Sarvam Bulbul v3` audio (`<audio>` player) & download `.wav`. | Click `Play via Browser Speech (Local Preview)` using macOS/Chrome built-in Hindi/Tamil voice (`window.speechSynthesis`), or load labeled control chime. | `Generated: Sarvam Bulbul v3` vs `Browser Speech (Local Preview)` |
| **Outbound Patient & Caregiver Dispatch** | Click `Deliver` → writes patient + consented caregiver rows to `message_outbox` with `simulated = true`. | Identical (never sends real SMS/WhatsApp to avoid transmitting patient data). | `SIMULATED DELIVERY` |

---

## 16. 60–90-Day Hospital Pilot Metrics & Baseline Methodology

In accordance with the official [Health-a-thon 2026 Guide](https://healthathon.reskilll.com/guide) (*"Pick one operational metric you intend to move... and say how you would measure baseline and change"*), OncoBrief defines **four falsifiable, database-measured operational KPIs** for a 60–90-day observational shadow pilot at an NCG partner oncology OPD (e.g., 1 surgical oncology and 1 medical oncology unit, ~40 referred consultations/week):

| Operational KPI | Exact Definition & Formula | Baseline Measurement (Days 1–15 Shadow Observation) | Pilot Measurement in OncoBrief DB (Days 16–90) | Target Direction (Hypothesis to Test) |
| :--- | :--- | :--- | :--- | :--- |
| **KPI 1 (Primary): Pre-Consultation Chart Reconstruction & Verification Time** | Median clinician/resident time (seconds) from opening a referred patient's folder to completing a verified pre-consult summary packet. | Stopwatch/time-motion log across 50 consecutive new referrals before OncoBrief intake is used (literature baseline: 20–45 min for complex oncology referrals; internal hypothesis: ~8 min for standard follow-ups). | `EXTRACT(EPOCH FROM (consultation_packet.approved_at - document.first_uploaded_at))` and active review time between first `evidence.page_viewed` and `packet.approved` in `audit_event`, plus clicks reduced via `evidence.batch_verified`. | Test whether confidence-tiered batch verification and hover-to-source reduce active clinician verification clicks to `<= 4 clicks` and cut chart-review time by `>= 50%`. |
| **KPI 2: Day-of-Consult Missing-Record Deferral Rate** | Percentage of scheduled new/follow-up oncology consultations delayed or deferred because a required external report (pathology, IHC, imaging, insurance pre-auth) was missing at consultation start. | Count of OPD consultations marked deferred/incomplete in clinic register over 2 weeks (`deferred_consults / total_scheduled_consults`). | `SELECT count(*) FILTER (WHERE band = 'ready')::float / count(*) FROM record_readiness_snapshot` captured 24 hours prior to `opd_appointment_slot.starts_at`, paired with closure rate of `admin_task` (`task_kind = 'retrieve_document'`). | Increase T-24h `ready` packet rate and reduce day-of-clinic missing-document deferrals. |
| **KPI 3: Pre-Consult Cross-Document Discrepancy Catch Rate** | Number and percentage of cross-facility factual discrepancies (conflicting procedure dates, discordant receptor statuses, duplicate re-faxed reports) identified and reconciled *before* the consultation packet is approved. | Manual chart audit of 50 baseline referral packets by a senior oncology fellow. | `SELECT count(*) FROM conflict_set WHERE status = 'resolved' AND resolved_at <= packet.approved_at` and `document.duplicate_status = 'confirmed_duplicate'`. | Catch and explicitly reconcile 100% of machine-detectable date/biomarker conflicts prior to packet sign-off. |
| **KPI 4: Vacant OPD Slot Backfill Utilization & Caregiver Attendance Confirmation Rate** | (a) % of cancelled/delayed OPD slots backfilled with a `ready` waitlisted patient; (b) % of delivered appointment reminders receiving a confirmed patient/caregiver attendance response (`confirmed_attendance` / `cannot_attend`) at least 24h before slot time. | Historical clinic no-show and unfilled cancellation rate from hospital OPD register (Indian public/trust oncology OPD literature: 30–40% non-attendance). | (a) `opd_slot_event` transitions (`cancelled`/`vacant` → `offered` → `walk_in`); (b) `patient_message.attendance_status != 'no_response'` segmented by `locale` and `prefers_voice_note`. | Test whether regional-language voice previews + consented caregiver sync increase pre-visit attendance confirmation and allow coordinators to backfill vacated slots with `ready` patients. |

---

## 17. Sources and Evidence Appendix

### 17.1 Official External Sources Consulted
1. [Health-a-thon 2026 Official Website (Reskilll)](https://healthathon.reskilll.com/) — Verified Track 1 (Cancer Care in partnership with National Cancer Grid), 150 shortlisted Build Sprint teams (including ICONIX), Build Sprint window (10 Oct – 7 Nov 2026), Grand Finale date (28 Nov 2026 at IIT Bombay), and non-diagnostic scope.
2. [Health-a-thon 2026 Official FAQ & Participant Guide](https://healthathon.reskilll.com/guide) — Verified hard non-diagnostic guardrail, fake/anonymized data requirement, minimal Phase-1 integration expectation, multilingual & caregiver-friendly design bar, human override + audit trail expectation, and 60–90-day measurable operational KPI requirement.
3. [Koita Foundation Health-a-thon 2026 Overview](https://www.koitafoundation.org/health-a-thon) — Verified partner ecosystem (Koita Foundation, IIT Bombay KCDH, NCG, FOGSI, RSSDI) and operational assistive AI focus.
4. [Sarvam AI Models Documentation](https://docs.sarvam.ai/api/getting-started/models) — Verified current active vs. deprecated model catalog (`saaras:v4`/`saaras:v3`, `bulbul:v4-flash`/`bulbul:v3`, `sarvam-105b`, `mayura:v1`, `sarvam-translate:v1`, `sarvam-vision`; confirmed `Sarvam-M`, `Sarvam-30B`, `Saarika`, and `Bulbul v2` are deprecated).
5. [Sarvam Saaras Speech-to-Text Documentation](https://docs.sarvam.ai/api/getting-started/models/saaras) — Verified `/speech-to-text` endpoint, 30s REST limit, 23 supported languages (including `od-IN` for Odia), `mode` options (`transcribe`, `translate`, `verbatim`, `translit`, `codemix`), and `saaras:v4` `keyterms` prompting.
6. [Sarvam Bulbul Text-to-Speech Voices & API Reference](https://docs.sarvam.ai/api/api-guides-tutorials/text-to-speech/voices) & [REST Convert Reference](https://docs.sarvam.ai/api-reference/text-to-speech/convert) — Verified `/text-to-speech` endpoint, lowercase speaker requirement (`shubh`, `ritu`, `ishita`, etc.), 11-language coverage on `bulbul:v3`, and `audios[]` base64 WAV response array.
7. [Sarvam Vision & Document Intelligence Documentation](https://docs.sarvam.ai/api/getting-started/models/sarvam-vision), [Document Intelligence Overview](https://docs.sarvam.ai/api/api-guides-tutorials/document-intelligence/overview), [Digitise API](https://docs.sarvam.ai/api-reference/doc-ai/job/digitise), [Get Job Status](https://docs.sarvam.ai/api-reference/doc-ai/job/status), & [Get Job Results](https://docs.sarvam.ai/api-reference/doc-ai/job/results) — Verified 10-page PDF cap, 10 req/min rate limit, 23 languages, and async job lifecycle.
8. [Sarvam-105B Documentation](https://docs.sarvam.ai/api/getting-started/models/sarvam-105b) & [Mayura / Sarvam-Translate Documentation](https://docs.sarvam.ai/api/getting-started/models/mayura) — Verified LLM and text translation specifications.

### 17.2 Repository Evidence & Commit Trail
- **HEAD Commit Inspected:** `7b2edec` on branch `main`.
- **Committed Verification Evidence Logs Inspected:**
  - `docs/review-evidence/2026-10-24/final-verify.log` (`pnpm verify`: 886 automated tests passed across `domain` [415], `adapters` [86], `db` [183], `worker` [29], `web` [173]).
  - `docs/review-evidence/2026-10-24/browser-phase5-continuity-voice.log` (4 Playwright E2E tests passed in 1.7s).
  - `docs/review-evidence/2026-10-24/browser-assistant.log` (7 Playwright E2E tests passed in 3.4s).
  - `docs/review-evidence/2026-10-24/browser-results.json` (51 Playwright E2E tests passed across 12 spec files).
- **Key Source Files Audited with Line References:**
  - `packages/adapters/src/sarvam-vision-ocr.ts` (lines 1–337)
  - `packages/adapters/src/sarvam-voice.ts` (lines 1–245)
  - `packages/adapters/src/ocr-routing.ts` (lines 1–39)
  - `packages/adapters/src/local-multimodal-ocr.ts` (lines 1–505)
  - `packages/adapters/src/rule-based-extractor.ts` (lines 1–515)
  - `packages/adapters/src/nvidia-llm.ts` (lines 1–160)
  - `packages/adapters/src/bedrock-llm.ts` (lines 1–370)
  - `packages/domain/src/provenance/span-validation.ts` (lines 1–358)
  - `packages/domain/src/policy/clinical-boundary.ts` (lines 1–85)
  - `packages/db/src/container.ts` (lines 1–137)
  - `packages/db/src/env.ts` (lines 1–155)
  - `packages/db/src/seed.ts` (lines 1–1350)
  - `packages/db/src/services/documents.ts` (lines 1–590)
  - `packages/db/src/services/ledger.ts` (lines 1–760)
  - `packages/db/src/services/messages.ts` (lines 1–420)
  - `packages/db/src/services/caregivers.ts` (lines 1–215)
  - `packages/db/src/services/audit.ts` (lines 1–235)
  - `apps/worker/src/ports.ts` (lines 1–93), `config.ts` (lines 1–105), `handlers/document-ingest.ts` (lines 1–177), `handlers/ocr-result.ts` (lines 1–162)
  - `apps/web/src/lib/actions.ts` (lines 1–1050)
  - `apps/web/src/lib/scoped-tts.ts` (lines 1–60)
  - `apps/web/src/lib/locales.ts` (lines 1–15)
  - `apps/web/src/lib/assistant/orchestrator.ts` (lines 1–630), `classify.ts` (lines 1–145), `prompt.ts` (lines 1–365)
  - `apps/web/src/components/assistant/useVoice.ts` (lines 1–383), `AssistantPanel.tsx` (lines 1–455)
  - `apps/web/src/components/ContinuityAudioPlayer.tsx` (lines 1–263)
  - `apps/web/src/components/DocumentUploadForm.tsx` (lines 1–650)
  - `apps/web/src/components/ProcessingStatusCard.tsx` (lines 1–395)
  - `apps/web/src/components/SourcePaneView.tsx` (lines 1–295)
  - `apps/web/src/app/(app)/workspace/page.tsx` (lines 1–415)
  - `apps/web/src/app/(app)/tumor-board/page.tsx` (lines 1–410)
  - `apps/web/src/app/(app)/patients/[id]/encounters/[encounterId]/page.tsx` (lines 1–520)

---

## 18. Final Recommendation & Quantitative Audit Summary

### 18.1 Quantitative Audit Summary (`SARVAM_IMPLEMENTATION_TRACEABILITY.csv`)

- **Denominator & Methodology:** We evaluated **25 discrete Sarvam AI and directly coupled multimodal/extraction/orchestration requirements** (`SRV-DOC-01` through `SRV-LLM-01` in [`SARVAM_IMPLEMENTATION_TRACEABILITY.csv`](./SARVAM_IMPLEMENTATION_TRACEABILITY.csv)).
  - **Strict Verified Completion Percentage (`VERIFIED_WORKING` only):** **`16.0%`** (`4 / 25` capabilities: `SRV-DOC-06` tabular row grouping, `SRV-DOC-07` `<=10`-page PDF batch splitting, `SRV-DOC-09` partial-job rejection & empty-text quarantine, and `SRV-TTS-03` `scopedTts.ts` security/privacy gate).
  - **Connected Implementation Percentage (Including `IMPLEMENTED_NOT_LIVE_VERIFIED` [4] and `PARTIALLY_IMPLEMENTED` [10] at 0.5 weight):** **`44.0%`** (`(4 × 1.0 + 14 × 0.5) / 25 = 11.0 / 25`).
  - *(Note: Across the broader 50-requirement whole-application V4 + Milestone A/B matrix in `ONCOBRIEF_PLAN_VS_CODE_GAP_MATRIX.csv`, strict full verification is **56.0%** [`28 / 50`] and partial-credit completion is **73.0%** [`36.5 / 50`].)*

| Summary Metric | Count / Value | Details |
| :--- | :---: | :--- |
| **Current Verified Completion % (Sarvam Capabilities, Strict `VERIFIED_WORKING`)** | **16.0% (`4 / 25`)** | **44.0%** partial-credit across all 25 Sarvam/AI capabilities (`56.0%` strict / `73.0%` partial-credit across all 50 platform requirements) |
| **Overall Simulated Jury Score (Current State @ `7b2edec`)** | **61.0 / 100** | Projected to reach **86.5 / 100** after executing the 5 P0 fixes + 3 P1 fixes (~6–8 hours total work) |
| **Critical Blockers Count (`P0`)** | **5 P0 Blockers** | (1) `normalizeLanguageCode()` `'en-IN'` bug (`SRV-STT-03`/`SRV-TTS-01`); (2) Missing 9 Indic `message_template` rows & locale mismatch (`SRV-TRN-01`); (3) English-only `RuleBasedExtractor` + missing OCR language propagation (`SRV-DOC-05`); (4) Fake 4.0s `"Sarvam Vision"` upload timer + no `OCR_DRIVER=auto` runtime fallback (`SRV-DOC-11`); (5) Milestone A/B `/workspace` `'complete'` bug, `seed.ts` typo, and `/tumor-board` free-text staging boundary violation |
| **Features Genuinely `VERIFIED WORKING` (Sarvam Matrix)** | **4 / 25** | `SRV-DOC-06`, `SRV-DOC-07`, `SRV-DOC-09`, `SRV-TTS-03` (plus **4** `IMPLEMENTED, NOT LIVE-VERIFIED`: `SRV-DOC-01`, `SRV-DOC-02`, `SRV-DOC-03`, `SRV-STT-01`) |
| **Features `PARTIALLY IMPLEMENTED` (Sarvam Matrix)** | **10 / 25** | `SRV-DOC-04`, `SRV-DOC-05`, `SRV-DOC-08`, `SRV-DOC-10`, `SRV-DOC-11`, `SRV-STT-02`, `SRV-STT-04`, `SRV-STT-05`, `SRV-STT-06`, `SRV-TTS-02` |
| **Features `MOCKED / SIMULATED` or `STUB / UI ONLY` (Sarvam Matrix)** | **3 / 25** | **2** `MOCKED / SIMULATED` (`SRV-TTS-04` silent WAV fallback, `SRV-TTS-05` simulated outbox delivery) + **1** `STUB / UI ONLY` (`SRV-TRN-01` 11-locale selector without templates/translation) |
| **Features `BROKEN` or `PLANNED ONLY` (Sarvam Matrix)** | **4 / 25** | **2** `BROKEN` (`SRV-STT-03`, `SRV-TTS-01`) + **2** `PLANNED ONLY` (`SRV-TRN-02`, `SRV-LLM-01`) |
| **Live Demo Recommendation** | **CONDITIONAL GO** | **NO-GO for live Sarvam/multilingual claims in the current unpatched state (`7b2edec`)**; **GO** immediately after applying the Top 5 fixes below (~4–6 hours). |

### 18.2 Top Five Highest-Impact Fixes Before Submission (7 November 2026)

1. **Fix `normalizeLanguageCode()` and Multi-Chunk WAV Merging in `packages/adapters/src/sarvam-voice.ts` (30 mins):**
   Preserve uppercase region subtags (`hi-IN`, `ta-IN`, `te-IN`, etc.), map `'or-IN'` → `'od-IN'` on Sarvam API calls, and properly merge PCM buffers across `data.audios[]` chunks so Sarvam Saaras STT and Bulbul TTS actually execute in the selected Indian language.
2. **Seed Approved `message_template` Rows for All 11 Locales in `packages/db/src/seed.ts` & Relax Browser Voice Fallback in `ContinuityAudioPlayer.tsx` (1 hour):**
   Normalize `'en'`/`'hi'` to `'en-IN'`/`'hi-IN'`, add deterministic clinician-approved templates for the remaining 9 Indic languages (`ta-IN`, `te-IN`, `bn-IN`, `mr-IN`, `kn-IN`, `ml-IN`, `gu-IN`, `pa-IN`, `or-IN`), and allow non-`localService` browser voices when Sarvam is offline.
3. **Remove Fake 4.0s Upload Stepper & Add Smart Local-First Auto-OCR Fallback in `DocumentUploadForm.tsx`, `ProcessingStatusCard.tsx`, and `ocr-routing.ts` (1.5 hours):**
   Display real server ingestion timings and active driver names, parse digital text PDFs locally first (`LocalMultimodalOcrAdapter`) in `<50ms`, route scans/images/Indic documents to `SarvamVisionOcrAdapter` (with 6s rate-limit applied only to `POST` calls), and fall back cleanly if cloud OCR errors.
4. **Fix `/workspace` Readiness Counter (`'complete'` → `'ready'`) and Milestone B Seed (`'ananya.mukhopadhyay@rci.invalid'` → `'dr.ananya@rci.demo'`) in `workspace/page.tsx` and `seed.ts` (45 mins):**
   Restore the main worklist counter (`Record Ready: 1`), working readiness filters, and populated `/appointments`, `/encounters`, and `/tumor-board` demo views.
5. **Bind `/tumor-board` Clinical Staging to Verified Evidence Ledger Facts & Wire Stage B Provenance (`validateCandidateProvenance`) in `ledger.ts` (1.5 hours):**
   Replace free-text staging/treatment inputs on `/tumor-board` and `/encounters` with verified `stage_text.as_written` ledger fact selectors and `scanForBoundaryViolation()` guards, apply `FORCE ROW LEVEL SECURITY` to the 13 Milestone A/B tables, and call `validateCandidateProvenance()` inside `insertFact()`.
