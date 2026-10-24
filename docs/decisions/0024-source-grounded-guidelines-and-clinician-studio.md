# 0024 — Source-grounded oncology guideline co-pilot and clinician productivity studio

Status: Accepted. Date: 2026-10-24.

## Context

Phase 4 of the OncoBrief V4 Enhancement Plan introduces an institutional oncology knowledge-retrieval system (guideline co-pilot) and an oncology-focused clinician productivity studio.

The core safety doctrine of OncoBrief (CLAUDE.md and AGENTS.md) mandates:
1. The platform is exclusively focused on cancer care administrative workflows and clinician operations.
2. The platform must NEVER autonomously diagnose cancer, interpret scans, infer stage or progression, recommend medications or doses, or calculate clinical risk.
3. Institutional oncology guidelines and hospital SOPs are reference materials for clinician review only, never autonomous clinical decision support.
4. The Evidence Ledger is the single source of truth; every clinical statement must trace back to an immutable source span.
5. All consequential clinician documents (referral letters, tumor board decks, case reports, visit summaries) must be assembled from verified facts, edited under clinician control, and cryptographically frozen upon approval.

Migration `0011_v4_oncology_enhancement.sql` previously established the relational tables `guideline_document`, `guideline_span`, and `studio_artifact` with forced PostgreSQL Row-Level Security (RLS) and immutability triggers. However, the operational service layer, chat intent classification, prompt injection defenses, deterministic draft generation, citation validation gates, cryptographic snapshot hashing, and multi-format exports (ABDM, mCODE, Markdown, JSON) remained to be implemented.

## Decision

### 1. Guideline Knowledge Retrieval & Intent Classification
- Added `'guideline_knowledge_question'` to the PostgreSQL `chat_intent` enum via migration `0014_guideline_chat_intent.sql`.
- Updated assistant intent classification (`classifyIntent`) to strictly prioritize `UNSUPPORTED_MEDICAL_PATTERNS` ahead of guideline pattern matching. Queries asking whether a patient should start or receive a drug, chemo dosage, or procedure are blocked immediately as `unsupported_medical_question` and given a standard clinical boundary refusal.
- Institutional oncology guidelines and demonstration SOPs are retrieved deterministically from PostgreSQL (`guideline_document`, `guideline_span`) by tenant ID, active status, and keyword relevance. No external vector database or non-deterministic embeddings were introduced.
- Guideline passages are rendered with distinct `[G1]`, `[G2]` citations and interactive `SourceCard` components displaying document title, version, page number, and exact quoted text coordinates. Patient evidence continues to be cited separately as `[E1]`, `[E2]`.
- All guideline responses explicitly carry the mandatory clinician disclaimer: *"Reference Guideline Extract — For Clinician Review Only (Not a Patient-Specific Order)"*.
- Fixed the previous `openTasksCount` defect in `apps/web/src/lib/assistant/tools.ts`: open task count is now obtained by querying real tasks via `listTasks(q, patientId)` filtered by open status (`status = 'open' OR status = 'in_progress' OR status = 'blocked'`), rather than counting timeline events.

### 2. Prompt Injection Resistance
- Guidelines and patient documents are treated as untrusted source inputs.
- Source passages are isolated inside demarcated text blocks in prompts, and LLM calls run with a 3-second timeout fallback to deterministic synthesis (`synthesizeDeterministicGuidelineAnswer`), preventing hanging or jailbreak exfiltration.

### 3. Clinician Productivity Studio
- Implemented deterministic draft generators in `@oncobrief/domain` (`packages/domain/src/studio/draft-generator.ts`) supporting all four required oncology document formats:
  1. **Specialist Referral / Transfer Letter**: source-backed diagnosis, staging, biomarkers, treatment history, and documented reason for referral.
  2. **Multidisciplinary Tumor Board Deck**: structured case identity, timeline, diagnostic findings, and discussion questions formatted as printable slide cards.
  3. **De-Identified Academic Case Report Draft**: CARE-guideline aligned structure with mandatory de-identification removing 18 HIPAA Safe Harbor identifiers (patient names, MRNs, ABDM IDs, phone numbers, email addresses, and specific dates).
  4. **Patient & Caregiver Visit Summary**: plain-language summary with translated medical terms, pending items, and warning signs without altering source facts.
- Built full-featured interactive Studio workspace (`ProductivityStudio.tsx`) mounted at `/patients/[id]/packet`, featuring document kind selector, side-by-side markdown editor, interactive printable slide deck view, live citation inspector, and approval action bar.

### 4. Citation Validation Gate & Fact Verification Rule
- Implemented deterministic citation validation (`revalidateStudioMarkdownCitations` and `validateAnswerCitations`) ensuring every `[E#]` and `[G#]` citation resolves to an accessible, tenant-scoped record.
- Enforced the strict evidentiary rule: **clinician approval is blocked if any cited evidence fact is in an unverified state (`cannot_approve_unverified_facts`)**. Only source-verified facts can be formally approved into an institutional document artifact.

### 5. Cryptographic Snapshot Freezing & Multi-Format Export
- Upon clinician approval (`approveStudioArtifact`), the system computes a SHA-256 cryptographic snapshot hash across `(content_markdown, cited_facts, cited_guidelines, approved_by, approved_at)` and sets state to `approved`.
- Once approved, the document artifact is frozen. Database triggers prevent tampering.
- Implemented `/api/v1/studio/[artifactId]/export` supporting 4 export formats:
  - `markdown`: raw approved markdown text.
  - `json`: structured JSON representation including metadata, cited facts, and cryptographic hash.
  - `abdm`: ABDM v6.5.0 compliant FHIR DocumentBundle (`CareContext` linked).
  - `mcode`: HL7 FHIR Genomics / mCODE STU4 Bundle containing CancerCondition and CancerRelatedRadiationProcedure / MedicationStatement resources.
- Every export logs an append-only audit event (`studio.exported`) in `audit_event` with SHA-256 hash chaining and metadata redaction.

## Alternatives and Consequences

- **Vector Database vs. PostgreSQL Full-Text/Keyword Retrieval**:
  *Alternative*: Deploying pgvector, Pinecone, or Chroma for vector similarity search.
  *Rejection*: External vector stores introduce non-deterministic retrieval, additional container dependencies, and complex index synchronization. PostgreSQL relational search with version pinning, active flags, and tenant RLS satisfies all guideline lookup requirements with deterministic auditability and zero external infrastructure.
- **Autonomous LLM Generation vs. Deterministic Template Synthesis**:
  *Alternative*: Having an LLM generate medical draft text unconstrained.
  *Rejection*: LLMs hallucinate medical details and cannot guarantee strict citation mappings. Deterministic drafting guarantees 100% evidence-anchored text where every clinical statement has verified provenance.
- **Permitting Approval with Unverified Facts**:
  *Alternative*: Allowing draft approval with an "unverified warning" badge.
  *Rejection*: Violates OncoBrief's core design doctrine. Consequential administrative documents must be built exclusively upon human-verified facts.

## Measurement Definitions

- **Guideline Retrieval Citation Accuracy**: 100% of generated `[G#]` citations link to an active, authorized `guideline_span` record with authentic page and text coordinates.
- **Clinical Refusal Precision**: 100% of patient-specific prescribing, dosing, and staging decision queries are rejected with non-prescriptive boundary refusals.
- **De-Identification Compliance**: 0% PHI leakage (patient names, contact numbers, raw identifiers) in academic case report exports.
- **Cryptographic Immutability**: 100% of approved studio artifacts possess verifiable SHA-256 content hashes.
