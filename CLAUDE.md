# OncoBrief — Claude Code Instructions

## Project

OncoBrief is a source-verified oncology record-readiness and care-continuity platform for Health-a-thon 2026.

It is an assistive operational system.

It is NOT:

* a diagnostic system
* a treatment recommendation system
* clinical decision support
* clinical risk scoring
* medical interpretation
* autonomous clinical advice

The system must maintain a strict non-clinical boundary.

---

## Source of Truth

Before making architectural or product decisions, read:

* docs/oncobrief_deep_research_health-a-thon-2026.md
* docs/oncobrief_clinician_platform_design.md
* docs/cancer_track.md

These documents define the product vision, research findings, safety boundary, architecture, use cases, novelty strategy and implementation direction.

Do not silently replace requirements from these documents with generic healthcare SaaS patterns.

If a requirement is ambiguous, inspect the existing implementation and document the decision before making a major architectural change.

---

## Core Product Concept

The central abstraction is the Evidence Ledger.

The product pipeline is:

Fragmented Records
→ Document Ingestion
→ OCR / Layout Extraction
→ Document Classification
→ Structured Evidence Extraction
→ Evidence Ledger
→ Provenance
→ Human Verification
→ Reconciliation
→ Administrative Digital Twin
→ Consultation Packet
→ Care-Team Workflow
→ Patient Continuity

The timeline is a VIEW over the evidence ledger.

The timeline is not the core data model.

---

## Evidence Model

Every displayed fact must be traceable to:

* source document
* source page
* source text/span
* document version
* extraction method/model
* confidence
* reviewer state
* reviewer identity
* timestamp
* linked administrative task where applicable

Evidence states:

* extracted
* verified
* corrected
* rejected
* conflicting

Never silently overwrite source evidence.

Corrections must preserve the original extracted value.

---

## Contradictions

The system must NOT silently resolve contradictory source documents.

If two documents disagree:

* preserve both sources
* show both values
* mark the evidence as conflicting
* require human resolution

Possible human outcomes:

* retain both as conflicting
* mark one as superseded
* correct the structured event with a reason

---

## Administrative Boundary

Allowed:

* document organization
* source-grounded fact extraction
* document completeness
* explicit administrative instructions
* appointment information already documented
* document retrieval tasks
* administrative follow-up
* provenance
* record readiness
* care-team coordination
* multilingual administrative communication

Not allowed:

* diagnosis
* prognosis
* staging
* treatment recommendation
* medical interpretation
* risk scoring
* urgency determination
* autonomous clinical advice
* inferred medical requirements

---

## Human-in-the-Loop

No consequential action should happen silently.

Human approval is required for:

* evidence verification
* evidence correction
* conflict resolution
* task assignment
* packet approval
* patient communication
* export
* external requests

Every important state change must have:

* actor
* timestamp
* action
* reason where applicable

---

## Security

Healthcare data must be treated as sensitive.

Implement:

* least-privilege access
* role-based access control
* tenant isolation
* encryption in transit
* encryption at rest where supported
* audit logging
* explicit document scope
* secure session handling
* no silent browser scraping
* no automatic EHR writeback

Do not put secrets into source code.

Do not commit `.env`.

---

## Browser Extension

If implemented:

The extension is only an integration/launch layer.

It must:

* respect hospital permissions
* require explicit user initiation
* transmit only approved context
* use short-lived sessions
* never silently scrape an entire chart
* never bypass EHR permissions
* never automatically write back to the EHR

The supported deployment patterns are:

1. SMART on FHIR / API
2. Secure document upload
3. Approved browser extension

---

## UI Philosophy

Do NOT build a generic healthcare dashboard.

Do NOT make the product look like:

* a todo application
* a CRM
* a Kanban board
* an AI chatbot
* a generic EHR
* a KPI dashboard

The visual identity should communicate:

evidence
provenance
verification
reconciliation
record reconstruction
operational readiness

The key interaction is:

Fact
→ source
→ exact source text
→ human verification
→ evidence state
→ downstream packet/task

---

## Engineering Principles

Prefer:

* deterministic logic for deterministic workflows
* typed schemas
* explicit state transitions
* small modules
* testable services
* auditable mutations
* source-grounded LLM output
* structured outputs instead of free-form generation

Do not use an LLM where deterministic code is sufficient.

Do not create autonomous agents merely for architectural novelty.

---

## Development Rules

Before modifying an existing feature:

1. Inspect current implementation.
2. Understand existing data flow.
3. Preserve working functionality.
4. Identify dependencies.
5. Make the smallest coherent change.
6. Add/update tests.
7. Run relevant tests.
8. Check for regressions.

Do not rewrite the project from scratch unless explicitly instructed.

---

## Testing

Every major feature should have appropriate:

* unit tests
* integration tests
* E2E tests for important user flows

Critical flows must be covered:

* document ingestion
* extraction
* evidence creation
* evidence verification
* evidence correction
* evidence rejection
* contradiction detection
* contradiction resolution
* task creation
* packet approval
* audit logging
* patient communication approval

---

## Demo Requirement

The final prototype must support this end-to-end demo:

1. Open today's consultation workspace.
2. Select a patient.
3. Show fragmented record sources.
4. Show the evidence journey.
5. Select an evidence event.
6. Open its source.
7. Highlight the exact supporting text.
8. Verify the event.
9. Show the state transition.
10. Open a contradiction.
11. Resolve it manually.
12. Show the administrative record map.
13. Show a missing document.
14. Create a source-backed administrative task.
15. Generate the consultation packet.
16. Approve the packet.
17. Open care continuity.
18. Preview a verified administrative patient message.
19. Show the audit trail.

The demo should make the evidence/provenance architecture obvious.

---

## Agent Behavior

Do not claim a feature is implemented unless it actually works.

Do not use fake success states to hide broken backend behavior.

When using mock data, clearly separate:

* demo fixtures
* production data
* generated AI output

If something cannot safely be implemented yet, document the limitation.

---

## Architecture Changes

For significant architecture changes:

Create a short decision record under:

docs/decisions/

Include:

* context
* decision
* alternatives considered
* consequences

Do not silently introduce major infrastructure.

---

## Final Review

Before considering a major milestone complete, verify:

* functionality
* tests
* security
* auditability
* non-clinical boundary
* provenance
* UX consistency
* demo flow

The product should feel like an evidence-first oncology operations platform, not an AI wrapper.
