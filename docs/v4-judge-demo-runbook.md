# OncoBrief V4 — Complete Judge Demonstration Runbook (10-Scene Live Script)

> Current review note (2026-10-24): The synthetic local journey and relevant browser acceptance have been independently executed. See [actual results](v4-final-test-report.md) and [scene limitations](v4-final-demo-validation.md). External providers, spoken regional audio and narrated timing remain unverified.


**Event:** Health-a-thon 2026 — Cancer Care Track Judging Demonstration  
**Target Duration:** 7 to 10 minutes (plus 5 minutes Technical & Clinical Q&A)  
**Timing status:** 7–10 minutes is a target requiring a narrated rehearsal. Automation runtime excludes explanation, source review, and judge questions.
**Primary Demo Persona:** `DEMO-001 — Fragmented referral` (Breast Oncology Referral) + `DEMO-003 — Ready` (Surveillance / Ready Packet & Continuity)  
**Strict Boundary:** OncoBrief is an administrative oncology record-readiness, provenance, and care-continuity platform. It **never** diagnoses, stages, interprets scans/labs, recommends treatments, or triages clinical urgency.

---

## 0. Pre-Demo Readiness & Safe Environment Preparation (2 Minutes Before Judges Arrive)

### Step 0.1 — Verify Non-Destructive Local Readiness
Run from the repository root (`/Users/dhaanish/Documents/OncoBrief`):

```bash
pnpm demo:prepare
```

**Default `pnpm demo:prepare` only reads the database inside `BEGIN READ ONLY`; it does not migrate or seed. It verifies:**
1. Required environment variables (`DATABASE_URL`, `DATABASE_MIGRATOR_URL`, `SESSION_COOKIE_SECRET`, `OCR_DRIVER`, `EXTRACTION_DRIVER`, `LLM_PROVIDER`, `ABDM_DRIVER`).
2. Active provider modes (clearly reporting whether OCR, LLM, ABDM, and Voice TTS are running locally or in simulation/fallback mode).
3. PostgreSQL 16 connectivity and all 15 schema migrations (`0001_bootstrap.sql` through `0015_patient_attendance_confirmation.sql`).
4. Synthetic patient inventory. Destructive reset additionally requires explicit local demo configuration and synthetic organization, user, membership, and patient identity checks.
5. Presence of `DEMO-001`, `DEMO-002`, and `DEMO-003`, 4 OPD appointment slots, 1 OPD waitlist entry, 2 synthetic institutional SOP spans, and ledger hash-chain linkage (`ok = true`). This check does not recompute stored payload hashes or verify the audit stream.

### Step 0.2 — Demo Credentials Reference Table

| Role | Email | Password | Primary Demo Scenes | Key RBAC Authority |
| :--- | :--- | :--- | :--- | :--- |
| **Clinician (Oncologist)** | `dr.rao@rci.demo` | `oncobrief-demo` | Scenes 1–4, 6–8 | `evidence:verify`, `conflict:resolve`, `packet:approve`, `message:approve`, `opd:manage` |
| **Care Coordinator** | `coord.anita@rci.demo` | `oncobrief-demo` | Scenes 5, 9 | `opd:manage`, `task:create`, `task:assign`, `message:compose` (cannot approve packets/messages) |
| **Records Officer** | `records.deepak@rci.demo` | `oncobrief-demo` | Optional task/intake backup | `document:upload`, `evidence:verify`, `evidence:correct`, `checklist:author` |
| **Auditor (Read-Only)** | `auditor.k@rci.demo` | `oncobrief-demo` | Scene 10 | `audit:read`, `patient:read` (zero mutating permissions) |
| **Organization Admin** | `admin.sys@rci.demo` | `oncobrief-demo` | Backup for Scene 10 | `audit:read`, `user:manage`, `packet:export` |

---

## Scene-by-Scene Live Demonstration Script

### SCENE 1 — THE PROBLEM: Fragmented Multi-Hospital Oncology Referrals (0:00 – 0:45)

- **Screen / Route:** `/login` -> Log in as **`dr.rao@rci.demo`** (`oncobrief-demo`) -> lands on `/workspace`.
- **What to Point Out on Screen:**
  - In the **Patient Cases** table, highlight the three synthetic oncology demonstration patients and their readiness bands:
    - **`DEMO-001 — Fragmented referral`**: `blocked` (`red`) — 10 documents across 4 synthetic facilities, 2 initial open conflicts, unverified facts, missing required records.
    - **`DEMO-002 — Staleness`**: `blocked` (`red`) — 5 documents, reopened appointment date conflict after an earlier packet approval.
    - **`DEMO-003 — Ready`**: `ready` (`green`) — 9 documents, 0 conflicts, 0 unverified facts, 0 missing required documents.
- **Speaker Talking Points:**
  - *"This synthetic referral illustrates a folder of records spread across four invented facilities; it is an example, not a measured prevalence estimate."*
  - *"Before a tumour board or first consultation can happen, staff must manually reconstruct what surgery happened when, whether reports have arrived, and which CBC is latest. This demonstration illustrates that workflow; it does not measure hospital preparation time."*
  - *"OncoBrief solves the administrative record-readiness bottleneck without crossing into autonomous diagnosis or treatment."*

---

### SCENE 2 — DOCUMENT INTAKE & INTEROPERABILITY: Source-Preserved Extraction (0:45 – 1:45)

- **Action / Clicks:**
  1. Click **`DEMO-001 — Fragmented referral`** -> opens `/patients/[id]/evidence`.
  2. Click the **`Sources`** tab (`data-testid="tab-sources"`) -> opens `/patients/[id]/sources`.
  3. On fresh fixtures point out the 10 ingested source documents from `Sunrise Multispeciality Hospital`, `Meridian Diagnostics Laboratory`, `Regional Cancer Institute`, and `Northgate Imaging Centre`, including the flagged near-duplicate CT chest faxes (`ct-chest-fax.pdf` and `ct-chest-refax.pdf`).
  4. In the **Upload / Import Records** card (`data-testid="upload-import-card"`), click the **`Import from EHR / ABDM`** tab.
  5. Point out the **`Synthetic Demo Fixture — Standard Ingest`** badge and click **`Pull ABDM Bundle (Tata Memorial / ACTREC)`** (`data-testid="pull-abdm-bundle-tmc"`).
- **Expected Persisted Result:**
  - Green inline status banner confirms deterministic ingestion into the Evidence Ledger.
  - Newly extracted facts enter the ledger in **`extracted` (unverified)** state—never auto-verified—preserving character offsets (`char_start`, `char_end`) and bounding boxes (`bbox_x..h`) linked to the source document page.
- **Honesty Callout for Judges:**
  - *"Notice we never claim local PDF/FHIR extraction is live cloud OCR when running offline. The shared `createOcrAdapter` selects the configured provider. `auto` selects Sarvam if configured, then configured Textract, otherwise local parsing. Provider failures remain visible; a configured cloud failure does not silently switch to local OCR. Use `OCR_DRIVER=local-pdf` for a predictable local text-PDF/FHIR demonstration; raster scans require transcription."*

---

### SCENE 3 — CONSULTATION READINESS: Longitudinal Review & 2-Click Batch Verification (1:45 – 3:00)

- **Action / Clicks:**
  1. Click the **`Evidence`** tab (`data-testid="tab-evidence"`) on `DEMO-001`.
  2. Point out the **`Changes Since Last Consultation`** banner (`data-testid="changes-since-last-visit-banner"`), showing the baseline date (`05 Jul 2025`) and counts of new documents, new evidence facts, labs, and open conflicts since the last visit.
  3. Click the filter chip **`Since Last Visit`** (`data-testid="filter-since_last_visit"`), then click **`Longitudinal Lab Flowsheet`** (`data-testid="filter-labs"`).
  4. Point out the dated serial **Haemoglobin** observations (`02 Jun 2025`: `11.4 g/dL` vs. `26 Jul 2025`: `10.2 g/dL`) with the purely arithmetic delta (`-1.2 g/dL since 02 Jun 2025`) and direct source-document link (`cbc-report.pdf`, p. 1).
  5. Click **`Medication History`** (`data-testid="filter-meds"`) to show chronological systemic therapy records (`Doxorubicin and Cyclophosphamide — Cycle 1 on 28 July 2025`).
  6. In the **`Guided Readiness Banner`** (`data-testid="guided-readiness-banner"`), click **`Review & Verify High-Confidence Batch`** (`data-testid="open-batch-verify-btn"`) — **Click 1**.
  7. In the **`Batch Verification Review`** modal (`data-testid="batch-verification-modal"`), show that only facts with OCR confidence $\ge 90\%$ and zero open conflicts are eligible, inspect the verbatim quotes, and click **`Confirm Verification`** (`data-testid="confirm-batch-verify-btn"`) — **Click 2**.
- **Expected Persisted Result:**
  - Every selected fact transitions atomically to `verified` inside a single PostgreSQL transaction, writing individual `ledger_entry` rows (`action = 'fact_verified'`) plus a `batch_verified` audit event.

---

### SCENE 4 — EVIDENCE SAFETY: Competing Surgical-Date Claims & Reconciliation Room (3:00 – 4:00)

- **Action / Clicks:**
  1. From the **`Guided Readiness Banner`** (or the **`Conflicts`** tab `data-testid="tab-conflicts"`), click the open conflict on `DEMO-001` (`procedure.recorded`; inspect the displayed source values).
  2. Open the **Reconciliation Room** (`/patients/[id]/conflicts/[conflictId]`).
- **What to Point Out on Screen:**
  - Both competing source documents are displayed side by side with their highlighted bounding-box spans and verbatim quotes:
    - **Histopathology (`histopathology-report.pdf`, Meridian Diagnostics Laboratory):** "Modified radical mastectomy performed on 12 June 2025".
    - **Discharge (`discharge-summary.pdf`, Regional Cancer Institute):** "Modified radical mastectomy performed on 3 July 2025".
  - Select **Retain both**, enter `Synthetic demonstration: both recorded claims retained pending human facility confirmation`, and submit. No source establishes that the other date is a transcription error. If the imported example creates a second conflict, inspect and reconcile that room separately; import never resolves it automatically.
- **Speaker Talking Points:**
  - *"OncoBrief refuses to choose between competing source claims automatically. Both facts remain in the immutable ledger; the clinician records an explicit reconciliation decision with a mandatory reason, and the losing claim is marked `superseded` rather than deleted."*

---

### SCENE 5 — SMART ONCOLOGY OPD: Human Offers & Walk-In Backfill (4:00 – 5:00)

1. Open `/workspace` and select **Live oncology OPD** (`data-testid="opd-workspace"`).
2. The current seed has one explicitly configured clinic, `rci-oncology-opd`, and four slots: `ONCO-01` scheduled (`DEMO-001`, 09:00), `ONCO-02` checked in (`DEMO-002`, 09:30), `ONCO-03` scheduled (`DEMO-003`, 10:00), and a vacant 10:30–11:00 slot. Room labels are administrative configuration, not a service-line eligibility inference.
3. Click **Review backfill candidates** on vacant capacity. The single seeded waitlist entry is `DEMO-003`. Eligibility requires current administrative readiness, an assigned checklist, matching configured clinic, requested date reached, accessible sources, no overlapping active appointment, and no active offer.
4. Explain the deterministic order: only an authorized, provenance-backed `expedited_slot_requested` label sorts first; then requested date, entry creation time, and entry ID. There is no numeric priority, travel score, risk assessment, or medical triage score.
5. Select the candidate, review the rationale and explicit confirmation checkbox, then **Confirm slot offer**. The waitlist becomes `offered`; the slot remains `vacant` with no assigned patient. This sends no message and records no acceptance.
6. Select **Release offer**, enter an operational reason, and confirm. Only after release can the same candidate be selected through **Register walk-in**. Staff must explicitly confirm the patient has arrived. The slot becomes `walk_in`, the waitlist becomes `slotted`, and the backfill metric counts that assignment. Patient acceptance, offer expiry, and external scheduling are not implemented.

---

### SCENE 6 — SOURCE-BACKED TASK AND ACCOUNTABLE OWNER (5:00 – 5:45)

1. Switch to **`coord.anita@rci.demo`**. A clinician cannot assign task owners.
2. Open `DEMO-001` → **Record map**, expand a missing document's **Create task** control (`create-task-from-gap`) and confirm **Create task from this gap**. This anchors the task to the administrative requirement; it does not infer a medical order.
3. Open **Tasks**, select the task's **Task owner**, optionally set **Task deadline**, tick **Confirm owner and deadline**, then **Confirm assignment**.
4. Observe persisted `admin_task.assigned_to`, deadline, append-only `task_event`, and `task.assigned` audit. Claim Task, Escalate, `claimTask`, and `escalateTask` are not implemented; do not demonstrate those controls.

### SCENE 7 — CLINICIAN PRODUCTIVITY STUDIO: Source-Cited Drafts, Guidelines & De-Identification (5:45 – 7:00)

- **Action / Clicks:**
  1. Switch back to **`dr.rao@rci.demo`**, then navigate to **`DEMO-003 — Ready`** (`/workspace` -> click `DEMO-003` -> click **`Packet`** tab `data-testid="tab-packet"`).
  2. Click **assemble draft**, review the consultation packet, then **approve packet** (`approve-packet`). Verify JSON export. Scroll to the **Clinician Productivity Studio** (`data-testid="productivity-studio"`).
  3. Generate and inspect the four structured oncology draft formats:
     - **`referral_letter`** (*Specialist Referral / Transfer Letter*): Every clinical statement carries an inline `[E#]` citation linked to verified facts.
     - **`tumor_board_deck`** (*Multidisciplinary Tumor Board Presentation Deck*): 6-slide Markdown deck combining chronological interventions `[E#]`, open conflicts/gaps, and verbatim synthetic institutional demonstration SOP references `[G#]`, with Slide 6 reserved explicitly for **`[Clinician Input Required]`**.
     - **`academic_case_abstract`** (*De-Identified Academic Case Report Draft*): Uses relative event dates and a direct-identifier/date leak scanner; source prose can still contain identifiers, in which case approval is blocked. This draft requires manual review and includes the explicit **Algorithmic De-Identification Notice** (qualifying that automated suppression is not HIPAA §164.514(b)(1) expert determination).
     - **`patient_info_sheet`** (*Patient & Caregiver Visit Summary*): Plain-language administrative visit preparation instructions with zero invented medical or emergency advice.
  4. Finish with a newly generated **referral_letter**, inspect its cited text, then click **Approve & Freeze Document** (`data-testid="approve-studio-artifact"`) as `dr.rao@rci.demo`. Unsupported rewritten or uncited prose is rejected on save, approval, and export. Exact source clauses may be rearranged; changing the source set requires regeneration.
  5. Show the referral’s 64-character SHA-256 canonical snapshot hash and audited Markdown, JSON, ABDM and mCODE exports. De-identified artifacts deliberately block FHIR exports (`409`); their reviewed Markdown/JSON do not establish certified anonymization. The local FHIR validator is a structural check, not full profile conformance validation.

---

### SCENE 8 — MULTILINGUAL VOICE CONTINUITY & CAREGIVER NETWORK (7:00 – 8:15)

- **Action / Clicks:**
  1. On **`DEMO-003`**, click the **`Continuity`** tab (`data-testid="tab-continuity"`) -> opens `/patients/[id]/continuity`.
  2. In the **Consented Family Caregiver Network** section (`data-testid="caregiver-network-section"`):
     - Point out the seeded active consented caregiver (**`Kavita Menon`**, Spouse / Primary Caregiver, synthetic contact, preferred locale `en-IN`, `Consented & Active`).
     - Optionally register a second caregiver or toggle `Sync reminders`.
  3. As clinician, approve the seeded draft reminder (`approve-message`), then explicitly deliver it (`deliver-message`). Observe simulated patient/caregiver outbox receipts. There is no telecom delivery. Preview the message before switching to coordinator for attendance/consent actions.
  4. In the **Multilingual Voice Preview Audio Player** (`ContinuityAudioPlayer`):
     - Open the language selector showing all **11 supported locales** (1 English `en-IN` + 10 Indic languages: `hi-IN`, `ta-IN`, `te-IN`, `bn-IN`, `mr-IN`, `kn-IN`, `ml-IN`, `gu-IN`, `pa-IN`, `or-IN`).
     - Click **Generate & Preview Spoken Voice Note (Sarvam Bulbul v3)**. If unavailable, explicitly choose the browser speech fallback. Locale selection alone does not translate approved message text. Browser voice availability and offline operation depend on installed voices; test the selected locale before presenting. A silent synthetic preview is not spoken multilingual delivery.
  5. Log in as (or switch to) **`coord.anita@rci.demo`** (Coordinator) or use the **`Record Inbound Response`** panel (`data-testid="attendance-panel-..."`) on the delivered message:
     - Select **`Cannot Attend`** (`cannot_attend`), channel **`WhatsApp Reply`**, responder **`Caregiver`**, note `"Patient has travel delay; requested afternoon slot review"`, and click **`Record Inbound Response`** (`data-testid="record-attendance-button"`).
     - Point out the administrative notice: inbound responses log operational intentions for coordinator follow-up and **never** trigger autonomous medical orders or silent slot cancellations.
  6. Click **`Revoke Consent`** (`data-testid="revoke-caregiver-..."`) on a caregiver card to show immediate consent revocation (`Consent Revoked` badge, `is_active = false`, `revoked_at` timestamp, and zero future reminder dispatches).

---

### SCENE 9 — CLINICAL BOUNDARY & SAFETY REFUSAL (8:15 – 9:00)

- **Action / Clicks:**
  1. Click the floating **`Ask OncoBrief Assistant`** launcher in the bottom-right corner (`AssistantLauncher`).
  2. First ask a grounded record/guideline question:
     - *"Show the synthetic institutional intake SOP reference."*
     - Show the retrieved `[G#]` spans and their synthetic reference title. Ask for the latest source-recorded haemoglobin separately to show patient evidence `[E#]`. No NCG publication is seeded.
  3. Next ask an unsafe clinical decision / dosing question:
     - *"Should we increase the Paclitaxel dose for Cycle 2 or switch to trastuzumab, and what is the patient's survival prognosis?"*
- **Expected Persisted Result:**
  - The deterministic clinical boundary classifier (`classifyQuestion` in `apps/web/src/lib/assistant/classify.ts`) intercepts the query **before** any LLM generation and returns a hard refusal citing OncoBrief's non-clinical boundary statement.

---

### SCENE 10 — CRYPTOGRAPHIC AUDITABILITY & TAMPER-EVIDENT LEDGER (9:00 – 9:45)

- **Action / Clicks:**
  1. Log out and sign in as the read-only **Auditor**: **`auditor.k@rci.demo`** (`oncobrief-demo`).
  2. Open **`DEMO-001`** or **`DEMO-003`** and click the **`Audit`** tab (`data-testid="tab-audit"`) -> opens `/patients/[id]/audit`.
- **What to Point Out on Screen:**
  - Point out the green verification badge (`data-testid="ledger-verify"`, `data-ok="true"`):
    - **`ledger hash chain: verified · N entries`** (linkage checked for organization-wide `ledger_entry` sequence/hash pointers; this badge does not recompute payload hashes or verify `audit_event`).
  - Point out the chronological append-only audit stream showing the exact actions performed during the demo (`evidence.batch_verified`, `conflict.resolved`, `studio.draft_created`, `studio.approved`, `caregiver.registered`, `caregiver.revoked`, `message.attendance_recorded`), with configured sensitive metadata fields redacted; this is a tested filter, not proof that arbitrary input can never contain PHI.
  - Remind judges that `clinician`, `coordinator`, and `records_officer` receive `403 Forbidden` if they attempt to access `/patients/[id]/audit`, and `auditor` holds zero mutating permissions across the entire platform.

---

## Contingency & Recovery Procedures

1. **If Demo State Was Modified During Practice Runs:**
   - Run `pnpm demo:prepare --reseed` (or `pnpm demo:reset`) from `/Users/dhaanish/Documents/OncoBrief`. Both reset entry points enforce `NODE_ENV=development` (or an explicitly isolated test environment), `ONCOBRIEF_DEMO_MODE=true`, and `DEMO_DATABASE_NAME` matching both loopback database URLs. The database must already be migrated. Synthetic organization/user/membership/patient checks and truncation share one transaction; unsafe targets are rejected before destructive SQL. Reset duration must be measured in the actual environment.
2. **If External Wi-Fi / Internet Drops in the Judging Room:**
   - Core synthetic workflows can run locally with local PostgreSQL/storage, `OCR_DRIVER=local-pdf`, rule extraction/generation, and `ABDM_DRIVER=simulated`. `auto` can select configured cloud providers. Scanned documents and cloud TTS still require providers; browser speech depends on installed voices. Verify chosen scenes without internet before making an offline demonstration claim.


### Repeatability and safe recovery

The source import, verification, reconciliation, offers, walk-in, approval, delivery and consent revocation all persist. Run the entire sequence once per fresh synthetic reset; do not reset between scenes. Reset invalidates sessions and IDs, so sign in again. No provider wait is needed with explicit local configuration. Keep the coordinator and auditor logins ready: role changes are necessary. Do not revoke the seeded caregiver before the delivery demonstration.

Use `docs/v4-final-demo-validation.md` for the actual independent browser results and runtime limitations.
