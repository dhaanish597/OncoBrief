# OncoBrief V4 — final independent demo validation

Date: 24 October 2026, Asia/Kolkata. Real Chromium, Next.js production build on `http://localhost:3001`, PostgreSQL 16.15, isolated database `oncobrief_codex_review`, temporary local storage. No production or original-database reset, real-patient record, real SMS/WhatsApp, or live cloud provider was used.

## Ordered journey

`apps/web/e2e/independent-judge-journey.spec.ts` executes the ten scenes **in one test, with no reset between scenes**. It authenticates through actual login forms, operates UI controls/server actions, and verifies persisted SQL state. External browser HTTP requests are blocked; backend adapters are explicitly configured local/rule/simulated, with cloud keys empty. This is browser egress restriction plus controlled adapters, not OS-wide network isolation.

| Scene | Tested account/role | Expected versus observed evidence | Result |
|---|---|---|---|
| 1 source-preserved intake | dr.rao@rci.demo / clinician | Synthetic standard bundle adds one document and 9 extracted, unverified, source-linked facts. No hospital connection is implied. | PASS |
| 2 interval changes | clinician | Baseline 05 Jul 2025 appears; Since Last Visit and dated lab view work. | PASS |
| 3 lab provenance and batch | clinician | Haemoglobin delta −1.2 g/dL; link opens the actual document/fact/page with stored highlight. 26 selected facts become verified atomically; SQL counts increase by exactly the selected number. | PASS |
| 4 reconciliation | clinician | Each open source conflict is reviewed in its own room; both source panes visible. Retain both with explicit reason persists resolution. Imported examples may add a real extra conflict; none is silently closed. | PASS |
| 5 OPD | clinician (`opd:manage`) | Exactly ready candidate shown. Confirmation persists offered waitlist while slot remains vacant/patient NULL. Explicit release, then confirmed arrived walk-in persists walk_in/slotted. | PASS |
| 6 source-backed task/ownership | coord.anita@rci.demo / coordinator | Create task from actual missing requirement, select named owner, confirm assignment. SQL assigned_to and audit persist. Clinician cannot assign owners. Claim/Escalate buttons do not exist. | PASS |
| 7 packet and Studio | clinician after role switch | New packet assembled/approved; JSON returns 200. All four Studio draft kinds render. New referral approved with a 64-character canonical hash; Markdown/JSON/ABDM/mCODE return 200. | PASS |
| 8 continuity/caregiver/audio | clinician, then coordinator | Draft reminder approved and explicitly delivered through simulated adapter; new outbox receipts persist. 11 locale options, scoped no-store TTS 503, labelled silent fixture, attendance cannot_attend, and caregiver is_active=false/sync_reminders=false/revoked_at persist. | PASS for operational workflow; spoken regional audio NOT VERIFIED / unavailable locally. |
| 9 boundary refusal/reference | coordinator | Synthetic institutional SOP produces reference disclaimer and G citation. Patient-specific chemotherapy query receives deterministic refusal. No NCG corpus is claimed. | PASS |
| 10 audit | auditor.k@rci.demo / auditor; clinician denial | Ledger linkage badge data-ok=true; Studio, caregiver, attendance and offered-slot events present. Clinician HTTP audit access returns 403. | PASS |

The successful initial run completed the automated interaction sequence in **4.81 seconds** in the final repeat (5.4 seconds including the second security test). This excludes narration, reading source documents, human verification, and Q&A. It is **not** proof that a clinician-reviewed presentation fits 7–10 minutes. The narrated target needs a rehearsal; presentation allocation now permits up to ten demo minutes separately from slides/Q&A.

The second browser test withdraws actual backing documents **after approval**. All four Studio formats and three packet formats return 409, evidence returns 404, and TTS returns 409 without fallbackText. Denials persist in audit. Unauthenticated TTS returns 401, mismatched/cross-tenant patient context 404, unsupported locale 400. Source flags are restored in a finally block only in the isolated synthetic test database. Database regressions separately exercise withdrawal before approval, RLS-hidden facts, immutable snapshot references and HIP transfer refusal.

## Runtime and voice truth

Use local PostgreSQL/storage, `OCR_DRIVER=local-pdf`, `EXTRACTION_DRIVER=rule`, `LLM_PROVIDER=rule`, `ABDM_DRIVER=simulated`, and empty cloud keys. For the optional encrypted ABDM simulator journey on port 3001, set `ABDM_CALLBACK_BASE_URL=http://localhost:3001`; a stale port 3000 callback causes a real failed simulation. It is not a hospital connection. Local parsing handles text PDFs/structured input; raster OCR requires a provider or transcription.

Chromium reported `speechSynthesis` available but `getVoices()` returned **[]**. No matching installed local Tamil/other voice or actual spoken reminder was verified. The WAV fixture contains only a silent header; it demonstrates the audio control, not speech or a tone. UI now labels this explicitly. Changing voice locale does not translate message text. Sarvam synthesis remains externally unverified.

## Failures found during execution

- Real P1: lab and medication source links routed to the source inventory with an ignored `doc` query. Corrected to document/fact/page routes; geometry now inspected.
- Test harness: immediate DOM-count checks skipped batch/reconciliation before navigation completed; fast packet assemble/approve and delivery assertions raced persisted state. The independent journey now awaits actual transitions and SQL state.
- Runbook: incorrect staff credentials, nonexistent claim/escalate controls, false scores/slot counts/caregiver names/source quotes, and omitted role switches corrected.
- Historical tests: unverified-patient draft citation expectation, fixed Day 0 assumption, outdated heading, generic reconciliation-text selector, and hardcoded member count corrected to verified fixtures/actual source membership. These are test-contract corrections, not relaxation of the approval policy.
- Audit redaction/source cleanup retry regression and unfinished patient/packet guards were caught in full verification and repaired before final acceptance.

## Repeat and recover

Default `pnpm demo:prepare` is read-only, does not migrate/seed, and was executed against the original database without changing inventory or hash chains. Reset only an explicitly designated isolated synthetic database:

```sh
NODE_ENV=development ONCOBRIEF_DEMO_MODE=true \
DEMO_DATABASE_NAME=oncobrief_codex_review \
DATABASE_URL=postgres://oncobrief_app:oncobrief_app@localhost:5432/oncobrief_codex_review \
DATABASE_MIGRATOR_URL=postgres://postgres:postgres@localhost:5432/oncobrief_codex_review \
STORAGE_FS_ROOT=/tmp/oncobrief-codex-review/storage \
pnpm demo:prepare --reseed
```

These example passwords are isolated local-development credentials only. Reset requires already-applied migrations and refuses production NODE_ENV, remote URLs, mismatched targets, or mixed non-synthetic organization/user/membership/patient identities. The guard and truncation share a transaction and locks. Real PostgreSQL mixed-identity refusal preserved all rows.

Reset between rehearsal runs, **never between scenes**. It invalidates sessions/IDs; sign in again. Wait for each confirmation before the next action. Release an offer before walk-in registration. Keep clinician, coordinator and auditor credentials ready. Rebuild before starting the production server, then restart after every rebuild to avoid stale Next artifacts. Regenerate legacy Studio drafts whose citation ordering/content fails current gates. Do not patch clinical facts or source dates to force a demo.

## Readiness conclusion

The supported synthetic operational journey is demo-ready with the corrected script and explicit degraded audio disclosure. The original promise of spoken multilingual continuity and a human-reviewed 7–10 minute run is not established. No external integration acceptance, hospital impact, authorized shadow pilot, accessibility certification, or production readiness is inferred from this demonstration.
