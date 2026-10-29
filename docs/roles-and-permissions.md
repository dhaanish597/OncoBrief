# OncoBrief — Roles & Permission Matrix

## Architecture Principle

Every user mutation in OncoBrief is authorized server-side before execution. UI buttons and controls conditionally hide or disable based on roles, but the definitive boundary is enforced in database services, server actions, and domain policies.

---

## 1. Role Definitions

| Role Code | Title | Core Operational Scope |
| :--- | :--- | :--- |
| **`clinician`** | Oncologist / Attending Physician | Evidence fact verification, conflict resolution, consultation packet approval, clinical context |
| **`coordinator`** | Care Coordinator / Nurse Navigator | Patient onboarding, care team navigation, appointment reminders, gap tracking |
| **`records_officer`** | Medical Records Officer | Record intake, document confirmation, checklist assignment, record gap management, archival |
| **`receptionist`** | Front-Desk Receptionist | Patient intake and registration, demographic updates, initial document upload |
| **`org_admin`** | Hospital Administrator | Staff invitations, role management, user activation/deactivation, facilities & departments |
| **`platform_admin`** | Platform Operations Engineer | Multi-tenant platform configuration, institutional settings |
| **`auditor`** | Compliance & Quality Auditor | Read-only inspection of Evidence Ledger hash chains, audit logs, and compliance trails |
| **`tumor_board_coordinator`**| Tumor Board Coordinator | Multidisciplinary meeting preparation, agenda tracking, packet drafting, case review tasks |

---

## 2. Definitive Permission Matrix

| Permission | `clinician` | `coordinator` | `records_officer` | `receptionist` | `org_admin` | `platform_admin` | `auditor` | `tumor_board` |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **`patient:read`** | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ |
| **`patient:create`** | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| **`patient:update`** | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| **`patient:archive`** | ❌ | ❌ | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ |
| **`document:upload`** | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| **`document:read_page`** | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ |
| **`evidence:verify`** | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ✅ |
| **`evidence:correct`** | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **`evidence:reject`** | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **`conflict:resolve`** | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **`task:create`** | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ |
| **`task:assign`** | ❌ | ✅ | ✅ | ❌ | ✅ | ❌ | ❌ | ✅ |
| **`packet:draft`** | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| **`packet:approve`** | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **`packet:export`** | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ | ✅ |
| **`message:compose`** | ❌ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| **`message:approve`** | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **`checklist:author`** | ❌ | ❌ | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ |
| **`audit:read`** | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ | ✅ | ❌ |
| **`user:manage`** | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ | ❌ | ❌ |
| **`clinician:manage`** | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ | ❌ | ❌ |
| **`department:manage`**| ❌ | ❌ | ❌ | ❌ | ✅ | ✅ | ❌ | ❌ |

---

## 3. Core Safety Rules & Invariants

1. **Clinician-Only Approvals**: `packet:approve` and `message:approve` are strictly reserved for licensed clinicians (`clinician`). An administrator or coordinator can never sign off on clinical documentation leaving the hospital.
2. **Strict Auditor Read-Only Boundary**: The `auditor` role has zero mutating permissions across the entire platform. Any attempt by an auditor to create a patient, edit a record, or modify an evidence fact is rejected immediately.
3. **Administrator Separation of Powers**: An administrator (`org_admin` or `platform_admin`) cannot verify, correct, or reject clinical evidence. System administration does not confer clinical judgment authority.
4. **Platform Admin Clinical Blackout**: `platform_admin` cannot view patient charts or medical records unless explicitly acting through authorized audit inspection channels.
