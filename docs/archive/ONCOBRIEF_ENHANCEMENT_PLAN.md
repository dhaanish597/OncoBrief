# OncoBrief V4 — Cancer Care Track Enhancement Plan & Architectural Blueprint
**Cancer Care Track Only — Use Case 02 (Consultation Readiness), Use Case 04 (Clinic Operations & Patient Flow), Use Case 05 (Doctor Productivity & Knowledge Assistant), plus Cancer-Patient Care Continuity and Hackathon Design Principles**

- **Target Repository:** `/Users/dhaanish/Documents/OncoBrief`
- **Submission Track:** **Cancer Care only** ([National Cancer Grid / NCG-KCDO](https://www.kcdo.in/oncologyemr)). All use cases and implementation deliverables in this plan serve oncology patients and cancer-care teams; no other Health-a-thon track is being built or represented as a collaboration.
- **Standards & Stack:** TypeScript Monorepo (`pnpm@9.15.4`), Next.js 15 App Router, PostgreSQL 16 + Forced RLS, [NRCeS ABDM v6.5.0](https://nrces.in/ndhm/fhir/r4/6.5.0/), HL7 mCODE STU4, [Sarvam AI](https://www.sarvam.ai/) (`doc-digitise`, `saaras:v3`, `bulbul:v3`), Amazon Bedrock Nova Pro, and Deterministic Agentic State-Graph Orchestration
- **Scope Constraint:** Oncology-specific patients, datasets, clinical-source documents, guideline library, checklist packs, OPD flows, demo stories, and success metrics. Any use outside cancer care is a possible future adaptation, **not part of this submission**.

---

## 1. Executive Charter, Vision & Target OKRs

### 1.1 Overarching Vision
OncoBrief V1–V3 established a strong foundation: an append-only, span-anchored **Evidence Ledger** (`packages/db/src/services/ledger.ts`), a two-stage deterministic provenance gate (`packages/domain/src/provenance/span-validation.ts`), a side-by-side **Reconciliation Room** (`apps/web/src/app/(app)/patients/[id]/conflicts/[conflictId]/page.tsx`), and strict code-level enforcement of the non-clinical boundary (`packages/domain/src/policy/clinical-boundary.ts`).

However, our audit against the official hackathon rubric revealed that OncoBrief currently operates as a **single-track, high-friction new-patient document intake ledger** rather than a low-click, longitudinal clinical operations and productivity platform:
1. **Use Case 02 (Consultation Readiness & Patient Journey Review) Gaps:** It lacks a *"What Changed Since Last Visit"* interval delta view, misclassifies longitudinal serial lab trends as cross-document contradictions, drops documented pending investigation instructions, hardcodes incorrect facility/modality names in oncology timelines, and bypasses cloud/Indic OCR on local web uploads.
2. **Use Case 04 (Clinic Operations & Patient Flow) Gaps:** It has zero scheduling, slot, queue, arrival, walk-in, or waitlist tables, leaves tasks permanently `"unassigned"` in the UI, and never uses its `readiness_band` to prevent day-of-clinic bottlenecks or backfill cancelled OPD slots.
3. **Use Case 05 (Doctor Productivity & Knowledge Assistant) Gaps:** Its assistant classifier blocks all guideline and protocol lookups, has no institutional knowledge corpus, and refuses to draft audience-adapted professional artifacts (referral letters, tumor-board decks, academic case reports, or patient handouts).
4. **Design Principles & Accessibility Gaps:** It requires 45+ manual clicks to verify a single patient's chart (no batch verify), has zero caregiver data model or spoken voice-note preview on the Care Continuity page, leaves browser extension and ABDM/mCODE imports as alerts/stubs, and suffers from 375px mobile overflow and WCAG 2.2 AA contrast/label defects.

**The V4 Strategic Upgrade** transforms OncoBrief into a unified, oncology-only, multi-use-case **Clinical Readiness, OPD Flow & Grounded Knowledge Platform** where:
- **Every oncology follow-up consultation** opens with an instant **"Changes Since Last Visit" Delta Brief**, dated blood-test/medication flowsheets, and 1-click batch verification using configurable NCG-aligned cancer-care intake, tumor-board and follow-up checklists (**Use Case 02**).
- **Every oncology outpatient clinic** runs a **Readiness-Gated Smart OPD Queue** that tracks arrivals, walk-ins, delayed investigations, and clinician-assigned administrative priority tiers—automatically backfilling cancelled or blocked slots with waitlisted patients whose consultation packets are already verified `ready` (**Use Case 04**).
- **Every oncology clinician** has a **Source-Grounded Productivity & Protocol Co-Pilot** that searches span-anchored institutional oncology SOPs and NCG-aligned reference guidelines with bounding-box provenance, and drafts editable referral letters, tumor-board slide outlines, academic case summaries, and multilingual patient handouts where every factual sentence cites `[E1]`/`[G1]` ledger spans (**Use Case 05**).
- **Every cancer patient and consented family caregiver** receives verified administrative reminders and pre-procedure checklists as **playable regional-language voice notes** (`Sarvam Bulbul v3` across 11 Indic languages) with two-way attendance confirmation (**Design Principles & Use Case 01**).

### 1.2 Quantitative Objectives & Key Results (60–90 Day Pilot OKRs)

| Objective | Key Result (Self-Measured in Database Telemetry) | Baseline (V3) | Target (V4 Pilot) |
| :--- | :--- | :--- | :--- |
| **O1: Excel at Consultation Readiness & Longitudinal Review (Use Case 02)** | **KR1.1:** Reduce clinician clicks required to verify a 9-document referral packet via confidence-tiered batch verification (`verifyEvidenceBatchAction`). | 45+ clicks | **<= 4 clicks** |
| | **KR1.2:** Eliminate false-positive conflicts on longitudinal oncology serial CBC/lab records and dated medication administrations (`observed_on`). | 100% false-conflict rate on serial labs | **0% false conflicts on dated series** |
| | **KR1.3:** Seed and demonstrate NCG-aligned oncology intake, tumor-board preparation, and follow-up checklist variants; retain configurable document requirements within the **Cancer Care track**. | Existing oncology workflow only | **3 oncology workflow templates + oncology-only demo cases** |
| **O2: Optimize OPD Clinic Flow & Slot Utilization (Use Case 04)** | **KR2.1:** Track live OPD slot states (`scheduled`, `checked_in`, `in_consult`, `delayed_investigation`, `cancelled`, `walk_in`) and recommend `ready` waitlist backfills in `< 5 seconds`. | 0 slot/queue tracking | **100% slot state coverage + automated backfill** |
| | **KR2.2:** Achieve 100% task ownership assignment across coordinators, nurses, and records staff via in-row assignee controls. | 0% UI-assigned tasks (`unassigned`) | **100% assignable in 1 click** |
| **O3: Empower Doctor Productivity & Knowledge Synthesis (Use Case 05)** | **KR3.1:** Deliver 100% span-grounded answers over uploaded institutional SOPs and NCG/institutional oncology guideline PDFs (`[G1]` citations with bbox preview). | 0% (all guideline queries refused) | **100% grounded SOP/guideline retrieval** |
| | **KR3.2:** Generate 4 clinician-editable professional document formats (Referral Letter, Tumor Board Deck, Case Report Draft, Patient Handout) with 0 unanchored claims. | Raw JSON export only | **4 structured, source-cited formats** |
| **O4: Meet Cancer-Patient & Caregiver Accessibility, Multilingual & Safety Principles** | **KR4.1:** Enable caregiver registration and playable 11-language spoken audio reminders (`Sarvam Bulbul v3`) on `/continuity`. | Text-only En/Hi templates; 0 caregiver fields | **11 Indic languages + playable TTS audio + caregiver sync** |
| | **KR4.2:** Achieve 100% WCAG 2.2 AA contrast (`>= 4.5:1` text, `>= 3.0:1` UI borders), 0 unlabeled form inputs, and `0 px` horizontal overflow at `375px` mobile width. | 135+ unlabeled inputs; `+99px` to `+266px` mobile overflow | **0 axe/a11y violations; 0px mobile overflow** |

### 1.3 Explicit Non-Goals & Strict Out-of-Scope Boundaries
To preserve regulatory safety and 100% compliance with the hackathon's **Out of Scope** rules (`packages/domain/src/policy/clinical-boundary.ts`), OncoBrief V4 will **NEVER**:
1. **Compute or infer a medical diagnosis, cancer stage (TNM), or RECIST tumor response**—it only transcribes documented values verbatim (`diagnosis_text.as_written`, `stage_text.as_written`) and retrieves verbatim passages from human-approved institutional guideline documents.
2. **Generate autonomous treatment recommendations or clinical decision support (CDS)**—when searching institutional SOPs or NCG and hospital-approved oncology guidelines, the assistant retrieves and quotes the exact published guideline section with its source bounding box so the *clinician* reads and applies it; the system never tells the doctor what drug or dose to prescribe for a patient.
3. **Calculate a clinical risk score, physiological acuity score, or autonomous medical triage**—OPD queue prioritization in Use Case 04 uses **clinician-assigned or referring-doctor-documented administrative priority tags** (`new_referral`, `post_op_wound_check_documented`, `chemo_cycle_clearance_documented`, `expedited_slot_requested`, `routine_followup`) anchored to a source document or explicit human selection, never an AI-computed medical severity score.
4. **Interpret medical images (DICOM pixel arrays), pathology slides, or genomic variants**—multi-modal adapters extract only administrative headers, stated report text, and tabular lab rows as written.
5. **Execute silent automation**—every batch verification, conflict resolution, slot backfill offer, referral letter export, and patient/caregiver message requires explicit human confirmation and appends a tamper-evident SHA-256 hash-chained audit event.

---

## 2. Deep Competitive & Ecosystem Research

### 2.1 Cross-Use-Case Competitive Landscape Matrix

| Platform / System | Use Case Coverage | Core Strengths in Production | Critical Gaps in Indian / NCG Context | How OncoBrief V4 Beats or Bridges It |
| :--- | :--- | :--- | :--- | :--- |
| **[Vizlitics Consult Prep](https://www.vizlitics.io/consult-prep.html)** ([Cancer Insights](https://seed.nih.gov/portfolio/nih-portfolio-company-showcase/cancer-insights)) | **UC 02** (Oncology Consult Prep) | Pulls electronic records from 93% of US health systems; builds source-linked longitudinal cancer summaries and trial matches. | Assumes US HIE interoperability; relies on generative clinical summarization rather than deterministic fact-state separation (`extracted` vs `verified`) or conflict reconciliation rooms. | Adds zero-integration multi-report scan segmentation, deterministic two-stage span entailment, explicit contradiction reconciliation, and [NRCeS ABDM v6.5.0](https://nrces.in/ndhm/fhir/r4/6.5.0/) export. |
| **[GE HealthCare CareIntellect for Oncology](https://www.gehealthcare.com/en-us/about/newsroom/press-releases/ge-healthcare-announces-careintellect-for-oncology-harnessing-ai-to-give-clinicians-an-easy-way-to-see-the-patient-journey-in-a-single-view)** | **UC 02** (Longitudinal Timeline) | Summarizes multi-modal hospital data (DICOM, labs, notes) into a single view and flags progression since prior visits. | Enterprise hospital-locked deployment; crosses into clinical progression interpretation; no outpatient slot backfill or multilingual caregiver outreach. | Adopts CareIntellect's **"Changes Since Last Visit"** delta banner and serial lab trend flowsheets while keeping every value strictly `.as_written` and non-interpretive. |
| **[Navina Clinician Copilot](https://www.navina.ai/products/clinician-copilot)** ([Core Tech](https://www.navina.ai/core-technology)) | **UC 02** (Pre-Visit Chart Review across Chronic Care) | Problem-oriented pre-visit summaries across multiple care settings; links claims to PDF bounding boxes. | Focused on US Value-Based Care (HCC coding/RAF scores); lacks Indian regional language OCR/voice and OPD queue/slot management. | Adopts Navina's concise pre-visit and interval-change presentation patterns for oncology, while avoiding diagnostic HCC coding. |
| **[Tempus One](https://www.tempus.com/solutions/one/) & [Tempus Next](https://investors.tempus.com/news-releases/news-release-details/tempus-expands-next-platform-deliver-real-time-clinical)** | **UC 02 & UC 05** (Oncology AI & Care Gaps) | LLM timeline construction from unstructured PDFs ([ASCO 245826](https://www.asco.org/abstracts-presentations/245826)) and real-time guideline gap alerts. | Operates as a clinical decision support (CDS) and molecular profiling platform (out of scope for non-clinical guardrails). | Keeps guideline retrieval strictly as a clinician-initiated, span-grounded reference library (`[G1]`) rather than autonomous clinical alerting. |
| **[Honey Health](https://www.honeyhealth.ai/platform)** ([Pre-Charting](https://www.honeyhealth.ai/articles/what-does-ai-powered-pre-charting-include-and-how-does-it-summarize-patient-history-for-upcoming-encounters)) | **UC 02 & UC 04** (Referral Intake & Pre-Charting) | Autonomous AI workers ingest referrals, verify insurance authorizations, and pre-chart interval ER/consult notes before the visit. | US EHR-specific; lacks cryptographic append-only audit chains and side-by-side source contradiction resolution. | Adopts Honey Health's low-click pre-charting ergonomics (1-click batch verification of high-confidence spans and automated pending-order task extraction). |
| **[OpenEvidence](https://www.openevidence.com/about)** ([PMC Study](https://pmc.ncbi.nlm.nih.gov/articles/PMC12033599/)) | **UC 05** (Medical Literature & Guideline Co-Pilot) | Searches peer-reviewed literature and society guidelines (NCCN, AAP) to synthesize cited answers for teaching, research, and practice. | Queries external global literature without awareness of a hospital's local SOPs or the patient's administrative record readiness. | Adds an **Institutional SOP & Guideline Ledger** (`guideline_document` + `guideline_span`) so oncology doctors can query NCG and hospital-approved cancer-care protocols with exact bbox provenance. |
| **[Doximity GPT](https://www.doximity.com/enterprise/home/ucsd)** & **[Glass Health](https://glass.health/for-clinicians)** | **UC 05** (Clinical Writing & Admin Productivity) | Drafts referral letters, prior-auth appeals, after-visit summaries, and reading-level-adapted patient education handouts in seconds. | Prompt-only generation without character-level substring validation against underlying source PDFs—vulnerable to subtle date/lab hallucinations. | Builds an **Audience-Adaptive Studio** where referral letters, tumor-board decks, and patient handouts are compiled *exclusively* from verified ledger facts (`[E1]`). |
| **[LeanTaaS iQueue](https://iqueue.leantaas.com/iQueue-for-infusion-centers-lowering-wait-times-content-download.html)** & **[Phreesia](https://www.phreesia.com/blog-patient-scheduling-10-best-practices-for-peak-efficiency/)** | **UC 04** (OPD Flow, Scheduling & Slot Backfill) | LeanTaaS optimizes oncology clinic/infusion templates across 36+ NCI centers; Phreesia Appointment Accelerator backfills cancelled slots in ~5 minutes. | Neither system inspects whether a waitlisted patient's *outside medical records, pathology slides, and insurance auths* are actually ready before slotting them in. | Introduces **Readiness-Gated Slot Backfill**: when an OPD slot opens, OncoBrief recommends waitlisted patients whose record readiness band is already `ready`. |
| **[Qventus](https://www.qventus.com/solutions/perioperative-care-coordination/)** & **[Eka Care](https://www.eka.care/)** | **UC 04 & UC 02** (Pre-Visit Clearance & Indian OPD Queue) | Qventus flags missing pre-op clearances before surgery; Eka Care manages Indian OPD token queues and [ABHA ID linkage](https://www.eka.care/ayushman-bharat/create-abha-health-id-card). | Eka Care lacks multi-document contradiction reconciliation; Qventus is built for US inpatient/perioperative suites. | Combines Eka Care's Indian OPD token/walk-in queue and ABDM integration with Qventus-style pre-visit readiness gating and Sarvam Indic voice outreach. |
| **[Navya Care](https://navya.care/how-it-works)** & **[Karkinos Healthcare](https://www.karkinos.in/about_us)** | **Indian Oncology Ecosystem** | Navya provides NCG/TMC expert treatment opinions; Karkinos provides *KareMitra* navigators and a Command Centre. | Rely heavily on manual human chart abstraction to assemble unstructured paper/WhatsApp records before tumor-board review. | Serves as the upstream automated **Record-Readiness & Provenance Engine** that feeds clean, verified packets into NCG tumor boards and navigation workflows. |

### 2.2 Cancer Care Domain Requirements (NCG-Aligned Only)
This submission addresses oncology documentation and operational continuity across medical oncology, surgical oncology, radiation oncology, pathology, imaging, referrals, and tumor-board coordination. The relevant recurring document and workflow needs are:
1. **Longitudinal oncology records:** Histopathology/IHC reports and stated receptor status, biopsy results, surgery/operative notes, chemotherapy administration sheets and cycle labels, radiation completion summaries, serial CBC/tumor-marker reports, and appointment/referral documents—presented **as written**, not interpreted.
2. **Pre-consultation document readiness:** NCG-aligned administrative checklists tailored to cancer referral intake, tumor-board packet preparation, and oncology follow-up. Show which required source documents are present, missing, outdated, or awaiting human verification.
3. **Care-team and patient handoffs:** Retrieve explicitly documented pending IHC, imaging or external slides; assign document-retrieval tasks; coordinate oncology OPD slots; and send human-approved administrative reminders to cancer patients and consented caregivers.
4. **Reference knowledge for clinician review:** Version-pinned NCG/institutional oncology SOPs with page-level and bounding-box source links. The software does not convert guidelines into individualized prescriptions or treatment decisions.

**Future extensibility (not in this build):** The modular ledger, workflow and template architecture could be adapted to other specialties in a separate future effort. No non-oncology templates, patient fixtures, schemas, guideline corpora, screens, or metrics are included in this Cancer Care submission.

---

## 3. Root-Cause Summary of Current Application Failures

| Module / Subsystem | Exact File & Line in Repo | Current Failure Mode | Impacted Requirement |
| :--- | :--- | :--- | :--- |
| **Serial Lab & Medication Conflict Comparator** | `packages/domain/src/vocab/fact-types.ts:103-147` & `packages/domain/src/conflict/comparators.ts:144-169` | `slotQualifier` groups all `lab_result.as_written` by `lab:<name>` and all `medication.recorded` by `drug:<name>` regardless of `observed_on` date. Two CBC reports from June and July with different Hemoglobin values are flagged as a **contradiction** (`disagree`). | **UC 02:** Longitudinal lab trends & medication history |
| **Missing "Changes Since Last Visit" Delta Engine** | `apps/web/src/app/(app)/patients/[id]/evidence/page.tsx:50-56` & `packages/db/src/services/patients.ts:95-153` | `getTimeline` returns a flat list grouped by `YYYY-MM`. No concept of `last_consultation_date` or comparison against the previous approved `consultation_packet` exists. | **UC 02:** Quickly understand what changed since last visit |
| **Ignored Pending Investigation & Action Instructions** | `packages/domain/src/vocab/fact-types.ts:13-31` & `packages/adapters/src/rule-based-extractor.ts:59-250` | `FACT_TYPES` has no entry for pending investigations or explicit clinical-admin instructions (e.g., *"Bring prior imaging and histopathology slides"*, *"Awaiting IHC"*), so `RuleBasedExtractor` drops them. | **UC 02 & UC 04:** Pending investigations & action queues |
| **Hardcoded Local Upload Adapters & Stubbed Image OCR** | `apps/web/src/lib/actions.ts:313-320` & `packages/adapters/src/local-multimodal-ocr.ts:387-436` | `uploadDocumentAction` hardcodes `LocalMultimodalOcrAdapter` + `RuleBasedExtractor` (ignoring `OCR_DRIVER`); `extractImage` only returns image dimensions and SHA-256 without OCRing text in photos; `SarvamVisionOcrAdapter.splitPdfIntoBatches` (`sarvam-vision-ocr.ts:98-118`) replaces >10-page PDFs with synthetic stub text. | **UC 02 & Design Principles:** Multi-modal photo/scan OCR |
| **Fake EHR/ABDM Import & Link Tabs** | `apps/web/src/components/DocumentUploadForm.tsx:320-374` | "Import from EHR / ABDM" buttons only call browser `alert()`, and "Link to Existing" search button has no handler. | **UC 02 & Workflow First Principle** |
| **Hardcoded Oncology Labels in Timeline View** | `apps/web/src/components/TimelineNodeView.tsx:48,138` | Hardcodes `'Apollo Hospitals'` when `issuingFacility` is null and labels every imaging fact `'CT Scan (Thorax)'`; misrepresents actual oncology facilities and document types. | **UC 02:** Accurate cancer-care document timelines |
| **Zero OPD Scheduling, Slot, Arrival, or Waitlist Engine** | `packages/db/migrations/0002_schema.sql` & `apps/web/src/app/(app)/workspace/page.tsx:31-90` | No tables for `appointment_slot`, `opd_queue_entry`, or `waitlist_entry`. Workspace table does not even display `appointmentDate`, arrival status, walk-ins, or slot backfill options. | **UC 04:** Clinic Operations & Patient Flow |
| **Unassigned Tasks & Dead Server Actions** | `apps/web/src/app/(app)/patients/[id]/tasks/page.tsx:73-114` & `apps/web/src/lib/actions.ts:186,223,330` | `assignTaskAction`, `waiveGapAction`, and `withdrawPacketAction` have no UI triggers; all tasks created via UI render `"unassigned"`. | **UC 04 & UC 02:** Care-team coordination |
| **Assistant Blocks All Guideline/SOP Queries & Content Drafting** | `apps/web/src/lib/assistant/classify.ts:30-54`, `tools.ts:301` & `packages/adapters/src/bedrock-llm.ts:308-311` | `classify.ts` blocks all medical/guideline questions; no institutional SOP/guideline table exists; `PACKET_SYSTEM_PROMPT` forbids prose drafting (referral letters, slide outlines, case reports, handouts); `getCaseContext` (`tools.ts:301`) computes `openTasksCount` from `timeline` instead of `listTasks`. | **UC 05:** Doctor Productivity & Knowledge Assistant |
| **High Click Burden, Missing Caregiver Model & A11y/Mobile Bugs** | `apps/web/src/components/EvidenceRow.tsx`, `continuity/page.tsx`, `audit/page.tsx` | No batch verification UI (45+ clicks/patient); no `caregiver_contact` or TTS audio preview on `/continuity`; `state-extracted` (`#9a6b12`) and `rule-strong` (`#b9b0a0`) fail WCAG AA contrast; horizontal overflow at `375px` mobile width. | **Design Principles:** Easy for doctors/patients, Multilingual & Caregiver-friendly |

---

## 4. Functional Specifications & User Stories (Given-When-Then)

### Epic 1: Longitudinal Patient Journey, Interval Deltas & Multi-Track Readiness (Use Case 02)

#### Story 1.1: "Changes Since Last Consultation" Interval Delta Brief
- **User Story:** As a consulting clinician preparing for a follow-up visit, I want to see a dedicated **"Changes Since Last Consultation"** banner and filter on the Evidence Journey page so that I can immediately identify new documents, new lab/imaging results, reopened conflicts, and pending tasks since the patient's last encounter without re-reading the entire historical chart.
- **Acceptance Criteria (Gherkin):**
  - **Scenario 1: Patient has a prior consultation date or approved packet**
    - **Given** a patient record has `last_consultation_date = '2025-07-05'` (or a prior approved `consultation_packet` approved at `ledger_seq = 18`)
    - **When** the clinician opens `/patients/[id]/evidence`
    - **Then** the top of the page renders a **"Changes Since Last Visit (05 Jul 2025)"** summary card displaying exact counts and 1-click filter pills for: `New Documents (+3)`, `New / Updated Facts (+8)`, `New / Reopened Conflicts (+1)`, and `Pending Investigations / Tasks (+2)`
    - **And** clicking the `Since Last Visit` filter chip filters both the Timeline View and Ledger Details View to display only facts with `observed_on > '2025-07-05'` or `ledger_seq > 18`, badged with a high-contrast `NEW SINCE LAST VISIT` indicator.

#### Story 1.2: Longitudinal Serial Lab Flowsheets & Medication Regimen History (Fixing False Conflicts)
- **User Story:** As an oncologist reviewing repeated consultation records, I want serial oncology laboratory results (e.g., Hemoglobin, Platelets, White Blood Cell count, Serum Creatinine or documented tumor markers) and dated medication/administration records across different dates to be grouped into a **Longitudinal Flowsheet & Regimen Timeline** rather than flagged as contradictions, while still flagging genuine same-date cross-document disagreements as conflicts.
- **Acceptance Criteria (Gherkin):**
  - **Scenario 1: Serial labs on different dates form a trend series, not a conflict**
    - **Given** Document A (`2025-06-02`) records `Hemoglobin: 11.4 g/dL` and Document B (`2025-07-26`) records `Hemoglobin: 10.2 g/dL`
    - **When** `detectAndRecordConflicts` runs during ingestion
    - **Then** `slotQualifier` scopes lab and medication comparison by date (`lab:hemoglobin@2025-06-02` vs `lab:hemoglobin@2025-07-26`) or `COMPARATORS['lab_result.as_written']` returns `'agree'` (non-conflicting series) when `observedOn` dates differ by `> 1 day`
    - **And** the Evidence Journey page renders a **"Longitudinal Lab & Vitals Flowsheet"** table showing `Test Name | Prior Value (Date) | Latest Value (Date) | Delta (As Written) | Source Links` with zero clinical interpretation.
  - **Scenario 2: Same-date cross-document lab disagreement triggers a conflict**
    - **Given** two documents both dated `2025-07-26` record `Hemoglobin: 10.2 g/dL` and `Hemoglobin: 13.8 g/dL`
    - **When** `detectAndRecordConflicts` runs
    - **Then** both facts are marked `conflicting` and surfaced in the Reconciliation Room.

#### Story 1.3: Automated Extraction of Pending Investigations & Documented Instructions
- **User Story:** As a care coordinator, I want OncoBrief to extract explicitly documented pending investigations (e.g., *"Awaiting IHC report"*, *"Pending PET-CT"*, *"Biopsy report pending"*) and patient instructions (e.g., *"Bring prior imaging CD and histopathology slides at next visit"*) as span-anchored facts that can be promoted into administrative tasks in one click.
- **Acceptance Criteria (Gherkin):**
  - **Given** a discharge summary contains `"Bring prior imaging and the histopathology slides at the next visit"`
  - **When** the document is ingested via `RuleBasedExtractor` or `BedrockLlmProvider`
  - **Then** the extractor emits a candidate with `factType: 'instruction.recorded'` (or `'pending_investigation.recorded'`) anchored to the exact span
  - **And** the Evidence Row and Record Map display a `Create Task from Instruction` button pre-filled with the verbatim instruction and source link.

#### Story 1.4: Oncology-Specific Checklist Packs (NCG Cancer Care)
- **User Story:** As an oncology clinician or records coordinator, I want configurable cancer-care **Checklist Template Packs** (`ncg_oncology_intake`, `ncg_tumor_board_prep`, `ncg_oncology_followup`) to reflect oncology referral intake, tumor-board preparation, and longitudinal follow-up within the single Cancer Care track.
- **Acceptance Criteria (Gherkin):**
  - **Given** `checklist_template` contains the three oncology workflow variants above and oncology-only demo patients `DEMO-001`, `DEMO-002` and `DEMO-003`
  - **When** an oncologist opens a patient’s Record Map or selects an oncology workflow template
  - **Then** `RecordMapPage` evaluates its required oncology documents (e.g., `pathology_report`, `ihc_report`, `imaging_report`, `surgery_note`, `chemotherapy_administration_record`, `radiation_completion_summary`, `referral_note`) as configurable **document-readiness checks**, not clinical judgments
  - **And** `TimelineNodeView` assigns accurate oncology modality labels/icons from the actual `factType` and `documentType`, never inventing an issuing facility or defaulting every image to `'CT Scan (Thorax)'`.

---

### Epic 2: Readiness-Gated OPD Clinic Operations & Patient Flow (Use Case 04)

#### Story 2.1: Live OPD Queue, Slot Status & Walk-In / Cancellation Management
- **User Story:** As an OPD coordinator or front-desk manager, I want `/workspace` to provide a real-time **OPD Clinic Flow & Slot Board** alongside Record Readiness so that I can manage scheduled appointment slots, patient check-ins, walk-ins, delayed investigations, and last-minute cancellations in one view.
- **Acceptance Criteria (Gherkin):**
  - **Given** today's OPD clinic has scheduled time slots (`09:00`, `09:30`, `10:00`, `10:30`, `11:00`) across consulting rooms
  - **When** the coordinator opens `/workspace` (or `/workspace/flow`)
  - **Then** each slot displays: `Slot Time`, `Patient & Token #`, `Attendance Status` (`scheduled` | `checked_in` | `in_consult` | `delayed_investigation` | `cancelled` | `no_show` | `walk_in`), `Record Readiness Band` (`ready` | `gaps` | `blocked`), `Documented Priority Tag` (source-anchored, e.g., `post_op_review` / `chemo_clearance` / `routine`), and `Bottleneck Alert`
  - **And** the coordinator can update slot status (Check In, Mark Delayed Lab, Cancel Slot, Register Walk-In) with full audit logging.

#### Story 2.2: Readiness-Gated Vacant Slot Backfill Engine
- **User Story:** As an OPD coordinator, when a scheduled patient cancels last-minute or is held in the waiting room due to a delayed investigation (`blocked`), I want OncoBrief to automatically identify waitlisted or later-slotted patients whose consultation packets are **already `ready`** (`readiness_band = 'ready'`) and send a human-approved slot-offer message so clinic capacity is never wasted.
- **Acceptance Criteria (Gherkin):**
  - **Given** the `09:30` slot for `DEMO-001` is marked `cancelled` or `delayed_investigation` (`readiness_band = 'blocked'`)
  - **When** the **Smart Slot Backfill** drawer opens
  - **Then** the system ranks candidate patients on the waitlist or later slots strictly by operational criteria: (1) `readiness_band === 'ready'`, (2) documented administrative priority tag, and (3) earliest requested date
  - **And** clicking **"Offer 09:30 Slot & Reassign"** swaps the slot assignment, logs an `opd.slot_backfilled` audit event, and queues a verified appointment update message for clinician/coordinator dispatch.

#### Story 2.3: In-Row Care-Team Task Assignment & Escalation
- **User Story:** As a care coordinator, I want to assign and reassign any administrative task on `/patients/[id]/tasks` and `/patients/[id]/record-map` to a specific team member (Clinician, Coordinator, Records Officer) with a target due time so that every clinic bottleneck has a named owner.
- **Acceptance Criteria (Gherkin):**
  - **Given** an open task exists on `/patients/[id]/tasks`
  - **When** a user with `task:assign` permission selects a staff member from the in-row `Assignee` dropdown and clicks `Assign`
  - **Then** `assignTaskAction` updates `admin_task.assigned_to`, appends a `task_event` (`action = 'assigned'`), and renders `assigned to <Name> (<Role>)` immediately.

---

### Epic 3: Source-Grounded Doctor Productivity & Knowledge Assistant (Use Case 05)

#### Story 3.1: Span-Anchored Institutional SOP & Clinical Guideline RAG (`[G1]` Citations)
- **User Story:** As a doctor preparing for a consultation, teaching session, or tumor board, I want to ask `Ask OncoBrief` questions about institutional clinical protocols and NCG and institution-approved oncology guidelines and receive answers grounded strictly in uploaded, version-pinned guideline PDFs with exact page and bounding-box citations (`[G1]`, `[G2]`), while keeping patient-specific treatment decisions in my hands.
- **Acceptance Criteria (Gherkin):**
  - **Given** the hospital's library contains version-pinned guideline documents (`NCG Breast Cancer Management Guidelines`, oncology tumor-board SOPs, oncology referral-preparation SOPs; each with an explicit approved version) stored in `guideline_document` and `guideline_span`
  - **When** a clinician asks `Ask OncoBrief`: *"What does the NCG guideline state for post-MRM adjuvant radiation workup?"* or *"Locate the institutional tumor-board documentation checklist for breast cancer cases"*
  - **Then** `classifyIntent` routes the query to `'guideline_knowledge_question'` (distinguishing general guideline lookup from autonomous patient prescribing)
  - **And** the assistant returns a grounded synthesis citing `[G1]`, `[G2]` with clickable `SourceCard` links that open the exact guideline page and highlight the verbatim paragraph in `SourcePaneView`
  - **And** every response includes the explicit header: `Reference Guideline Extract — For Clinician Review Only (Not a Patient-Specific Order)`.

#### Story 3.2: Audience-Adaptive Professional Content & Academic Studio (`/patients/[id]/studio`)
- **User Story:** As a clinician, I want to transform a patient's verified Evidence Ledger and linked institutional guidelines into editable, source-cited professional drafts—including **(1) Specialist Referral / Transfer Letter**, **(2) Multidisciplinary Tumor Board / Case Presentation (Markdown & Printable Slide View)**, **(3) De-Identified Academic Case Report Abstract**, and **(4) Multilingual Patient & Caregiver Information Sheet**—while remaining in 100% control of editing and approving the final output.
- **Acceptance Criteria (Gherkin):**
  - **Given** a patient has verified facts in the Evidence Ledger
  - **When** the clinician opens `/patients/[id]/packet` (or the new **Productivity Studio** section) and selects one of the 4 artifact templates (`referral_letter`, `tumor_board_deck`, `academic_case_abstract`, `patient_info_sheet`)
  - **Then** the deterministic/LLM composer generates a structured draft where **every factual statement carries an inline `[E#]` provenance badge** linked to its `evidence_fact_id` (and automatically strips patient identifiers MRN/ABHA/Name when `academic_case_abstract` is selected)
  - **And** any unverified fact is visually badged `[UNVERIFIED — Confirm Source Before Sign-Off]`
  - **And** the clinician can edit the draft inline, sign off (`packet:approve`), and export as **Print-Ready PDF**, **Markdown/Slides**, **ABDM v6.5.0 JSON**, or **HL7 mCODE STU4 JSON**.

---

### Epic 4: Human-Centered UX, Caregiver Voice Continuity & Workflow-First Integration (Design Principles)

#### Story 4.1: Guided "Next Step" Readiness Banner & 1-Click Batch Verification
- **User Story:** As a busy outpatient doctor or records officer, I want a top **"Next Step to Consult Ready"** action bar and a **"Verify All High-Confidence Facts (OCR >= 90%)"** batch action with a single confirmation modal so I can prepare a clean chart in under 60 seconds.
- **Acceptance Criteria (Gherkin):**
  - **Given** a patient has 18 extracted facts with `confidence_band = 'high'` (`ocr_confidence >= 0.90`) and `state = 'extracted'`
  - **When** the clinician clicks `Review & Verify High-Confidence Batch (18)` and confirms in the modal
  - **Then** `verifyEvidenceBatchAction` transitions all 18 facts to `verified` in one atomic PostgreSQL transaction, records individual `ledger_entry` rows plus a batch `audit_event`, and recomputes `readiness_band`.

#### Story 4.2: Consented Caregiver Network & Playable 11-Language Voice Reminders (`Sarvam Bulbul v3`)
- **User Story:** As a care coordinator supporting low-literacy patients and family caregivers, I want to register a consented family caregiver (`caregiver_name`, `relationship`, `phone`, `preferred_locale`), compose reminders in all 11 supported Indic languages, and generate a **playable spoken audio voice note** (`Sarvam Bulbul v3` TTS) on `/patients/[id]/continuity`.
- **Acceptance Criteria (Gherkin):**
  - **Given** a patient has a verified appointment fact and a registered caregiver with `preferred_locale = 'ta-IN'` (or `'hi-IN'`, `'te-IN'`, `'bn-IN'`, `'mr-IN'`, `'kn-IN'`, `'ml-IN'`, `'gu-IN'`, `'pa-IN'`, `'or-IN'`)
  - **When** the coordinator composes a continuity reminder and clicks **"Generate & Preview Spoken Voice Note"**
  - **Then** the page calls `/api/v1/assistant/voice/tts` (or an offline Web Speech / WAV fallback when `SARVAM_API_KEY` is unconfigured) and renders an inline `<audio controls>` player so the care team or judge can listen to the localized voice reminder and dispatch it to both patient and caregiver.

#### Story 4.3: Working ABDM / mCODE Intake & Browser Extension Launch Overlay
- **User Story:** As a clinician in an existing hospital EHR, I want the **Import from EHR / ABDM** and **Link to Existing** tabs in `DocumentUploadForm.tsx` to execute real server actions (ingesting valid NRCeS ABDM v6.5.0 and HL7 mCODE STU4 bundles into the ledger), and I want a working Manifest V3 Browser Extension (`apps/extension`) that launches OncoBrief from any hospital EHR page using short-lived `extension_grant` tokens.
- **Acceptance Criteria (Gherkin):**
  - **Given** a user clicks `Pull ABDM Bundle (Tata Memorial / ACTREC)` or `Import mCODE FHIR Bundle (AIIMS)` on `/patients/[id]/sources`
  - **When** `importStandardBundleAction` executes
  - **Then** it ingests a complete, standards-valid FHIR R4 JSON bundle through `createDocument` + `ingestDocument`, extracts structured spans and facts into the Evidence Ledger, and refreshes `/patients/[id]/sources` with zero `alert()` popups.

---

## 5. System Architecture & Agentic Orchestration Upgrade

```
┌────────────────────────────────────────────────────────────────────────────────────────────┐
│                        ACCESS, INTAKE & INTEROPERABILITY LAYER                             │
│  • Web Workspace (Next.js 15)           • Manifest V3 EHR Browser Extension (apps/extension)│
│  • Multi-Modal Upload (PDF/Photo/DICOM) • Live ABDM v6.5.0 & HL7 mCODE STU4 Import/Export  │
└──────────────────────────────────────────────┬─────────────────────────────────────────────┘
                                               │
                                               ▼
┌────────────────────────────────────────────────────────────────────────────────────────────┐
│             MULTI-MODAL INGESTION & DETERMINISTIC STATE-GRAPH ORCHESTRATOR                 │
│  [Node 1: Triage & SHA-256 Dedup] ──► [Node 2: Packet Segmenter (Damani et al., 2026)]     │
│                 │                                      │                                   │
│                 ▼                                      ▼                                   │
│  [Node 3: Dynamic OCR Router]          [Node 4: Oncology Fact & Instruction Extractor]     │
│  (Sarvam Vision / Textract / PDF+Tesseract)  (Pathology, Chemo, Radiation, Pending)        │
│                 │                                      │                                   │
│                 ▼                                      ▼                                   │
│  [Node 5: Two-Stage Span & Entailment Gate] ──► [Node 6: Date-Scoped Conflict & Delta Eng] │
└──────────────────────────────────────────────┬─────────────────────────────────────────────┘
                                               │
         ┌─────────────────────────────────────┼─────────────────────────────────────┐
         ▼                                     ▼                                     ▼
┌─────────────────────────────┐  ┌─────────────────────────────┐  ┌──────────────────────────┐
│   USE CASE 02: LONGITUDINAL │  │   USE CASE 04: SMART OPD    │  │  USE CASE 05: PRODUCTIVITY│
│   JOURNEY & READINESS       │  │   FLOW & SLOT BACKFILL      │  │  & GUIDELINE CO-PILOT    │
│ • "Since Last Visit" Deltas │  │ • Live OPD Slot & Token Brd │  │ • NCG guideline / SOP RAG│
│ • Serial Lab Flowsheets     │  │ • Walk-in / Delayed Lab Trk │  │   Source-linked retrieval│
│ • Med Regimen Timeline      │  │ • Readiness-Gated Waitlist  │  │ • Referral Letter, Tumor │
│ • 1-Click Batch Verify      │  │   Slot Backfill Recommender │  │   Board & Case Studio    │
│ • Oncology Checklist Packs  │  │ • In-Row Task Assignment    │  │ • Print PDF + FHIR Export│
└─────────────────────────────┘  └─────────────────────────────┘  └──────────────────────────┘
                                               │
                                               ▼
┌────────────────────────────────────────────────────────────────────────────────────────────┐
│               CARE CONTINUITY & CAREGIVER VOICE NETWORK (11 INDIC LANGUAGES)               │
│  • Consented Family Caregiver Registry  • Sarvam Bulbul v3 Playable Audio Voice Notes      │
│  • Two-Way Attendance Confirmation      • Cryptographic SHA-256 Ledger & Audit Chain       │
└────────────────────────────────────────────────────────────────────────────────────────────┘
```

### Why a Deterministic State-Graph Orchestrator (`packages/domain/src/orchestration/workflow-graph.ts`) Beats Fragile Prompt Chains
To satisfy the **Technology Approach** principle (*"Leverage existing AI capabilities, including AI agents, orchestration frameworks..."*) without violating the **Safety Expectations** principle (*"No autonomous clinical advice; human override on every step"*), OncoBrief V4 implements a typed, LangGraph-compatible **State-Graph Workflow Orchestrator** (`WorkflowStateGraph<TState>`) with explicit nodes, conditional edges, checkpoint persistence, and human-in-the-loop interrupt gates:
1. **Document Ingestion Graph:** `triageNode` → `segmentPacketNode` → `ocrRouteNode` (selecting `SarvamVisionOcrAdapter`, `TextractOcrAdapter`, or `LocalMultimodalOcrAdapter` based on `env.ocrDriver` and document script) → `extractCandidatesNode` → `twoStageSpanGateNode` → `dateScopedConflictAndDeltaNode` → `humanReviewInterruptGate`.
2. **Assistant & Co-Pilot Graph:** `intentClassifierNode` → branches deterministically to `patientEvidenceRetrieverNode` (`[E#]`), `institutionalGuidelineRetrieverNode` (`[G#]`), `opdFlowStatusNode`, or `boundaryRefusalNode` → `groundedSynthesisNode` → `citationVerificationGateNode`.

---

## 6. Database Schema Migration Specification (`0009_v4_oncology_enhancement.sql`)

Create `packages/db/migrations/0009_v4_oncology_enhancement.sql` to add the exact tables required for Use Cases 02, 04, 05, and Caregiver Continuity while maintaining 100% backward compatibility and PostgreSQL Row-Level Security (RLS):

```sql
-- ===========================================================================
-- 0009_v4_oncology_enhancement.sql
-- Oncology Journey & Readiness (UC02), OPD Slot & Queue Flow (UC04),
-- Institutional Guideline RAG & Productivity Studio (UC05), and Caregivers
-- ===========================================================================

SET ROLE oncobrief_migrator;

-- 1. Extend oncology patient with last consultation and preferred language
ALTER TABLE patient
  ADD COLUMN IF NOT EXISTS last_consultation_date date,
  ADD COLUMN IF NOT EXISTS primary_language text NOT NULL DEFAULT 'en-IN';

CREATE TABLE IF NOT EXISTS caregiver_contact (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id              uuid NOT NULL REFERENCES organization(id),
  patient_id          uuid NOT NULL REFERENCES patient(id),
  full_name           text NOT NULL,
  relationship        text NOT NULL,
  phone_number        text NOT NULL,
  preferred_locale    text NOT NULL DEFAULT 'hi-IN',
  prefers_voice_note  boolean NOT NULL DEFAULT true,
  consent_recorded_at timestamptz NOT NULL DEFAULT now(),
  consent_recorded_by uuid NOT NULL REFERENCES app_user(id),
  is_active           boolean NOT NULL DEFAULT true,
  UNIQUE (org_id, id)
);
CREATE INDEX IF NOT EXISTS caregiver_patient_idx ON caregiver_contact (patient_id);

-- 2. Use Case 04: OPD Clinic Slots, Queue Tokens & Readiness-Gated Waitlist
CREATE TYPE opd_slot_status AS ENUM (
  'scheduled',
  'checked_in',
  'in_consult',
  'delayed_investigation',
  'completed',
  'cancelled',
  'no_show',
  'walk_in',
  'vacant'
);

CREATE TYPE admin_priority_tag AS ENUM (
  'routine_followup',
  'new_referral',
  'post_op_wound_check_documented',
  'chemo_cycle_clearance_documented',
  'expedited_slot_requested'
);

CREATE TABLE IF NOT EXISTS opd_appointment_slot (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                   uuid NOT NULL REFERENCES organization(id),
  clinic_date              date NOT NULL DEFAULT CURRENT_DATE,
  slot_Start_time          time NOT NULL,
  slot_end_time            time NOT NULL,
  room_label               text NOT NULL DEFAULT 'OPD Room 1',
  clinician_id             uuid REFERENCES app_user(id),
  patient_id               uuid REFERENCES patient(id),
  token_number             text,
  status                   opd_slot_status NOT NULL DEFAULT 'scheduled',
  priority_tag             admin_priority_tag NOT NULL DEFAULT 'routine_followup',
  priority_source_fact_id  uuid REFERENCES evidence_fact(id),
  bottleneck_note          text,
  checked_in_at            timestamptz,
  updated_by               uuid REFERENCES app_user(id),
  updated_at               timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, id)
);
CREATE INDEX IF NOT EXISTS opd_slot_date_idx ON opd_appointment_slot (org_id, clinic_date, slot_start_time);

CREATE TABLE IF NOT EXISTS opd_waitlist_entry (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                  uuid NOT NULL REFERENCES organization(id),
  patient_id              uuid NOT NULL REFERENCES patient(id),
  requested_date          date NOT NULL DEFAULT CURRENT_DATE,
  priority_tag            admin_priority_tag NOT NULL DEFAULT 'routine_followup',
  priority_source_fact_id uuid REFERENCES evidence_fact(id),
  status                  text NOT NULL DEFAULT 'waiting'
                            CHECK (status IN ('waiting', 'offered', 'slotted', 'cancelled')),
  offered_slot_id         uuid REFERENCES opd_appointment_slot(id),
  created_at              timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, id)
);

-- 3. Use Case 05: Span-Anchored Oncology SOPs & NCG Guidelines
CREATE TABLE IF NOT EXISTS guideline_document (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id            uuid NOT NULL REFERENCES organization(id),
  code              text NOT NULL,
  title             text NOT NULL,
  issuing_body      text NOT NULL, -- e.g. 'National Cancer Grid (NCG)' or hospital oncology department
  version_label     text NOT NULL,
  publication_date  date NOT NULL,
  content_sha256    bytea NOT NULL,
  is_active         boolean NOT NULL DEFAULT true,
  uploaded_by       uuid NOT NULL REFERENCES app_user(id),
  uploaded_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, code, version_label)
);

CREATE TABLE IF NOT EXISTS guideline_span (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                uuid NOT NULL REFERENCES organization(id),
  guideline_document_id uuid NOT NULL REFERENCES guideline_document(id) ON DELETE CASCADE,
  page_number           integer NOT NULL CHECK (page_number >= 1),
  section_heading       text NOT NULL,
  span_index            integer NOT NULL,
  verbatim_text         text NOT NULL,
  bbox_x                real NOT NULL DEFAULT 0.05,
  bbox_y                real NOT NULL DEFAULT 0.10,
  bbox_w                real NOT NULL DEFAULT 0.90,
  bbox_h                real NOT NULL DEFAULT 0.08,
  keywords              text[] NOT NULL DEFAULT '{}',
  UNIQUE (guideline_document_id, page_number, span_index)
);

-- 4. Use Case 05: Clinician-Controlled Professional Content & Academic Studio Drafts
CREATE TYPE studio_artifact_kind AS ENUM (
  'referral_letter',
  'tumor_board_deck',
  'academic_case_abstract',
  'patient_info_sheet'
);

CREATE TABLE IF NOT EXISTS studio_artifact (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id               uuid NOT NULL REFERENCES organization(id),
  patient_id           uuid NOT NULL REFERENCES patient(id),
  artifact_kind        studio_artifact_kind NOT NULL,
  title                text NOT NULL,
  locale               text NOT NULL DEFAULT 'en-IN',
  markdown_body        text NOT NULL,
  cited_fact_ids       uuid[] NOT NULL DEFAULT '{}',
  cited_guideline_ids  uuid[] NOT NULL DEFAULT '{}',
  is_deidentified      boolean NOT NULL DEFAULT false,
  status               packet_status NOT NULL DEFAULT 'draft',
  snapshot_sha256      bytea,
  created_by           uuid NOT NULL REFERENCES app_user(id),
  created_at           timestamptz NOT NULL DEFAULT now(),
  approved_by          uuid REFERENCES app_user(id),
  approved_at          timestamptz,
  UNIQUE (org_id, id)
);

-- 5. Enable Forced Row-Level Security (RLS) & Grants on all new tables
ALTER TABLE caregiver_contact ENABLE ROW LEVEL SECURITY;
ALTER TABLE caregiver_contact FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON caregiver_contact
  USING (org_id = current_setting('app.org_id', true)::uuid);

ALTER TABLE opd_appointment_slot ENABLE ROW LEVEL SECURITY;
ALTER TABLE opd_appointment_slot FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON opd_appointment_slot
  USING (org_id = current_setting('app.org_id', true)::uuid);

ALTER TABLE opd_waitlist_entry ENABLE ROW LEVEL SECURITY;
ALTER TABLE opd_waitlist_entry FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON opd_waitlist_entry
  USING (org_id = current_setting('app.org_id', true)::uuid);

ALTER TABLE guideline_document ENABLE ROW LEVEL SECURITY;
ALTER TABLE guideline_document FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON guideline_document
  USING (org_id = current_setting('app.org_id', true)::uuid);

ALTER TABLE guideline_span ENABLE ROW LEVEL SECURITY;
ALTER TABLE guideline_span FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON guideline_span
  USING (org_id = current_setting('app.org_id', true)::uuid);

ALTER TABLE studio_artifact ENABLE ROW LEVEL SECURITY;
ALTER TABLE studio_artifact FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON studio_artifact
  USING (org_id = current_setting('app.org_id', true)::uuid);

GRANT SELECT, INSERT, UPDATE ON caregiver_contact, opd_appointment_slot, opd_waitlist_entry, studio_artifact TO oncobrief_app;
GRANT SELECT, INSERT ON guideline_document, guideline_span TO oncobrief_app;

RESET ROLE;
```

---

## 7. Step-by-Step Implementation Plan (File-by-File Tasks)

### Phase 1: Foundation — Database Migration, Domain Vocabularies & Longitudinal Comparators (Use Case 02 Core)

#### Task 1.1: Apply `0009_v4_oncology_enhancement.sql` Migration
- **Files to Create/Modify:**
  - Create `packages/db/migrations/0009_v4_oncology_enhancement.sql`
  - Modify `packages/db/src/seed.ts` (add new tables to `TRUNCATE_TABLES`)
- **Verification Command:** `pnpm db:migrate && pnpm --filter @oncobrief/db test`

#### Task 1.2: Expand `FACT_TYPES` for Oncology Pending Investigations, Instructions & Dated Vital Logs
- **Files to Modify:**
  - `packages/domain/src/vocab/fact-types.ts`
  - `packages/domain/src/vocab/fact-value.ts`
  - `packages/domain/src/packet/assemble.ts`
- **Implementation Details:**
  1. Add `'pending_investigation.recorded'`, `'instruction.recorded'`, and `'vital_sign.as_written'` to `FACT_TYPES`.
  2. Update `slotQualifier(factType, value, observedOn?)` in `packages/domain/src/vocab/fact-types.ts` and `COMPARATORS['lab_result.as_written']` / `COMPARATORS['medication.recorded']` in `packages/domain/src/conflict/comparators.ts`:
     - When `a.observedOn` and `b.observedOn` are both present and differ by `> 1 day`, `COMPARATORS['lab_result.as_written']` and `COMPARATORS['medication.recorded']` return `'agree'` (indicating a valid longitudinal time series rather than a cross-document contradiction).
     - When `a.observedOn` and `b.observedOn` are on the **same date** (or both undated) and values disagree, return `'disagree'` so genuine same-day lab/medication discrepancies still enter the Reconciliation Room.
- **Verification Command:** `pnpm --filter @oncobrief/domain test`

#### Task 1.3: Build Longitudinal Lab Flowsheet & "Changes Since Last Visit" Delta Pure Domain Module
- **Files to Create:**
  - `packages/domain/src/journey/longitudinal-review.ts`
  - `packages/domain/test/longitudinal-review.test.ts`
- **Exported Signatures:**
  ```ts
  export interface IntervalDeltaSummary {
    baselineDate: string | null;
    newDocumentsCount: number;
    newFacts: TimelineFactInput[];
    reopenedOrNewConflictsCount: number;
    pendingInvestigations: TimelineFactInput[];
    documentedInstructions: TimelineFactInput[];
  }

  export interface LabSeriesRow {
    testName: string;
    unitText: string | null;
    points: {
      factId: string;
      observedOn: string;
      valueText: string;
      numericValue: number | null;
      state: EvidenceStateValue;
      documentId: string;
      documentName: string;
      pageNumber: number | null;
    }[];
    deltaText: string | null; // Purely arithmetic difference e.g. "-1.2 g/dL since 02 Jun 2025", zero clinical interpretation
  }

  export function computeIntervalDelta(
    facts: readonly TimelineFactInput[],
    documents: readonly DocumentMetaInput[],
    baselineDate: string | null,
  ): IntervalDeltaSummary;

  export function buildLongitudinalLabFlowsheet(
    facts: readonly TimelineFactInput[],
  ): LabSeriesRow[];
  ```
- **Verification Command:** `pnpm --filter @oncobrief/domain test -- longitudinal-review.test.ts`

#### Task 1.4: Enhance `RuleBasedExtractor` & `SarvamVisionOcrAdapter` + Fix Upload OCR Routing
- **Files to Modify:**
  - `packages/adapters/src/rule-based-extractor.ts`
  - `packages/adapters/src/sarvam-vision-ocr.ts`
  - `apps/web/src/lib/actions.ts`
- **Implementation Details:**
  1. In `rule-based-extractor.ts`:
     - Add regex rules for `pending_investigation.recorded` (matching `/(?:pending|awaiting|advised|scheduled for|to undergo)\s+(IHC|immunohistochemistry|PET-CT|MRI|CT scan|biopsy|histopathology|tumor marker|ultrasound|mammography|blood investigation[^.;\n]{0,40})/i`).
     - Add regex rules for `instruction.recorded` (matching `/(?:please bring|bring|return with|carry)\s+([^.\n]{5,90})/i`).
     - Extend oncology vocabulary using **documented-as-written** terms for chemotherapy administration and supportive-care records (e.g., `Paclitaxel`, `Carboplatin`, `Cisplatin`, `Doxorubicin`, `Radiotherapy`, `Modified Radical Mastectomy`, `IHC`, `Histopathology`, `PET-CT`); never infer drug doses, treatment appropriateness or disease response.
  2. In `sarvam-vision-ocr.ts`:
     - Fix `splitPdfIntoBatches` so it preserves real PDF page streams instead of overwriting >10-page PDFs with `%BATCH` placeholder text, and accept a dynamic `language` parameter (`hi-IN`, `ta-IN`, `te-IN`, etc.).
  3. In `apps/web/src/lib/actions.ts` (`ocrPort` and `extractorPort`, lines 313–320):
     - Route dynamically based on `env.ocrDriver` (`SarvamVisionOcrAdapter` when `SARVAM_API_KEY` is configured, `TextractOcrAdapter` when AWS Textract is configured, and `LocalMultimodalOcrAdapter` as fallback).
- **Verification Command:** `pnpm --filter @oncobrief/adapters test`

---

### Phase 2: Use Case 02 UI Upgrades — Interval Delta Banner, Lab Flowsheets, Batch Verify & Oncology Demo Seed

#### Task 2.1: Seed Oncology Patient Journeys (`DEMO-001`–`DEMO-003`), OPD Slots & NCG Guideline Library
- **Files to Modify:**
  - `packages/db/src/fixtures.ts`
  - `packages/db/src/seed.ts`
- **Implementation Details:**
  1. Seed `DEMO-001` as a **breast oncology new-referral / follow-up** journey with pathology/IHC reports, documented surgery, two CBC results on different dates (for the lab flowsheet), and a clearly pending IHC or external slide document (for the Record Map and task creation).
  2. Seed `DEMO-002` as a **medical oncology cycle-follow-up** journey with chemotherapy administration records as written, a recent lab report, and a documented instruction to bring a missing record.
  3. Seed `DEMO-003` as a **radiation-oncology / post-treatment review** journey with radiation completion summary, follow-up imaging report availability, and a human-approved administrative reminder.
  4. Seed `last_consultation_date` for the oncology demo patients; populate oncology-only OPD slots, waitlist entries, cancellation/delayed-document examples, NCG-aligned checklist variants, and a version-pinned institutional oncology guideline/SOP library. Ensure the **"Changes Since Last Visit"** banner, slot backfill, task ownership and guideline citations are demonstrable without non-cancer fixtures.
- **Verification Command:** `pnpm demo:reset`

#### Task 2.2: Add `verifyEvidenceBatchAction` & Guided "Next Step" Readiness Bar on `/patients/[id]/evidence`
- **Files to Modify:**
  - `packages/db/src/services/ledger.ts` (export `verifyEvidenceBatch`)
  - `apps/web/src/lib/actions.ts` (export `verifyEvidenceBatchAction`)
  - `apps/web/src/app/(app)/patients/[id]/evidence/page.tsx`
  - `apps/web/src/components/TimelineNodeView.tsx`
- **Implementation Details:**
  1. Add a top **Consultation Readiness & Changes Since Last Visit Banner** on `evidence/page.tsx` showing:
     - Current `ReadinessBand` + exact next actions to reach `ready` (e.g., `1 Conflict to Resolve` → link to Reconciliation Room; `1 Required Document Missing` → link to Record Map; `Batch Verify High-Confidence Facts`).
     - A `Since Last Visit` filter chip alongside `All facts`, `Unverified`, `Conflicting`, `Verified`, and `Lab & Vitals Flowsheet`.
  2. Remove the hardcoded `'Apollo Hospitals'` and `'CT Scan (Thorax)'` strings from `TimelineNodeView.tsx`, replacing them with `row.issuingFacility ?? 'Facility not stated'` and accurate oncology modality labels (pathology, imaging, surgery, chemotherapy and radiation) derived from source records.
- **Verification Command:** `pnpm --filter @oncobrief/web test`

#### Task 2.3: Wire Real ABDM v6.5.0 & HL7 mCODE STU4 Bundle Import and Document Linking in `DocumentUploadForm.tsx`
- **Files to Modify:**
  - `apps/web/src/lib/actions.ts` (add `importStandardBundleAction` and `linkExistingDocumentAction`)
  - `apps/web/src/components/DocumentUploadForm.tsx`
- **Implementation Details:**
  - Replace the two `alert(...)` buttons in `DocumentUploadForm.tsx` (lines 329–344) with real `<form action={importStandardBundleAction}>` buttons that construct and ingest a full NRCeS ABDM v6.5.0 `OPConsultRecord` / `DiagnosticReportRecord` bundle or HL7 mCODE STU4 bundle into the patient's Evidence Ledger.
- **Verification Command:** `pnpm --filter @oncobrief/web test`

---

### Phase 3: Use Case 04 — Smart OPD Clinic Flow, Slot Backfill & Care-Team Task Assignment

#### Task 3.1: Build OPD Flow & Readiness-Gated Slot Backfill Service (`packages/db/src/services/opd-flow.ts`)
- **Files to Create:**
  - `packages/domain/src/flow/slot-optimizer.ts`
  - `packages/domain/test/slot-optimizer.test.ts`
  - `packages/db/src/services/opd-flow.ts`
- **Exported Signatures (`slot-optimizer.ts`):**
  ```ts
  export interface BackfillCandidate {
    waitlistEntryId: string;
    patientId: string;
    patientName: string;
    readinessBand: ReadinessBand;
    priorityTag: string;
    prioritySourceQuote: string | null;
    matchScore: number;
    rationale: string; // e.g. "Record READY (0 gaps, 0 conflicts) · Documented post-op check"
  }

  export function rankWaitlistForVacantSlot(
    vacantSlot: OpdSlotInput,
    candidates: readonly WaitlistCandidateInput[],
  ): BackfillCandidate[];
  ```
- **Verification Command:** `pnpm --filter @oncobrief/domain test -- slot-optimizer.test.ts`

#### Task 3.2: Upgrade `/workspace` with Live Oncology OPD Clinic Flow Board & Pilot Telemetry Bar
- **Files to Modify:**
  - `apps/web/src/app/(app)/workspace/page.tsx`
  - `apps/web/src/lib/actions.ts` (add `updateOpdSlotStatusAction`, `backfillOpdSlotAction`, `registerWalkInAction`)
- **Implementation Details:**
  1. Add a **60–90 Day Pilot Operational Telemetry Bar** at the top of `/workspace` displaying live database metrics:
     - `Consult-Ready Rate` (`ready` / total scheduled)
     - `Span-Validation Gate Pass Rate` (`promoted` / total candidates)
     - `Source Contradictions Caught Pre-Consult`
     - `OPD Slot Utilization & Backfill Count`
  2. Add a view toggle on `/workspace`: **Readiness Worklist View** vs. **Live OPD Clinic Flow & Slot Board** (showing time slots `09:00–12:30`, Token #, Arrival/Check-In status, Delayed Lab blocker badges, and a 1-click **"Backfill Vacant/Blocked Slot from Ready Waitlist"** action).
  3. Use oncology-only operational filters (`Medical Oncology`, `Surgical Oncology`, `Radiation Oncology`, `Tumor Board`) if the clinic configuration supports those service lines; **do not add track-selection UI**.
- **Verification Command:** `pnpm --filter @oncobrief/web test`

#### Task 3.3: Add In-Row Task Assignee Selector & Gap Waiver UI
- **Files to Modify:**
  - `apps/web/src/app/(app)/patients/[id]/tasks/page.tsx`
  - `apps/web/src/app/(app)/patients/[id]/record-map/page.tsx`
- **Implementation Details:**
  1. Query organization staff members (`listOrgMembers(q, orgId)`) and render an inline `<form action={assignTaskAction}>` dropdown on every task card in `tasks/page.tsx` so tasks can be assigned to `Dr. Meera Rao (clinician)`, `Anita Joseph (coordinator)`, or `Deepak Nair (records_officer)`.
  2. Add a `<details>` waiver form on `record-map/page.tsx` wired to `waiveGapAction` so authorized staff (`checklist:author`) can waive non-applicable expected items with a mandatory audited reason.
- **Verification Command:** `pnpm --filter @oncobrief/web test`

---

### Phase 4: Use Case 05 — Doctor Productivity Studio & Span-Grounded Guideline Co-Pilot

#### Task 4.1: Build Institutional Guideline & SOP Retrieval Engine (`[G#]` Citations)
- **Files to Modify:**
  - `apps/web/src/lib/assistant/classify.ts`
  - `apps/web/src/lib/assistant/tools.ts`
  - `apps/web/src/lib/assistant/prompt.ts`
  - `apps/web/src/lib/assistant/orchestrator.ts`
- **Implementation Details:**
  1. In `classify.ts`: Add `'guideline_knowledge_question'` intent. Route queries asking about NCG oncology documents, hospital oncology SOPs, tumor-board checklists, or oncology reference protocols to `'guideline_knowledge_question'`, while continuing to block patient-specific diagnostic/prescribing demands (`"what dose should I prescribe for this patient"` → `'unsupported_medical_question'`).
  2. In `tools.ts`:
     - Fix the bug on line 301 where `openTasksCount` was computed from `timeline` instead of `listTasks(q, patientId)`.
     - Add `searchGuidelines(q, query)` querying `guideline_span` + `guideline_document` and returning verbatim protocol spans with `[G1]`, `[G2]` citations and bounding boxes.
  3. In `orchestrator.ts` and `prompt.ts`: Format `[G#]` guideline cards alongside `[E#]` patient evidence cards so clinicians can verify exact protocol passages with one click.
- **Verification Command:** `pnpm --filter @oncobrief/web test`

#### Task 4.2: Build the Clinician Productivity & Content Studio (`/patients/[id]/packet` & `studio.ts`)
- **Files to Create/Modify:**
  - Create `packages/domain/src/studio/draft-generator.ts`
  - Create `packages/domain/test/draft-generator.test.ts`
  - Modify `apps/web/src/app/(app)/patients/[id]/packet/page.tsx`
  - Modify `apps/web/src/lib/actions.ts` (add `createStudioArtifactAction`, `updateStudioArtifactAction`, `approveStudioArtifactAction`)
- **Implementation Details:**
  - In `draft-generator.ts`, implement deterministic, source-cited template compilers (with optional LLM phrasing refinement constrained to `[E#]`/`[G#]` tags) for 4 deliverables:
    1. **Specialist Referral / Transfer Letter** (structured clinical history as written, procedures, serial lab table, open tasks, and referring doctor sign-off).
    2. **Multidisciplinary Tumor Board / Case Presentation** (slide-by-slide Markdown deck: Slide 1 Case Identity & Readiness, Slide 2 Chronological Interventions `[E#]`, Slide 3 Pathology & Imaging Spans `[E#]`, Slide 4 Reconciled Contradictions, Slide 5 Reference NCG Guideline Checklist `[G#]`).
    3. **De-Identified Academic Case Report Draft** (automatically redacts Patient Name, MRN, ABHA, and exact dates into relative day offsets `Day 0`, `Day +14`, `Day +45` for research manuscripts and teaching).
    4. **Patient & Caregiver Visit Summary Handout** (plain-language administrative summary of verified appointments, documents to bring, and hospital contact numbers).
  - Add a **Print / Save as PDF** view (`@media print` stylesheet) alongside **Export ABDM v6.5.0 FHIR JSON** and **Export HL7 mCODE STU4 JSON** buttons on `packet/page.tsx`.
- **Verification Command:** `pnpm --filter @oncobrief/domain test -- draft-generator.test.ts`

---

### Phase 5: Design Principles — Caregiver Voice Network, Accessibility (WCAG 2.2 AA) & Mobile Remediation

#### Task 5.1: Upgrade `/patients/[id]/continuity` with Caregiver Registry & 11-Language Spoken Audio Preview
- **Files to Modify:**
  - `apps/web/src/app/(app)/patients/[id]/continuity/page.tsx`
  - `apps/web/src/components/ContinuityAudioPlayer.tsx` (new client component)
  - `packages/db/src/seed.ts` (seed templates across `en`, `hi`, `ta`, `te`, `bn`, `mr`, `kn`, `ml`, `gu`, `pa`, `or`)
- **Implementation Details:**
  1. Render the **Consented Family Caregiver Card** on `continuity/page.tsx` allowing coordinators to add/view a caregiver (`fullName`, `relationship`, `phoneNumber`, `preferredLocale`) and toggle `Sync reminders to family caregiver`.
  2. Add a **"Listen / Preview Voice Note (Sarvam Bulbul v3)"** button on every composed or approved patient message that calls `/api/v1/assistant/voice/tts` with the message's `bodyRendered` and `locale` (falling back gracefully to browser `window.speechSynthesis` if offline) so low-literacy voice outreach is demonstrable live.
- **Verification Command:** `pnpm --filter @oncobrief/web test`

#### Task 5.2: Remediate WCAG 2.2 AA Contrast, Form Labels, Landmarks & 375px Mobile Overflow
- **Files to Modify:**
  - `apps/web/src/app/globals.css`
  - `apps/web/src/app/(app)/layout.tsx`
  - `apps/web/src/app/(app)/patients/[id]/layout.tsx`
  - `apps/web/src/components/PatientTabs.tsx`
  - `apps/web/src/components/AssistantLauncher.tsx`
- **Implementation Details (`accessibility-inclusive-design` skill compliance):**
  1. **Contrast Fixes (`globals.css`):**
     - Darken `--color-state-extracted` from `#9a6b12` (`4.26:1`, fails AA) to `#7c530b` (`6.12:1` on `#f7f4ee`, passes WCAG AA).
     - Darken `--color-rule-strong` from `#b9b0a0` (`1.96:1`, fails WCAG 1.4.11) to `#857d6f` (`3.45:1` on `#f7f4ee`, passes 3:1 UI boundary contrast).
  2. **375px Mobile Overflow Fixes:**
     - Add `flex-wrap` to the authenticated header in `apps/web/src/app/(app)/layout.tsx:12`.
     - Wrap `PatientTabs` in an `overflow-x-auto` container with `aria-label="Patient sections"`.
     - Add bottom padding (`pb-20`) to patient pages so the fixed `Ask OncoBrief` launcher (`AssistantLauncher.tsx`) never obscures Source B or bottom evidence rows.
  3. **Semantic Landmarks & Live Regions:**
     - Change the wrapper `<div>` in `apps/web/src/app/(app)/patients/[id]/layout.tsx:37` to `<main id="main-content">` and add a keyboard-accessible `"Skip to main content"` link in `(app)/layout.tsx`.
     - Add an `aria-live="polite"` status region for verification, conflict resolution, and task updates.
  4. **Audit Redaction Hardening (`packages/db/src/services/audit.ts`):**
     - Add `'reason'` and `'filename'` to `REDACT_KEYS` or hash free-text reasons so PHI can never leak into `audit_event.metadata_json`.
- **Verification Command:** `pnpm --filter @oncobrief/web test:e2e`

---

## 8. Risk & Dependency Matrix

**Scope check for every phase:** Build and demo only Cancer Care features. All patient fixtures, guideline corpora, workflow templates, slot queues and evidence screenshots must refer to oncology; do not present other Health-a-thon tracks as implemented or jointly submitted.

| Risk ID | Risk Description | Prob. | Impact | Concrete Mitigation Strategy | Contingency / Fallback Trigger |
| :--- | :--- | :---: | :---: | :--- | :--- |
| **R-01** | **Clinical Boundary Violation:** Adding guideline RAG (UC 05) or OPD priority tags (UC 04) trips `check-clinical-boundary.ts` or appears diagnostic to judges. | Med | High | Keep all guideline retrieval strictly as verbatim source-span lookup (`[G#]`) with a mandatory non-clinical header; restrict OPD priority tags to *documented administrative categories* (`post_op_check_documented`, `chemo_clearance_documented`) anchored to a source span. | Run `pnpm boundary:check` on every commit; any forbidden token fails CI immediately. |
| **R-02** | **External API Unavailability During Live Judging:** `SARVAM_API_KEY`, `NVIDIA_API_KEY`, or AWS Bedrock credentials hit rate limits (`429`) or network timeouts during the demo. | Med | High | Maintain deterministic offline fallbacks across every port: `LocalMultimodalOcrAdapter` for PDFs/FHIR/DICOM, `RuleBasedExtractor` for facts/instructions, `synthesizeDeterministicGroundedAnswer` for chat/guidelines, and Web Speech API / pre-generated WAV fallback for TTS audio preview. | Automatic fallback on timeout (`>8s`) or missing API key with zero UI crash. |
| **R-03** | **False Suppression of Real Same-Day Lab Conflicts:** Relaxing the lab comparator to allow longitudinal trends accidentally hides two conflicting lab reports from the same day. | Low | High | Scope `COMPARATORS['lab_result.as_written']` strictly by date distance: only treat differing values as a longitudinal series when `abs(dateA - dateB) >= 1 day`; same-day or undated disagreements still trigger `conflicting`. | Unit test both same-day conflict (`DOM-LAB-CONFLICT`) and multi-day series (`DOM-LAB-SERIES`) in `conflict.test.ts`. |
| **R-04** | **Clinician Rubber-Stamping in Batch Verification:** A user clicks "Batch Verify" on low-quality OCR spans without reviewing them. | Med | Med | Restrict `verifyEvidenceBatchAction` strictly to facts where `confidence_band === 'high'` (`ocr_confidence >= 0.85`), `state === 'extracted'`, and `conflict_count === 0`. Low-confidence (`needs_review`) and conflicting facts are excluded from batch verify and require individual inspection. | Modal lists every fact and quote included in the batch before commit. |

---

## 9. Master Verification & Testing Matrix

Every phase is gated by automated tests across all 5 architectural layers:

| Layer | Test Suite / Command | New Verification Scenarios Added in V4 | Pass Criteria |
| :--- | :--- | :--- | :--- |
| **Layer 1: Database & RLS** | `pnpm --filter @oncobrief/db test` | Tenant isolation on `caregiver_contact`, `opd_appointment_slot`, `opd_waitlist_entry`, `guideline_document`, `studio_artifact`; immutability of `text_span` and `ledger_entry`. | 100% pass, 0 cross-tenant leaks |
| **Layer 2: Pure Domain** | `pnpm --filter @oncobrief/domain test` | Oncology `longitudinal-review.test.ts` (dated CBC, interval deltas & serial lab flowsheets); `slot-optimizer.test.ts` (oncology-ready waitlist backfill ranking); `draft-generator.test.ts` (de-identified oncology case report & referral letter citations); `check-clinical-boundary.ts`. | 100% pass, 0 boundary violations |
| **Layer 3: Multi-Modal Adapters** | `pnpm --filter @oncobrief/adapters test` | Pending investigation & instruction extraction in `rule-based-extractor`; multi-page PDF batching & Indic language codes in `sarvam-vision-ocr`; ABDM v6.5.0 & mCODE round-trip ingestion. | 100% pass |
| **Layer 4: Web & Assistant** | `pnpm --filter @oncobrief/web test` | `[G#]` NCG/institutional oncology guideline retrieval grounding; batch verification RBAC & audit logging; OPD slot status mutations & task assignment actions. | 100% pass |
| **Layer 5: Browser E2E & Mobile** | `pnpm --filter @oncobrief/web test:e2e` | Full oncology patient-journey walkthrough of UC 02 (Interval Delta + Lab Flowsheet + Batch Verify), UC 04 (OPD Slot Board + Ready Waitlist Backfill), UC 05 (Guideline Query + Referral/Tumor Board Studio), Caregiver Voice TTS preview, and `scrollWidth <= 375` mobile check. | 100% E2E pass at 1440px and 375px |


---

## 10. Cancer Care Track Submission & Judge Demo Narrative

**Track commitment:** OncoBrief V4 is submitted for **Cancer Care only**. Consultation Readiness (UC 02), Clinic Operations (UC 04), Doctor Productivity (UC 05), and patient/caregiver care continuity are connected features of a **single oncology workflow**—not submissions for other healthcare tracks.

1. **Intake:** Import a cancer patient's authorized referral, pathology/IHC, imaging, operative and treatment-administration documents from scans, PDFs or an approved EHR/ABDM flow. Highlight the original source text, not an AI-generated clinical interpretation.
2. **Consultation readiness:** Show the verified Evidence Ledger, date-aware CBC values, "Changes Since Last Visit" and the oncology-specific document-readiness checklist. Batch-review eligible facts with explicit human confirmation; resolve an actual same-date discrepancy in the Reconciliation Room.
3. **Cancer OPD operations:** Show an assigned records-retrieval task, delayed/missing document state, an oncology OPD cancellation, and a *recommendation* to offer the vacant slot to a waitlisted oncology patient with a `ready` packet. Execute the reassignment only after staff confirmation.
4. **Doctor productivity:** Retrieve a version-pinned institutional oncology SOP or NCG guideline passage with page-level `[G#]` provenance; compile a tumor-board administrative presentation or referral letter from approved `[E#]` facts. Keep all diagnosis, staging interpretation, and treatment decisions with the clinician.
5. **Follow-up:** Preview and explicitly approve a regional-language voice note relaying only a verified appointment date or document-to-bring instruction to the cancer patient and a consented caregiver. Log the dispatch and confirmation.

**Pilot evidence discipline:** KR targets in Section 1.2 are success criteria to **measure**, not results already achieved. No patient outcomes, throughput gains, no-show reductions or claimed safety benefits should be presented as proven without a real evaluation.
