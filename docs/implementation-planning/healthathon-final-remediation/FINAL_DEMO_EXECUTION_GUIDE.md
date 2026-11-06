# OncoBrief Live Demonstration Execution Guide

**Target Audience:** Health-a-thon Judges, Clinical Evaluators, Technical Architects  
**Demonstrators:** Core Engineering & Product Team  
**Date:** 2026-11-03  

---

## 1. Quick-Start Demonstration Setup (2 Minutes)

Before bringing up the presentation screen:

```bash
# 1. Ensure dependencies and build are ready
pnpm install
pnpm --filter @oncobrief/web build

# 2. Reset the demo database to clean seed state
pnpm demo:reset

# 3. Start the Next.js production web server
pnpm --filter @oncobrief/web start --port 3000
```

Open Chrome or Edge and navigate to:  
`http://localhost:3000`

---

## 2. Seed Demo Credentials Cheat-Sheet

All demo accounts share the password: `oncobrief-demo`

| Role | Email | Best For Showing |
|---|---|---|
| **Attending Oncologist** | `dr.rao@rci.demo` | Clinical Timeline, Source Verification, Reconciliation Room, Packet Approval |
| **Care Coordinator** | `coord.anita@rci.demo` | Administrative Task Assignment, OPD Slot Allocation, Walk-in Ingestion |
| **Records Officer** | `records.deepak@rci.demo` | Document Upload Queue, ABDM M3 Pull, Duplicate Candidate Resolution |
| **Independent Auditor** | `auditor.k@rci.demo` | Merkle Hash Chain Audit Trail, Export Hash Validation (Clinicians denied access) |
| **External Specialist** | `dr.menon@northgate.demo` | Multi-Tenant Isolation (Tenant B oncologist cannot see RCI patients) |

---

## 3. Ten-Scene Judge Demonstration Script (10-12 Minutes)

### Scene 1: Document Ingestion & Multimodal OCR (Screen 2 & 3)
1. Log in as `records.deepak@rci.demo`.
2. Navigate to **Upload / Pipeline** (`/upload`).
3. Show the multi-tab ingestion hub: PDF documents, scanned faxes, and camera prescription photos.
4. Highlight Sarvam Vision Document AI Digitise extraction in action: OCR parses structured tables, French/English text, and normalizes geometry.
5. Emphasize: *No facts enter the patient record without an immutable cryptographic provenance link.*

### Scene 2: Interactive Evidence Ledger & Split Viewer (Screen 5)
1. Switch to Attending Oncologist `dr.rao@rci.demo` and open patient **Kavita S. (DEMO-001)**.
2. Open the **Sources / Evidence Viewer** (`/sources`).
3. Click an unverified laboratory fact (e.g. `Hemoglobin 11.4 g/dL`).
4. Show the PDF split viewer automatically scrolling to Page 1 and highlighting the exact bounding box in high-contrast SVG.
5. Demonstrate the Stage A / Stage B human verification workflow.

### Scene 3: Times New Roman Clinical Hierarchy & Deduplication
1. Open the **Clinical Context** page (`/timeline`).
2. Show the clinical typographic hierarchy: Times New Roman serif styling scoped strictly to clinical narrative blocks to mirror authentic hospital charts.
3. Show the **Baseline Deduplication**: identical repeated baseline observations across multiple referral letters are merged into a clean chronological thread rather than cluttering the screen.

### Scene 4: Interactive Oncology Analyte Charts
1. Scroll to the **Longitudinal Analyte Trends** chart.
2. Hover over a marker (e.g., CA-15-3 or Hemoglobin) — show the hover tooltip displaying the verbatim value, source document name, and verification state.
3. Click the data point: the app navigates directly to the source PDF and highlights the reference range.
4. Toggle **Multi-Marker Comparison Mode** and show overlapping lab trends with treatment timeline milestones (chemotherapy cycles).

### Scene 5: Reconciliation Room (Contradiction Handling)
1. Point to the amber **Contradiction Alert**: Two discharge summaries report conflicting surgery dates (`12-Oct-2026` vs `14-Oct-2026`).
2. Emphasize Core Rule: *Never silently overwrite a medical contradiction.*
3. Open the **Reconciliation Room** (`/reconciliation`).
4. Select the correct operative date, type the clinician rationale ("Confirmed with Operative Theater Logbook"), and click **Reconcile**.
5. Show that both historical facts remain in the Evidence Ledger with full audit history; nothing is deleted.

### Scene 6: OPD Slots & Real Capacity Walk-in Allocation
1. Log in as Care Coordinator `coord.anita@rci.demo`.
2. Navigate to **Appointments & Capacity** (`/appointments`).
3. Show the real-time waitlist and vacant OPD capacity slots.
4. Show a real walk-in patient arrival: allocating the slot consumes vacant capacity and automatically notifies the next waitlist candidate.

### Scene 7: Consultation Packet Compilation & PDF Export
1. Return to `dr.rao@rci.demo`.
2. Open **Consultation Packet Generator** (`/studio`).
3. Select an oncology document template (e.g., Chemotherapy Treatment Summary).
4. Review the auto-populated facts, verify all facts are backed by verified evidence, and click **Approve & Sign-Off**.
5. Show the exported consultation packet PDF with cryptographic SHA-256 integrity stamp.

### Scene 8: Connected Clinician-to-Patient Continuity Loop
1. Show the approved care continuity message generated in English, Hindi, and Tamil.
2. Open the **Patient Portal** (in mobile browser view or Pixel 5 emulation):
3. Log in as patient `DEMO-001`.
4. The patient immediately sees the approved continuity message.
5. Tap **Listen in Hindi**: Sarvam Bulbul TTS plays natural regional audio instructions.
6. Show the prominent clinical boundary disclaimer: *"For administrative information only. Not medical advice."*

### Scene 9: ABDM M2/M3 National Health Stack Ingestion
1. As `records.deepak@rci.demo`, navigate to **ABDM Integration** (`/sources/abdm`).
2. Click **Pull ABDM Bundle (Tata Memorial ACTREC)**.
3. Show the encrypted FHIR bundle ingestion, ephemeral Diffie-Hellman key wipe, and the newly populated diagnostic records in the Evidence Ledger.

### Scene 10: Auditor Merkle Hash Chain Verification
1. Log out and attempt to access `/audit` as `dr.rao@rci.demo` — show the RBAC 403 Forbidden barrier.
2. Log in as Independent Auditor `auditor.k@rci.demo`.
3. Open **Audit Trail & Provenance** (`/audit`).
4. Click **Verify Cryptographic Hash Chain**: show the system verifying all sequential SHA-256 hashes back to the genesis block with a green checkmark.

---

## 4. Explaining the Strict Non-Diagnostic Boundary to Judges

If judges ask: *"Does OncoBrief tell the oncologist what chemotherapy drug to prescribe or diagnose the tumor stage?"*

**Answer:**
> *"No, by strict architectural mandate. OncoBrief is an Evidence Ledger and Administrative Operating System, not a clinical diagnostic assistant. Clinical AI that invents recommendations or infers missing staging creates unacceptable liability in oncology. OncoBrief guarantees that 100% of the facts displayed on screen come with verifiable cryptographic source provenance, and any medical contradiction requires explicit clinician reconciliation."*

---

## 5. Contingency & Troubleshooting Procedures

1. **If external Sarvam AI API experiences latency during the demo:**
   - The system automatically engages the local fallback engines (deterministic OCR parser and browser Web Speech API).
   - The UI displays an honest notification badge: *"Using local high-speed synthesis engine."*
2. **If the demo database gets into an unexpected state during live testing:**
   - Run `pnpm demo:reset` in the terminal.
   - Refresh the browser — the entire database is restored to the pristine baseline in <3 seconds.
3. **If internet connection is completely lost:**
   - The entire demo flow runs 100% offline using the bundled synthetic fixtures, local PostgreSQL, and Next.js server.
