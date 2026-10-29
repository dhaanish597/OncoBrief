# OncoBrief V5 — Milestone A: Complete Real Application Foundation

## Executive Summary

Milestone A transforms OncoBrief from a seeded oncology workflow demonstration into a production-grade, persistent, multi-user oncology operational platform. All patient intake, user lifecycle, clinician administration, and multidisciplinary care team operations now execute through verified database transactions protected by PostgreSQL Row-Level Security (RLS) with tenant isolation.

---

## 1. Architectural Foundations

### 1.1 Database Schema Extensions (Migrations 0016 & 0017)
- **`facility`**: Physical hospital campuses and cancer centre sites (`code`, `name`, `address`, `is_active`).
- **`department`**: Oncology clinical departments (`code`, `name`, `specialty`, `facility_id`, `is_active`).
- **`clinician_profile`**: Clinician credentials, specialties (`Medical Oncology`, `Surgical Oncology`, `Radiation Oncology`), sub-specialties, medical council license numbers, and room assignments.
- **`user_invitation`**: Secure invitation workflow with cryptographically random tokens (`token`, `email`, `role`, `department_id`, `expires_at`, `accepted_at`).
- **`patient_care_team`**: Multidisciplinary care team assignments (`role_in_team`, `is_active`, `notes`, `assigned_at`, `assigned_by`).
- **`patient` extended demographics**: Date of birth (`dob`), `gender`, `phone`, `email`, `address`, `status` (`active` | `archived`), `primary_clinician_id`, `department_id`, `facility_id`, `referral_source`, `referral_notes`, and archival metadata.
- **Forced Row-Level Security**: All new tables have `ENABLE ROW LEVEL SECURITY` and `FORCE ROW LEVEL SECURITY` with transaction-scoped tenant context (`app.org_id`).

### 1.2 Multi-User Lifecycle & Role Matrix
OncoBrief supports 8 distinct organizational roles with strict server-side enforcement:
1. **Clinician / Oncologist**: Evidence verification, conflict resolution, consultation packet approval, clinical notes.
2. **Care Coordinator**: Patient intake, navigation, appointment reminder composition, care team coordination.
3. **Records Officer**: Intake document management, checklist assignment, gap tracking, archival.
4. **Receptionist**: Patient registration, demographic updates, source document upload, front-desk intake.
5. **Hospital Administrator (`org_admin`)**: Staff invitations, role assignments, department/facility management, user deactivation.
6. **Platform Administrator (`platform_admin`)**: Multi-tenant operational configuration; strictly barred from routine unverified clinical evidence mutation.
7. **Auditor**: Independent read-only inspection of immutable Evidence Ledger and audit event logs.
8. **Tumor Board Coordinator**: Multidisciplinary review scheduling, task coordination, packet drafting.

---

## 2. Implemented Surfaces & Capabilities

### 2.1 Administration Console
- **`/admin`**: Operational overview with active staff counts, clinician roster breakdown, pending invitations, facility/department summary, and live audit event stream.
- **`/admin/users`**: Complete staff directory, role reassignment, user deactivation/reactivation, and staff invitation form with immediate dev activation tokens.
- **`/admin/clinicians`**: Oncology clinician directory, specialty tagging, department linking, and profile management.
- **`/admin/departments`**: Physical hospital facility registration and clinical department configuration.
- **`/admin/settings`**: Tenant organization identity, ABDM gateway identifiers (`HIP ID`, `HIU ID`, `HFR Facility ID`), and tenant audit log.
- **`/activate?token=...`**: Public staff invitation activation portal with secure password setup.

### 2.2 Patient Registry
- **`/patients`**: Real persistent patient directory with search, readiness band filtering, and active/archived tabs.
- **`/patients/new`**: Administrative patient intake form with duplicate MRN pre-check, contact coordinates, primary clinician assignment, and department routing.
- **`/patients/[id]/overview`**: Unified patient overview displaying contact coordinates, assigned clinician, multidisciplinary care team roster, operational readiness grid, recent timeline events, and source document inventory.
- **`/patients/[id]/edit`**: Demographic updates, contact editing, clinical context notes, and soft-delete archival/reactivation with mandatory clinical reason.
- **`/patients/[id]/care-team`**: Multidisciplinary care team management (assigning and removing clinicians, coordinators, and oncology specialists).

### 2.3 Clinical Workspace Redesign (`/workspace`)
Three user-selectable, persistent workspace views:
1. **📋 Readiness Worklist (`?view=list`)**: Patients ordered by record readiness with search, clinician filter, department filter, and live DB counts.
2. **⏳ Longitudinal Timeline (`?view=timeline&patientId=...`)**: Chronological dated events projected from the immutable Evidence Ledger, with modality filter (Pathology, Imaging, Chemo, Radiation, Surgery, Labs) and click-to-source provenance navigation.
3. **🏥 OPD Flow (`?view=opd`)**: OPD clinic date navigation and queue management with real-time authorized status transitions.

---

## 3. Strict Clinical Non-Diagnostic Boundary

Every newly implemented surface strictly adheres to OncoBrief's non-diagnostic operational boundary:
- Patient registration and edit forms collect **administrative coordinates only**.
- No form permits manual input of cancer diagnosis, TNM staging, or treatment regimens.
- All clinical facts must emerge exclusively from uploaded medical source documents through the immutable Evidence Ledger.
- Platform administrators and organizational administrators are prevented from approving consultation packets or attesting to unverified clinical facts.

---

## 4. Verification & Testing

- **Database Integration Tests (`packages/db/test/milestone-a.test.ts`)**: 15 tests covering patient CRUD, duplicate MRN prevention, clinician profiles, care teams, soft-delete archival, staff invitations, and tenant isolation under forced RLS.
- **Web Security & Boundary Tests (`apps/web/src/lib/milestone-a-security.test.ts`)**: 19 tests verifying the RBAC matrix and clinical boundary protections across all 8 roles.
- **Automated Monorepo Verification**:
  - `pnpm typecheck`: Clean (0 errors across 6 packages).
  - `pnpm lint`: Clean (0 eslint errors, clean clinical boundary scan, clean branding check).
  - `pnpm test`: 100% passing across domain, ports, adapters, db, worker, and web.
