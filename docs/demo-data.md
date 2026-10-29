# OncoBrief — Synthetic Demo Data & Scenario Guide

## 1. Safety & Privacy Principle

All demo data in OncoBrief is **100% synthetic**. Every demo record is explicitly flagged with `is_demo_fixture = true`. No Protected Health Information (PHI) or real hospital data is ever bundled or committed to the repository.

---

## 2. The Core Oncology Scenarios

The synthetic dataset is engineered so that **the data contains the clinical problem**:

### 2.1 DEMO-001: Meera Krishnan — The Fragmented Referral
- **MRN**: `SUN-448120` (also `RCI-2026-001`)
- **Primary Clinician**: Dr. Meera Rao (Medical Oncology)
- **Care Team**: Dr. Meera Rao, Dr. Rajesh Sharma (Surgical Oncology), Anita Joseph (Care Coordinator)
- **The Problem**: Multi-source document fragmentation with a genuine contradiction:
  - The discharge summary from an external hospital states the date of wide local excision surgery as **12 November 2024**.
  - The histopathology report from the pathology lab states the surgical specimen was collected on **14 November 2024**.
- **Platform Capability Demonstrated**: Automatic conflict detection, side-by-side source span inspection, human-in-the-loop resolution, and audit logging.

### 2.2 DEMO-002: Ramesh Patel — Staleness & Fact Reopening
- **MRN**: `RCI-2025-0044`
- **Primary Clinician**: Dr. Rajesh Sharma (Surgical Oncology)
- **The Problem**: An appointment fact verified in a June consultation is reopened when a July progress note introduces new systemic chemotherapy regimens and revised follow-up dates.
- **Platform Capability Demonstrated**: Immutable Evidence Ledger append-only semantics, automated reopening of verified facts upon contradictory evidence, and notification of the clinical care team.

### 2.3 DEMO-003: Sunita Sharma — Record Readiness & Consultation Preparation
- **MRN**: `READY-1001`
- **Primary Clinician**: Dr. Ananya Sen (Radiation Oncology)
- **The Problem**: A complex multimodality oncology case that has achieved complete record readiness.
- **Platform Capability Demonstrated**: 100% checklist satisfaction against the NCG oncology follow-up workflow, zero open conflicts, fully verified evidence facts, and an approved multidisciplinary consultation preparation packet.

### 2.4 Multi-Tenant Cross-Contamination Test
- **Organization**: Northgate General Hospital (`northgate`)
- **Patient**: `DEMO-001 — Other tenant`
- **MRN**: Colliding `SUN-448120`
- **Purpose**: Verifies that forced PostgreSQL Row-Level Security (`tenant_isolation`) strictly isolates records between healthcare institutions, preventing cross-tenant data leaks even when hospital MRNs collide.

### 2.5 Milestone B Oncology Operations Fixtures
- **Appointments**: Pre-scheduled consultations for `DEMO-001` (Meera Krishnan) and `DEMO-002` (Ramesh Patel) with assigned oncologists, tokens (`TK-001`, `TK-002`), and consulting rooms.
- **Active Consultation Encounter**: In-progress encounter for `DEMO-001` with attending participants and an authored draft note.
- **Multidisciplinary Tumor Board**: Pre-scheduled Thoracic & Breast Oncology Tumor Board meeting with registered case presentations and four-point checklist tracking.
- **Consented Family Caregivers**: Consented contacts with Hindi and English voice/text preferences and sync reminders enabled.

---

## 3. Idempotent Bootstrap vs. Fixture Reset

### Idempotent Bootstrap (`bootstrapDemo()`)
- Checks if demo institutions and patients exist.
- Non-destructively upserts missing demo staff accounts, specialties, departments, and facilities.
- **Never touches, modifies, or truncates user-created patients or non-demo data.**

### Destructive Fixture Reset (`seed()` / `pnpm demo:reset`)
- Checks environment variables (`ONCOBRIEF_DEMO_MODE=true`, `DEMO_DATABASE_NAME=...`).
- Inspects database: if ANY row exists with `is_demo_fixture IS DISTINCT FROM true`, the script **immediately halts** with error `demo_reset_non_synthetic_data`.
- Guarantees that real hospital patient data can never be accidentally wiped.
