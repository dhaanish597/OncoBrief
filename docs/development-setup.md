# OncoBrief — Local Development & Setup Runbook

## Prerequisites

- **Node.js**: v20.x or higher
- **pnpm**: v9.x or higher
- **PostgreSQL**: v15 or v16 running locally (default: `localhost:5432`)

---

## 1. Environment Configuration

1. Copy `.env.example` to `.env` in the repository root:
   ```bash
   cp .env.example .env
   ```
2. Verify local database URLs in `.env`:
   ```bash
   DATABASE_URL=postgres://oncobrief_app:oncobrief_app@localhost:5432/oncobrief
   DATABASE_MIGRATOR_URL=postgres://postgres:postgres@localhost:5432/oncobrief
   DEMO_DATABASE_NAME=oncobrief
   ONCOBRIEF_DEMO_MODE=true
   SESSION_COOKIE_SECRET=your-32-character-secret-key-goes-here
   ```

---

## 2. Database Migration & Initialization

1. Apply all schema migrations (0001 through 0017):
   ```bash
   pnpm db:migrate
   ```
2. Seed initial demo data (synthetic oncology patients, clinician roster, NCG checklists):
   ```bash
   pnpm db:seed
   ```
   > **Note on Safety:** The seed script refuses to run if non-synthetic (real user-created) records are present in the database, protecting production and testing data from accidental truncation.

---

## 3. Starting Local Development Servers

- Run both the Next.js web application and the asynchronous ingestion worker:
  ```bash
  pnpm dev
  ```
  - Web UI: [http://localhost:3000](http://localhost:3000)
  - Worker: In-process background queue processor

---

## 4. Default Demo Accounts

All demo accounts use the default password: `oncobrief-demo`

| Role | Email | Name | Typical Workflow |
| :--- | :--- | :--- | :--- |
| **Clinician (Medical Oncology)** | `dr.rao@rci.demo` | Dr. Meera Rao | Evidence verification, consultation packets |
| **Clinician (Surgical Oncology)** | `dr.sharma@rci.demo` | Dr. Rajesh Sharma | Surgical review, conflict resolution |
| **Clinician (Radiation Oncology)**| `dr.ananya@rci.demo` | Dr. Ananya Sen | Radiation completion summary review |
| **Clinician (Medical Oncology)** | `dr.chen@rci.demo` | Dr. Wei Chen | Refractory case review, chemotherapy |
| **Care Coordinator** | `coord.anita@rci.demo` | Anita Joseph | Patient navigation, care teams, reminders |
| **Records Officer** | `records.deepak@rci.demo`| Deepak Nair | Intake verification, checklist assignment |
| **Receptionist** | `reception.priya@rci.demo`| Priya Nair | Front-desk patient registration, document intake |
| **Hospital Administrator** | `admin.sys@rci.demo` | System Admin | Staff invitations, role management, departments |
| **Auditor** | `auditor.k@rci.demo` | Kavya Iyer | Independent read-only audit inspection |

---

## 5. Verification Commands

Run the full verification battery before submitting any changes:
```bash
# Typecheck all monorepo packages
pnpm typecheck

# Lint and verify clinical non-diagnostic boundary + branding
pnpm lint

# Run all automated tests
pnpm test
```
