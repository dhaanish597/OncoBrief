# OncoBrief V4 — Codex independent review

Date: 24 October 2026 (Asia/Kolkata). Scope: independent review and necessary P0/P1 repairs; no new implementation phase, commits, deployment, production mutation, or real-patient communication.

## Verdict

Gemini's audit was directionally useful but materially inaccurate. Its assertion that all six repairs were verified and the release was green did not reproduce. Initial `pnpm verify` stopped at TypeScript errors in Studio export, Studio actions, and caregiver tests. Source probes and PostgreSQL regressions found remaining authorization, source-integrity, content-grounding, and reset-safety defects. The report's aggregate database counts matched, but its migration count, document distribution, readiness states, fixture identities, OPD algorithm, credentials, and offline claims did not.

The corrected supported synthetic workflow is locally verified. This is not authorization for a real-data shadow pilot, production deployment, clinical use, or external certification. See [final test report](v4-final-test-report.md) and [demo validation](v4-final-demo-validation.md).

## Six claimed fixes, independently classified

The classification below describes the supplied work **before this review's repairs**. “After repair” is limited to the executed local paths and tests.

| Gemini defect | Initial classification | Evidence and repair | After repair |
|---|---|---|---|
| DEF-P0-1 source withdrawal/export/hash | PARTIALLY FIXED; export regression introduced | Studio service returned `void`, route dereferenced `.accessible`, breaking build/export. Empty citation sets exported the entire verified timeline. De-identified FHIR retained patient/source identifiers. HIP transfer bypassed packet source validation; frozen packet/Studio pages still exposed withdrawn content. Guards now count inaccessible IDs, use frozen packet references rather than mutable draft rows, mask reads, restrict FHIR to exact cited IDs, check canonical digest and content at export, and block de-identified FHIR. | VERIFIED FIXED for supported local paths; de-identified FHIR deliberately unavailable. |
| DEF-P0-2 Studio grounding | PARTIALLY FIXED | Valid citation IDs permitted `Start chemotherapy tomorrow`, uncited diagnosis additions, `110.8 mg/dL` for `10.8 g/dL`, and an altered number retained alongside the original. Submitted patient IDs/current timeline indices could change citation meaning. Persisted source bindings, exact source/template clauses, title validation, full citation-set checks, approval row locking, and export revalidation now reject these cases. | VERIFIED FIXED under deterministic exact-clause policy, not arbitrary semantic entailment. |
| DEF-P0-3 TTS | PARTIALLY FIXED | Authentication/locale checks existed but arbitrary client text was sent without patient/message/source context. Routes now resolve a saved message or the current user's saved assistant answer, check tenant/patient/source access, validate input, omit denied fallback text, and set no-store headers. | VERIFIED FIXED for local authorization/input/privacy tests; Sarvam speech itself externally unverified. |
| DEF-P0-4 caregiver/redaction | PARTIALLY FIXED | Active/revoked caregiver filter existed. Nested audit arrays leaked sensitive objects; unchecked Sync reminders could not save false. Source-bound reminder variables accepted altered text or another patient's fact. Dispatch now revalidates authoritative same-patient text and consent, locks message/caregiver rows, and uses recursive redaction. Worker raw error sinks hardened. | VERIFIED FIXED in synchronous simulated dispatch; future external queue must recheck consent at actual send time. |
| DEF-P1-1 audit coverage | PARTIALLY FIXED | Studio/caregiver/current OPD/waitlist rows were included, but clearing a slot's patient erased that patient's OPD audit association. Duplicate UNIONs were harmless. Historical slot events and immutable ledger references now preserve association. | VERIFIED FIXED for the specified V4 entities and role/tenant tests. |
| DEF-P1-2 demo reliability | PARTIALLY FIXED | Correct batch test IDs and synthetic bundle badge existed, but test conditional could skip verification; demo:prepare ran migrations and could silently truncate/reseed. Reset entry points had no central production/mixed-data guard. Now default preparation uses BEGIN READ ONLY; explicit reset checks environment, same local database targets, and synthetic identities under a transaction/table locks. Browser fixtures/selectors and source links corrected. | VERIFIED FIXED for the tested fixture workflow and safety guards. |

## Additional defects and exact code pointers

- **P0 — Alternate source export and frozen read leakage:** `packages/db/src/services/abdm-hip.ts` (`linkApprovedPacketCareContext`, `processHealthInfoRequest`); `services/packets.ts` (`getPacket`, `assertPacketSourcesAccessible`); `services/studio.ts` (`getStudioArtifact`, `listStudioArtifacts`). Real PostgreSQL RED: HIP returned `{ transferred: true, entriesCount: 1 }` after withdrawal and `getPacket` returned the full frozen body. GREEN: `packet-withdrawal-review.test.ts` plus real HTTP format tests.
- **P0 — Citation reinterpretation, title/content fabrication, and de-identified raw export:** `apps/web/src/lib/studio-validation.ts:5`, `actions.ts:973`, `api/v1/studio/[artifactId]/export/route.ts:25`, `packages/domain/src/studio/draft-generator.ts`. RED/GREEN tests: `studio-actions-security.test.ts`, `studio-export-security.test.ts`, `studio-safety-audit.test.ts`, and `studio-source-guard-unit.test.ts`. Exact sources may be rearranged; unsupported paraphrases/custom factual titles are rejected. A changed source set requires a successor draft. Historical unsafe approvals are checked again on export.
- **P0 — Reminder source and patient/packet forgery:** `packages/db/src/services/messages.ts:64`, `:172`, `:256`. RED: invented therapy rendered as an appointment, a tampered body could be approved, literal-only cross-tenant messages were accepted. GREEN: `continuity-grounding.test.ts` checks canonical source values, same-patient references, wrong packets, approval and dispatch.
- **P0 — Destructive preparation/reset:** `packages/db/src/seed.ts:156`, `src/demo-readiness.ts:74`, `src/run-demo-reset.ts`, `tools/prepare-demo.ts`. Mocked production/remote/mismatched target tests and a real mixed-organization PostgreSQL test confirm refusal without truncation. No schema migration was changed.
- **P1 — Incorrect lab/medication source links:** `LongitudinalLabFlowsheet.tsx` and `MedicationHistoryView.tsx` now route to `/sources/[documentId]?fact=[factId]&page=[page]`. The ordered journey failed to find the inspector before repair and passed with actual geometry afterwards.
- **P1 — Historical patient audit association:** `packages/db/src/services/patients.ts:722`; `patient-audit-history-review.test.ts` observed RED then GREEN after explicit cancellation/release.
- **Repair regression caught and fixed:** redacting primitive audit arrays also destroyed source-cleanup retry keys. `abdm-hiu.ts` now journals failed opaque storage keys as named objects, with backward reading of existing entries; its real import/revocation/retry regression passes. Legacy already-redacted cleanup metadata cannot recover erased keys automatically.

## Database findings

Original local database: PostgreSQL 16.15 (Homebrew), loopback port 5432, database `oncobrief`; app login `oncobrief_app` is neither superuser nor BYPASSRLS. Exactly **15** migration files and applied IDs match `0001`–`0015`; the claimed `0009_multimodal_intake.sql` does not exist.

Original inventory was 4 marked synthetic patients across `rci`/`northgate`, 25 documents, 118 facts, 159 ledger entries, 147 audit entries. The document distribution was **11/5/9 for the primary patients and zero for northgate**, not 10/5/9 plus one other-tenant document. DEMO-001 contains a pre-existing `test.pdf`. All document/patient tenant references inspected matched. Flags and known fixtures are evidence of synthetic isolation, not forensic proof that any arbitrary text can never contain real information.

The supplied “1 conflict/gaps” descriptions were inaccurate: original DEMO-001 and DEMO-002 each had two open conflicts and blocked readiness; DEMO-003 was ready. Fresh fixture presentation likewise must use current displayed values. Local source truth is pathology **12 June 2025** versus discharge **3 July 2025**, not the report's invented operative/referral quotes.

Catalog inspection found 51 RLS-enabled tables and 42 forced-RLS tables. Several ABDM/auth bootstrap tables intentionally do not FORCE RLS; owner/migrator credentials are trusted. `withTenant` binds transaction-local settings through the restricted application connection; it does not issue SET LOCAL ROLE. The current permission model is tenant/role based; no separate patient-assignment/caseload ACL is claimed. Missing tenant context returned zero patients, each tenant saw only its own patients, and integration tests exercise denied cross-tenant writes and append-only triggers.

Independent read-only checks recomputed the original **ledger payload hashes and audit payload hashes** from genesis: all 159/147 passed. `verifyLedgerChain` and the audit-page badge themselves check ledger linkage/order only, not payload recomputation or audit hashes. Original inventory and both chains remained unchanged after preparation/review; all mutating test suites used `oncobrief_codex_review` and separate temporary storage.

## Claims and clinical-safety assessment

OPD uses `rankWaitlistForVacantSlot`: current administrative readiness/checklist, configured clinic/date, source access, overlap/active-offer gates; provenance-backed explicit administrative expedition, then stable requested/creation/ID order. There is no score, travel weighting, inferred urgency, treatment ranking, or `acceptSlotOffer`. Offers reserve without acceptance/messages; release before registering an arrived walk-in.

The seed has four slots, one waitlist entry, one invented institutional SOP with two spans, and caregivers Sunita Sharma/Kavita Menon. No genuine NCG guideline corpus, Tata Memorial/AIIMS hospital connection, institutional endorsement, or partnership was established. FHIR import/export is a locally exercised prototype with structural validation; full profile conformance remains unverified.

The current original environment had a configured Sarvam key; “keys absent/default offline” was false. Tests and the demo server explicitly used local parsing, rule generation, empty cloud keys, simulated ABDM and simulated delivery. Browser internet requests were blocked during the ordered journey. No OS-wide network isolation or provider acceptance is claimed. Headless Chromium exposed speechSynthesis but zero installed voices; the synthetic WAV is silent. Locale selection does not translate English or Hindi content. No successful spoken Tamil reminder or external telecom delivery is claimed.

No percentages, minutes saved, throughput improvement, patient outcome, competitor failure rate, regulatory certification, or hospital pilot authorization is established by these tests. Presentation materials now distinguish engineering evidence from hypotheses and state timing/voice limitations.

## Remaining issues and release levels

| Level | Assessment |
|---|---|
| Development complete | Scoped repair work complete; the broad enhancement plan is not fully delivered (extension, patient acceptance, live messaging and other integrations remain deferred). |
| Locally verified | Yes for the explicitly reported automated, SQL and browser scenarios. |
| Synthetic demo ready | Yes with explicit local configuration, fresh synthetic fixtures, required role switches, silent-audio disclosure, and the corrected runbook. |
| Authorized shadow-pilot ready | No institutional authorization or real-data operational readiness established. |
| Production ready | No. |

Remaining **P1 presentation constraint**: spoken multilingual playback unavailable in tested Chromium and narrated 7–10 minute timing unmeasured. Demonstrate the labelled fallback and disclose both constraints; do not claim the original unqualified demo promise. Remaining **P2/deployment work** includes real provider acceptance, profile conformance, representative load/soak tests, broader adversarial privacy review, institution-approved reference publication, immutable-history retention/erasure policy, backups/restore, off-box anchoring, external delivery retry/consent semantics, callback authentication review, and institutional security/legal approval. The privileged database can rewrite/rechain data; hash chains are tamper-evident within that trust boundary.

No broad subsystem or deferred browser extension was added. Existing uncommitted work was retained; changed code is restricted to the described P0/P1 paths and their regressions.
