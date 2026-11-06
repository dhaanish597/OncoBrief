# ONCOBRIEF — WAVE 1 STABILIZATION & WAVE 2 IMPLEMENTATION PROGRESS REPORT

**Branch:** `feat/v4-assessment-remediation`  
**Scope:** Part A (Wave 0 & Wave 1 Stabilization) + Part B/C/D/E (Wave 2 Full Implementation: `TASK-006`, `TASK-008`, `TASK-011`, `TASK-013`, `TASK-016`, `TASK-017`, `TASK-018`, `TASK-022`, `TASK-023`)  
**Status Classification:** `IMPLEMENTED BUT UNVERIFIED` (Host runtime execution of `node`/`pnpm`/`psql` is blocked by the macOS sandbox environment; all source files, migrations, unit tests, DB tests, and Playwright E2E specs are written directly to the repository and ready for host verification).

---

## 1. PART A — WAVE 0 & WAVE 1 STABILIZATION AUDIT

During Part A stabilization across all Wave 0 (`TASK-001`, `TASK-002`) and Wave 1 (`TASK-003`, `TASK-004`, `TASK-005`, `TASK-007`, `TASK-009`, `TASK-010`, `TASK-012`) files:

1. **Fixed `OcrPageInput` Property Mismatch in `packages/db/src/services/documents.ts` (`TASK-005` / `TASK-017`):**
   - In Wave 1 `ingestNormalizedPages`, `onSegmentPacket` passed `{ pageNumber: p.pageNumber, text: p.plainText }` to `segmentDocumentPacket()`, whereas `OcrPageInput` in `packages/domain/src/ingestion/packet-segmenter.ts` expects `{ pageNumber: p.pageNumber, plainText: p.plainText }`.
   - Fixed in `packages/db/src/services/documents.ts` so `segmentDocumentPacket()` receives `plainText: p.plainText`, segments multi-report packets accurately, and persists them to `document_subpacket`.
2. **Verified `0020_remediation_rls_and_governance.sql` (`TASK-002` & `TASK-004`):**
   - Confirmed `enforce_encounter_note_governance()` accepts canonical fact types `'stage_text.as_written'`, `'diagnosis_text.as_written'`, and `'procedure.recorded'`.
   - Confirmed `ENABLE + FORCE ROW LEVEL SECURITY` and `GRANT SELECT, INSERT, UPDATE, DELETE ... TO oncobrief_app` cover all 14 Milestone A/B tables.
3. **Verified `ClinicalContextView` / `clinical-context/page.tsx` (`TASK-010`):**
   - Inspected `apps/web/src/app/(app)/patients/[id]/clinical-context/page.tsx` and `getPatientClinicalSummary` in `packages/db/src/services/patients.ts`. Confirmed all displayed values come exclusively from real `evidence_fact` rows for the active patient with zero hardcoded synthetic fallback charts.

---

## 2. WAVE 2 DATABASE MIGRATION (`0021_wave2_complete_scope.sql`)

Created `packages/db/migrations/0021_wave2_complete_scope.sql` under `SET ROLE oncobrief_migrator`:
- **`document_subpacket` table (`TASK-017`):** Stores per-document segmented sub-reports (`subpacket_index`, `start_page`, `end_page`, `category`, `stated_date`, `stated_facility`, `confidence`) with `ENABLE + FORCE ROW LEVEL SECURITY`, null-safe `tenant_isolation` policy (`org_id = nullif(current_setting('app.org_id', true), '')::uuid`), and `GRANT SELECT, INSERT, UPDATE, DELETE ON document_subpacket TO oncobrief_app`.
- **`admin_task.priority` column (`TASK-022`):** Adds `priority text NOT NULL DEFAULT 'normal' CHECK (priority IN ('urgent', 'high', 'normal', 'low'))`.
- **`patient_message.webhook_event_id` column (`TASK-023`):** Adds `webhook_event_id text UNIQUE` for idempotent inbound continuity webhook callbacks.
- **`opd_slot_event` action check (`TASK-008`):** Extends `opd_slot_event_action_check` to include `'offer_accepted'` and `'offer_released'`.

---

## 3. WAVE 2 TASKS IMPLEMENTED (ALL 9 TASKS)

| Task ID | Lane | Status | Files Created / Modified | Summary of Implementation |
|---|---|---|---|---|
| **TASK-006** | Lane 1 (Doc Intel) | `IMPLEMENTED BUT UNVERIFIED` | `packages/adapters/src/local-multimodal-ocr.ts`, `packages/adapters/test/ocr-correctness.test.ts` | Replaced the empty stub in `LocalMultimodalOcrAdapter.extractImage(bytes)` with real raster image text extraction supporting PNG `tEXt`/`zTXt`/`iTXt` chunks, JPEG `COM`/`APP1` EXIF/XMP segments, and embedded clinical report scan lines with normalized `[0,1]` bounding boxes, quarantining with `ocr_manual_transcription_required` only when zero text is recoverable. |
| **TASK-017** | Lane 1 (Doc Intel) | `IMPLEMENTED BUT UNVERIFIED` | `packages/db/migrations/0021_wave2_complete_scope.sql`, `packages/db/src/services/documents.ts`, `apps/web/src/app/(app)/patients/[id]/sources/page.tsx`, `apps/web/src/app/(app)/patients/[id]/sources/[documentId]/page.tsx` | Persisted `segmentDocumentPacket()` output into `document_subpacket` during `ingestNormalizedPages`, added subpacket date/facility fallback during candidate extraction, exported `listDocumentSubpackets` & `listPatientDocumentSubpackets`, and rendered interactive sub-report badges and page deep-links on `/sources` and `/sources/[documentId]`. |
| **TASK-018** | Lane 1 (Doc Intel) | `IMPLEMENTED BUT UNVERIFIED` | `packages/db/src/services/guidelines.ts`, `apps/web/src/components/GuidelineLibraryPanel.tsx`, `apps/web/src/app/(app)/patients/[id]/packet/page.tsx`, `apps/web/src/app/(app)/patients/[id]/sources/page.tsx`, `apps/web/src/components/ProductivityStudio.tsx`, `apps/web/src/lib/actions.ts` | Implemented `ingestGuidelineDocumentPdf` and `listGuidelineSpansForDocument` in `guidelines.ts`, added `uploadGuidelinePdfAction` in `actions.ts`, mounted `GuidelineLibraryPanel` on `/packet`, linked `[G#]` citations in `ProductivityStudio.tsx`, and built the `[G#]` Institutional Guideline Source Viewer on `/patients/[id]/sources?guideline=<id>&page=<n>`. |
| **TASK-008** | Lane 2 (Clinic Ops) | `IMPLEMENTED BUT UNVERIFIED` | `packages/domain/src/orchestration/workflow-graph.ts`, `packages/db/src/services/opd-flow.ts`, `apps/web/src/lib/opd-actions.ts`, `apps/web/src/components/OpdWorkspace.tsx` | Implemented `createOpdBackfillWorkflowGraph`, wired it into `listBackfillCandidates`, added `acceptOpdSlotOffer` (transitioning `opd_waitlist_entry` from `'offered'` to `'slotted'` before assigning `opd_appointment_slot` to satisfy `opd_capacity_guard`) and `releaseOpdSlotOffer`, and added **Accept offer** / **Release offer** UI actions in `OpdWorkspace.tsx`. |
| **TASK-023** | Lane 2 (Continuity) | `IMPLEMENTED BUT UNVERIFIED` | `packages/domain/src/orchestration/workflow-graph.ts`, `packages/db/src/services/messages.ts`, `apps/web/src/app/api/v1/continuity/webhook/route.ts` | Implemented `createContinuityOutreachWorkflowGraph` and `processInboundAttendanceWebhook` in `messages.ts`, and created `POST /api/v1/continuity/webhook/route.ts` with HMAC-SHA256 signature verification, `webhook_event_id` idempotency, attendance state updates, and automatic source-linked coordinator `admin_task` creation on `reschedule_requested` or `declined`. |
| **TASK-013** | Lane 2 (Analytics) | `IMPLEMENTED BUT UNVERIFIED` | `packages/db/src/services/opd-flow.ts`, `apps/web/src/components/OpdWorkspace.tsx` | Expanded `listOpdWorkspace` SQL aggregations to include `offers_pending`, `verified_facts`, `total_facts`, and accepted backfill offers alongside walk-ins, rendering 8 live DB-backed metric cards in `OpdWorkspace.tsx` with explicit `Live Stored Record` vs. `Pilot target` labels and zero synthetic fallback numbers. |
| **TASK-011** | Lane 3 (Clinician UI) | `IMPLEMENTED BUT UNVERIFIED` | `apps/web/src/app/(app)/patients/[id]/layout.tsx` | Wired dynamic, source-linked patient snapshot alert banners (`snapshot-alert-conflicts`, `snapshot-alert-gaps`, `snapshot-alert-overdue-tasks`) into `PatientLayout` whenever unresolved conflicts, missing required documents, or overdue administrative tasks exist. |
| **TASK-016** | Lane 3 (Extension) | `IMPLEMENTED BUT UNVERIFIED` | `apps/extension/manifest.json`, `apps/extension/popup.html`, `apps/extension/popup.js`, `apps/extension/content-script.js`, `apps/extension/background.js`, `packages/db/src/services/extension-grants.ts`, `apps/web/src/app/api/v1/patients/[id]/extension-grants/route.ts`, `apps/web/src/app/api/v1/extension/capture/route.ts`, `apps/web/src/components/DocumentUploadForm.tsx` | Built the Manifest V3 browser extension (`apps/extension/*`), the `extension-grants.ts` DB service (enforcing SHA-256 `token_hash`, 10-minute TTL, single-use `used_at`, `origin`, and `scope` checks), the grant/capture API routes, and `ExtensionGrantCapturePanel` in `DocumentUploadForm.tsx`. |
| **TASK-022** | Lane 3 (Action Wiring) | `IMPLEMENTED BUT UNVERIFIED` | `apps/web/src/app/(app)/patients/[id]/packet/page.tsx`, `apps/web/src/app/(app)/patients/[id]/tasks/page.tsx`, `packages/db/src/services/tasks.ts`, `apps/web/src/lib/actions.ts` | Wired `withdrawPacketAction` on `/patients/[id]/packet`, verified `GapWaiverControl` (`confirmGapWaiverAction` / `waiveGap`) on `/patients/[id]/record-map`, and implemented `updateTaskPriorityAndDueOn` + `updateTaskPriorityAndDeadlineAction` on `/patients/[id]/tasks`. |

---

## 4. EXACT MAC TERMINAL COMMANDS FOR HOST VERIFICATION

Run the following commands in your Mac Terminal from `/Users/dhaanish/Documents/OncoBrief` to execute full runtime verification across Wave 0, Wave 1, and Wave 2:

```bash
cd /Users/dhaanish/Documents/OncoBrief

# 1. Static TypeScript, Clinical Boundary, and Branding Hygiene Gates
pnpm -r typecheck
pnpm boundary:check
pnpm branding:check

# 2. Domain & Adapter Unit Tests (TASK-001, TASK-005, TASK-006, TASK-008, TASK-009, TASK-012, TASK-023)
pnpm --filter @oncobrief/domain test
pnpm --filter @oncobrief/adapters test

# 3. Apply Migrations (0001 through 0021) & Seed Isolated Development Database
pnpm db:migrate
pnpm db:seed

# 4. Database & Web Integration Tests (Wave 0, Wave 1, and Wave 2)
pnpm --filter @oncobrief/db test
pnpm --filter @oncobrief/web test

# 5. Playwright End-to-End Verification Suite
pnpm --filter @oncobrief/web test:e2e
```
