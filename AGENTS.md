# OncoBrief Agent Rules

Read these before implementation:

* docs/oncobrief_deep_research_health-a-thon-2026.md
* docs/oncobrief_clinician_platform_design.md
* docs/cancer_track.md
* CLAUDE.md

CLAUDE.md defines the project-wide engineering and safety rules.

## Mission

Build OncoBrief as an evidence-first oncology operational platform.

Core pipeline:

Documents
→ OCR
→ Classification
→ Evidence Extraction
→ Evidence Ledger
→ Provenance
→ Human Verification
→ Reconciliation
→ Administrative Digital Twin
→ Consultation Packet
→ Care Continuity

## Never turn the product into

* a generic healthcare dashboard
* a todo application
* a Kanban application
* a clinical AI assistant
* a diagnosis system
* a treatment recommender
* a risk-scoring system

## Core Rule

The timeline is a view over the Evidence Ledger.

The Evidence Ledger is the source of truth.

Every displayed fact requires provenance.

Every consequential action requires human approval.

Never silently resolve contradictions.

Never invent medical facts.

Never infer medical requirements.

## Engineering

Inspect the existing repository before changing it.

Prefer deterministic code for deterministic workflows.

Use typed schemas.

Write tests.

Keep changes focused.

Do not rewrite working systems unnecessarily.

Do not introduce infrastructure without documenting why.

## Demo

The application must demonstrate:

document fragmentation
→ evidence extraction
→ source inspection
→ human verification
→ contradiction reconciliation
→ record readiness
→ source-backed task
→ consultation packet
→ approved patient continuity message
→ audit trail

## Definition of Done

A feature is not complete until:

* implementation works
* relevant tests pass
* UX is coherent
* auditability is preserved
* security assumptions are documented
* clinical boundaries are preserved
* the demo flow still works
