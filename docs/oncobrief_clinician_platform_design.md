## OncoBrief

## Source-Verified Oncology Consultation Preparation Platform

Product category: Clinician-facing web application with an optional, hospital-approved browser extension.

Purpose: OncoBrief organizes scattered oncology records into a verifiable administrative preparation view before a consultation. It is an assistive workflow product—not a diagnostic engine, treatment recommender, clinical decision-support system, or risk-scoring tool.

## Executive concept

Oncology teams often have to reconstruct a patient’s care journey from scanned pathology reports, external laboratory reports, discharge summaries, chemotherapy administration records, radiation summaries, referral notes, and multiple EHR screens. OncoBrief reduces this “chart archaeology” by extracting source-grounded administrative facts, arranging them into a longitudinal timeline, and routing explicitly documented pending administrative items to a human-reviewed work queue.

The central design principle is simple: every displayed fact must show its source, and every consequential action requires human confirmation. The product does not infer diagnoses, interpret medical values, determine urgency, recommend treatment, or decide what test a patient should receive.

## 1. Product form factor

## Recommended architecture: web platform first

The primary product should be a secure web application used by oncologists, nurses, medical records staff, tumor-board coordinators, and administrators. It provides a shared workspace for reviewing records, approving timelines, resolving missing documents, and preparing administrative consultation packets.

A web platform is the system of record for the OncoBrief workflow because it supports role- based access, dashboards, audit trails, administration, secure document processing, and controlled sharing across care-team members.


## Optional browser extension

The extension is not a separate product. It is a lightweight “launch point” that appears within a hospital-approved EHR, hospital information system, or document portal.

It can add an Open in OncoBrief button beside a patient record. When an authorized user clicks the button, the extension sends only permitted context—such as patient encounter identifier, document links, or selected record metadata—to the OncoBrief web application through a hospital-approved secure route.

The extension should never silently scrape an entire chart, bypass EHR permissions, copy documents to a personal device, or write information back automatically. A hospital may choose one of three integration patterns:

| Pattern | How it works | Best use |
| --- | --- | --- |
| SMART on FHIR / API | EHR launches OncoBrief with authorized patient | Mature digital hospitals |
| launch context |   |   |
| Secure document | Staff upload or drag approved documents into a patient | Early pilots and smaller centers |
| upload workspace |   |   |
| Browser extension | Extension detects an authorized patient context and | Transitional deployments where approved |
| overlay | opens the web workspace | APIs are limited |

The browser extension should be positioned as a convenience layer, not as a method for avoiding security review.

## 2. How the extension works

## User journey

- 1. A clinician signs into the hospital system normally.

- 2. The clinician opens a patient chart or referral record.

- 3. The OncoBrief extension detects an approved launch point and shows a small action: Prepare consultation packet.

- 4. The clinician selects the relevant documents or confirms the permitted record scope.

- 5. OncoBrief opens in a secure side panel or new tab, carrying a short-lived, encrypted session token.

- 6. The web application processes only selected or authorized documents.

- 7. It returns a draft timeline and a source-linked preparation packet.

- 8. A clinician, nurse, or coordinator reviews, edits, approves, and optionally exports the packet.


## Extension safeguards

- It respects the same authentication and access permissions as the hospital system.

- It uses short-lived tokens and device/session binding.

- It displays the exact data scope before transfer.

- It requires explicit user initiation for document processing.

- It prevents copy-to-clipboard and download by policy where needed.

- It logs launch, document selection, review, approval, export, and user identity.

- It never auto-writes data into the EHR.

- It fails safely: if record context cannot be verified, it opens no patient workspace.

## 3. Core clinician features

## 3.1 Consultation readiness dashboard

The dashboard lists scheduled or referred patients and shows whether their administrative preparation packet is ready, needs review, has missing documents, or has unresolved tasks.

Each patient card shows only operational indicators, for example:

- Packet status: Draft, under review, approved, outdated

- Documents received versus expected

- Last source-document update

- Number of human-confirmed pending tasks

- Assigned reviewer

- Time until appointment

It does not show clinical risk, treatment suitability, prognosis, or medical severity scores.

## 3.2 Multi-format document intake

OncoBrief accepts authorized PDFs, scanned paper records, image files, structured exports, faxes converted to PDFs, and EHR-linked documents. The intake layer classifies documents by type, such as pathology report, imaging report, discharge summary, chemotherapy administration sheet, referral letter, laboratory report, or radiation completion note.

The system preserves the original file, page number, document date, uploader, source institution, and processing history. A document-confidence status helps users prioritize quality review when scan quality is poor.


## 3.3 OCR and layout-preserving extraction

An OCR layer converts scanned documents into searchable text while retaining page layout and text coordinates. This enables a user to click a timeline item and open the exact page with the original supporting phrase highlighted.

The system should retain both the extracted text and the original image. If text is unreadable, it must mark the value as uncertain rather than guess.

## 3.4 Source-grounded event extraction

OncoBrief extracts administrative, historical facts only when supported by a source document. Typical examples include:

- Procedure or visit date as stated in a document

- Department or facility

- Document type and issuing organization

- Surgery date or procedure title as written

- Chemotherapy cycle label as written

- Radiation start or completion date as written

- Imaging or pathology report availability

- Referral status

- Explicitly stated follow-up date or pending requisition

- Appointment or document-request status

Every event contains: source document, page, highlighted text span, extraction timestamp, confidence category, reviewer status, and edit history.

## 3.5 Longitudinal administrative timeline

The platform visualizes documented events chronologically. Users can filter by document type, institution, date range, service line, or event category.

The timeline is deliberately factual. Instead of saying “disease progressed after therapy,” it can display: “Imaging report dated 12 June is available” or “Cycle 3 administration record dated 12 June.”

The timeline supports three views:

| View | Purpose |
| --- | --- |
| Chronological view | See events and documents in date order |
| Source view | Browse events by original documents and pages |
| Workflow view | Review document completeness and confirmed administrative tasks |


## 3.6 Hover-to-source verification

This is the defining feature. Hovering over any timeline event opens a mini-preview with the original quoted text, document title, page number, extraction confidence, and reviewer status. Clicking opens the full document at the exact highlighted location.

This reduces the “black box” problem common in generated summaries. Clinicians can validate a displayed fact in seconds rather than searching across files.

## 3.7 Administrative action queue

The action queue is a human-reviewed worklist for explicitly documented administrative items. The model may propose an item only when a source contains an instruction such as “bring prior imaging,” “return with report,” or “follow-up appointment requested.”

Before assignment, a human must approve the task. The task contains an owner, due date if explicitly documented or manually chosen, source citation, completion status, and resolution

note.

## Examples:

- Request missing external pathology slide

- Obtain named imaging CD

- Confirm whether a report has been received

- Arrange a documented follow-up appointment

- Route paperwork to the appropriate coordinator

The system must not create actions based on inferred medical need.

## 3.8 Missing-document reconciliation

OncoBrief compares the documents available in the workspace against a configurable administrative checklist. For example, a referral workflow may require referral note, prior pathology report, imaging report, treatment administration record, and discharge documents.

The tool can say: “No document of type ‘radiation completion summary’ is present in this workspace.” It cannot say: “Radiation was not given” or “the patient needs radiation records.”

## 3.9 Duplicate-document and version management

Healthcare records frequently contain duplicate uploads, revised reports, scans of the same paper document, and documents with inconsistent names. OncoBrief groups likely duplicates while preserving all originals.

The user can compare versions side by side, mark the authoritative document, and see which timeline events rely on each version. If a source document is replaced or corrected, affected events are flagged for re-review.


## 3.10 Cross-institution record map

The platform presents an origin map showing where records came from: internal department, external hospital, diagnostic laboratory, imaging center, referring doctor, or patient-provided upload.

This helps coordinators see administrative fragmentation without interpreting medical content. It can also identify practical retrieval bottlenecks, such as repeated requests from the same outside facility.

## 3.11 Consultation preparation packet

Once a human reviews the timeline, the system generates an editable preparation packet containing:

- Patient and encounter identifiers, according to local policy

- Document inventory

- Chronological administrative timeline

- Source-linked events

- Confirmed operational tasks

- Missing-document list

- Recent document additions

- Reviewer sign-off and timestamp

The packet should be exportable as PDF or a structured EHR attachment only after human approval.

## 3.12 Team handoff board

A care coordinator can assign non-clinical tasks to records staff, nursing coordinators, pathology liaison teams, or tumor-board administrators. The board shows task ownership, status, source evidence, deadline, comments, and escalation path.

It creates accountability while preserving human decision-making. The AI proposes; authorized staff decide and execute.

## 3.13 Structured search across records

Clinicians can ask constrained factual queries such as:

- “Show all documents from Hospital X.”

- “Find the latest pathology report.”

- “Where is the chemotherapy administration record?”

- “Show references to ‘follow-up’ in source documents.”

- “List documents created after the referral date.”


Responses must return source links rather than free-form medical interpretation. If no evidence is found, the tool says “Not found in the selected record set.”

## 3.14 Change detection and packet freshness

A packet can become stale when a new report arrives. OncoBrief detects newly added or changed documents and marks the preparation packet as “needs refresh.”

It can show what changed—such as a new document, updated version, or new explicit instruction—while leaving all previous approved facts intact for auditability.

## 3.15 Tumor-board administrative preparation

This module supports non-clinical tumor-board operations rather than clinical recommendations. It helps staff gather required documents, assemble a source-linked case packet, assign document-retrieval tasks, confirm presenter and meeting slot, and capture the meeting’s administrative metadata.

Any clinical discussion, diagnosis interpretation, staging, recommendation, or care plan remains a human-only activity outside the AI’s decision-making role.

## 4. Novel differentiation and USPs

## USP 1: Evidence-first, not summary-first

Most generative systems begin with narrative generation and attach citations afterward. OncoBrief should create a structured fact ledger first, then render the timeline and preparation packet from that ledger.

A fact cannot appear in the final view unless it has a source pointer, text span, document version, and confidence state. This “evidence ledger” makes the product more trustworthy than a generic clinical summarizer.

## USP 2: The provenance graph

Beyond hyperlinks, create a visual graph connecting each displayed event to its source document, source page, extracted phrase, document version, reviewer decision, and downstream task.

This makes it possible to answer: “Why is this event on the timeline?” and “Who approved this task?” in one click.

## USP 3: Fact-state separation

Every item is labeled as one of four states:

| State | Meaning |
| --- | --- |
| Extracted | AI found source-supported text; not yet reviewed |


| State | Meaning |
| --- | --- |
| Verified | A human confirmed accuracy against the source |
| Corrected | A human modified the extracted value; original remains visible |
| Rejected | A human rejected the extraction; retained for audit and model improvement |

This is a powerful safety and quality mechanism. It also generates a feedback dataset for continual improvement without hiding model mistakes.

## USP 4: Contradiction without clinical adjudication

The system can detect administrative inconsistencies without deciding which medical statement is correct. For example, if two documents list different procedure dates, OncoBrief shows both values, their sources, and a “needs reconciliation” marker.

It does not choose the correct value, infer a clinical explanation, or overwrite either source. A human resolves the conflict.

## USP 5: Record quality score, not patient risk score

Instead of risk-scoring the patient, OncoBrief produces a Record Readiness Score based on operational factors only: document completeness, duplicate burden, unresolved source conflicts, unverified events, and pending administrative tasks.

This gives teams a safe way to prioritize record preparation without creating clinical risk classification.

## USP 6: Privacy-minimizing local processing option

For hospitals with strict data policies, document OCR and initial extraction can run within a hospital-controlled environment, with only de-identified structured metadata available to the orchestration service where policy allows.

This is a meaningful differentiator in settings where patient data cannot leave institutional infrastructure.

## USP 7: Bilingual document intelligence

OncoBrief can preserve the original language while displaying a clinician-selected translation beside it. The original text always remains accessible, and translations are explicitly labeled as machine-generated.

This is especially valuable where referral letters, handwritten notes, and records use regional languages or mixed-language terminology.


## USP 8: No silent automation

The platform can be designed around a “no silent automation” rule:

- No auto-writeback to EHR

- No auto-closing tasks

- No auto-sending of external requests

- No clinical inference

- No invisible record changes

Every state change has a named person, timestamp, and reason.

## USP 9: Resilient low-connectivity workflow

For hospitals with unreliable connectivity, the extension or desktop companion can queue approved documents locally in encrypted storage, resume upload when connectivity returns, and prevent data exposure on shared computers.

## USP 10: Clinician-controlled display modes

Different users need different depth. A doctor may need a one-screen timeline; a coordinator may need document-retrieval tasks; a tumor-board organizer may need a packet checklist. One underlying evidence ledger can render all three views without generating different, inconsistent summaries.

## 5. Existing systems globally

Several global products address adjacent parts of this problem, but they generally focus on different workflows.

## Vizlitics Consult Prep

Vizlitics offers consult preparation using internal and external EHR and fax records, source- linked summaries, chronological treatment history, record retrieval, and tumor-board workflow support. Its public product materials explicitly describe structured, editable, source- linked longitudinal summaries and oncology-specific timelines.

Where OncoBrief differs: OncoBrief is deliberately designed as a non-diagnostic, administrative readiness layer. It avoids diagnosis reconciliation, stage extraction, molecular interpretation, treatment-response synthesis, guideline-related decision points, and clinical recommendations. It emphasizes granular provenance, factual state labels, multilingual record handling, and deployment patterns suitable for heterogeneous hospital environments.


## DeepScribe

DeepScribe is an oncology-oriented ambient AI platform. It provides pre-visit context, documentation support, coding features, and embedded integrations with oncology EHR products such as OncoEMR and iKnowMed.

Where OncoBrief differs: DeepScribe’s center of gravity is encounter documentation and ambient clinical workflow. OncoBrief is built for before-the-visit record reconstruction, document provenance, record completeness, external-paperwork reconciliation, and human- approved administrative task management. It does not record the clinical encounter or create a note from conversation.

## Suki

Suki is an ambient clinical intelligence platform spanning documentation, dictation, coding, patient instructions, orders, and EHR integration across many specialties.

Where OncoBrief differs: Suki is broad, enterprise, and heavily oriented toward ambient documentation and downstream clinical workflow. OncoBrief is a niche oncology operations product that reduces pre-consultation record hunting with document-level evidence, controlled task routing, and a strict non-clinical boundary.

## Other ambient documentation systems

Products such as Abridge, Nuance Dragon Ambient eXperience, Nabla, and Commure primarily capture clinician-patient conversations and generate draft documentation. They reduce after- visit charting burden, but they do not necessarily solve the prior-record fragmentation problem that occurs before the consultation begins.

## 6. Gaps in existing systems

| Common limitation | Why it matters | OncoBrief response |
| --- | --- | --- |
| Ambient systems focus on | The clinician still searches scattered historic | Focus exclusively on pre-visit record |
| conversation-to-note | records before the encounter | preparation |
| Narrative summaries can hide | A polished summary may sound correct while | Fact ledger, source span, version, |
|   |   | confidence, and reviewer state for every |
| uncertainty | missing source nuance | event |
| Deep EHR integrations can be | Many hospitals have fragmented or older | Multiple deployment modes: API, secure |
| costly and slow | systems | upload, approved extension |
|   | Paper, scans, external reports, multilingual | OCR-first, document-origin map, |
| Global tools may be optimized | records, and variable data quality remain | bilingual display, low-connectivity |
| for mature EHR markets | difficult | support |
| Systems may blend operational | This raises safety, regulation, and trust | Explicit non-clinical boundary and no |
| and clinical reasoning | concerns | silent automation |
| Task workflows often lack | Staff may not know why a task exists | Every task links to the source instruction |
| evidence context |   | and approval decision |


| Common limitation | Why it matters | OncoBrief response |
| --- | --- | --- |
| Corrections can disappear into | Hard to audit model performance and human | Extracted, verified, corrected, rejected |
| edits | changes | state model |

## 7. How to increase novelty

## Build the “Evidence Ledger” as the core innovation

Do not position OncoBrief as another AI summary tool. Position it as a verifiable operational record layer.

For every timeline event, retain this schema:

- Event type

- Value as displayed

- Original source phrase

- Source document and page

- Text bounding box

- Document version hash

- Extraction method and model version

- Confidence category

- Reviewer action

- Reviewer identity and time

- Linked task, if any

The final timeline is simply a visual interface over this evidence ledger. This is technically distinctive, safer, and easier to audit.

## Add “reconciliation rooms”

When different documents disagree, OncoBrief opens a focused reconciliation view showing source A and source B side by side. The system asks a human to choose one of three actions: retain both as conflicting, mark one as superseded, or correct the structured event with a reason.

This is more useful and safer than allowing an LLM to silently resolve conflicts.

## Add an administrative digital twin

Create a non-clinical representation of the patient’s document journey: which documents exist, where they came from, which are missing, which tasks are open, and who owns each task.

This “administrative digital twin” models workflow readiness, not disease progression. It is a novel and scope-safe framing.


## Add source-grounded natural-language retrieval

Allow questions only over document facts, with mandatory evidence. For example: “Which document mentions a planned follow-up?” The result must show the text location, not merely an answer.

## Add adaptive template packs

Hospitals can define their own document types, consult packet fields, and record-readiness checklists without retraining the model. A breast oncology clinic, radiation oncology department, and surgical oncology unit may use different administrative template packs.

This is commercially valuable because it makes the product configurable without forcing a one-size-fits-all workflow.

## 8. Safety and governance

## Non-clinical boundary

OncoBrief may organize and retrieve information. It may not diagnose, risk-score, interpret laboratory values or radiology findings, assign stage, recommend treatment, suggest tests, determine urgency, generate a care plan, or autonomously send clinical advice.

## Human authority

Humans remain responsible for verifying extracted facts, resolving source conflicts, assigning tasks, deciding document relevance, and exporting any final packet.

## Auditability

Important actions must be traceable: document ingestion, extraction, timeline generation, human edits, approval, task assignment, export, and any authorized writeback.

## Data protection controls

- Least-privilege role-based access

- Consent and policy controls for external records

- Encryption in transit and at rest

- Tenant isolation

- Data-retention rules

- Configurable de-identification for demonstrations and model evaluation

- Download and copy restrictions when required

- Security logging and anomaly monitoring


## 9. Suggested technical architecture

## Layer 1: Access and integration

- Secure web application

- Optional browser extension

- SMART on FHIR / EHR APIs where available

- Secure document upload and scanning workflow

- Hospital identity provider integration

## Layer 2: Document intelligence

- OCR for scans and handwriting where feasible

- Layout analysis and document classification

- Entity extraction constrained to a clinical-operations schema

- Document deduplication and version tracking

- Source-coordinate mapping

## Layer 3: Evidence ledger

- Structured event store

- Original source text and bounding boxes

- Document version hashes

- Confidence and reviewer states

- Change history

- Provenance graph

## Layer 4: Workflow orchestration

- Deterministic rules for packet completeness

- Human approval queues

- Task routing and notifications

- Packet freshness checks

- Escalation rules for missing or contradictory records

## Layer 5: User interfaces

- Clinician timeline and source viewer

- Coordinator task board

- Tumor-board administrative packet builder

- Operations dashboard


- Hospital configuration console

## 10. Recommended product positioning

## One-line pitch:

OncoBrief is a source-verified oncology record-readiness platform that turns fragmented documents into a human-approved consultation packet—without diagnosis, treatment advice, or hidden automation.

## Problem statement:

Before an oncology consultation, care teams lose time locating, reading, reconciling, and validating records scattered across departments, hospitals, scans, and paper documents. This delays readiness, increases administrative burden, and makes it easy for explicitly documented follow-up items or required records to remain buried.

## Solution statement:

OncoBrief creates a longitudinal, source-linked administrative timeline and a human- reviewed work queue from authorized records. Every extracted fact is traceable to the original document, and no consequential action occurs without human approval.

## 11. What not to claim

Avoid these claims unless validated through a formal pilot:

- “Reduces chart review from 8 minutes to 2 minutes.”

- “Increases capacity by 20%.”

- “Prevents redundant testing.”

- “Eliminates missed follow-ups.”

- “Detects incidental findings.”

- “Improves treatment outcomes.”

- “Understands cancer progression.”

Use hypothesis-oriented language instead:

“Designed to reduce pre-consultation record-search time, improve source visibility, and increase closure of explicitly documented administrative tasks.”

## 12. Source notes

- Health-a-thon scope emphasizes healthcare workflows, operations, continuity of care, patient engagement, administrative processes, low implementation effort, human oversight, and auditability; it excludes diagnosis, treatment recommendations, clinical


- decision support, clinical risk scoring, interpretation of medical data, and autonomous clinical advice.

- The supplied cancer-track material describes an oncology consultation readiness assistant with OCR, timeline creation, source-linked verification, and a non-diagnostic operational boundary.

- Vizlitics publicly describes oncology consult-preparation, source-linked longitudinal summaries, record retrieval, and tumor-board workflows.

- DeepScribe publicly describes oncology ambient documentation and pre-visit context within oncology EHR environments.

- Suki publicly describes an ambient clinical intelligence platform for documentation, coding, patient instructions, orders, and major-EHR integration.
