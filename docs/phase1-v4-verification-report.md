# OncoBrief V4 Phase 1 — implementation and verification

Date: 2026-10-23. Scope: root enhancement plan, section 7, tasks 1.1–1.4 only.

## Completion status

Phase 1 is implemented and locally verified: unit/integration checks, production
builds, targeted browser acceptance and code review are complete. No known
unaddressed Phase 1 code blocker remains; live external OCR acceptance is unverified.
No Phase 2 UI or services were introduced. Existing uncommitted work was retained;
no commit, push, deployment, or production database operation was performed.

## Implemented features and architecture

- Additive `0011_v4_oncology_enhancement.sql`: patient consultation/language fields;
  caregiver, OPD slot/waitlist, guideline document/span and studio storage.
  Forced RLS, tenant/patient-qualified foreign keys, membership references,
  source geometry/hash constraints, immutable guidelines and approved artifacts.
  CLI and bundled worker migration paths agree; demo truncation includes new tables.
- Source-dated lab/medication/vital comparisons, including adjacent dates, dose
  discrepancies, ambiguous dates and legacy slot compatibility. Conflict membership
  includes only connected disagreement/unknown comparisons. Historical records and
  previously recorded conflicts are not rewritten or silently resolved.
- Pure interval review, lab flowsheet and medication-history domain functions,
  exported with typed source-linked inputs. A read-only database service supplies
  current facts, states, ledger changes, document additions and conflict events.
  Recorded consultation dates take precedence over approved-packet baselines.
  Late-arriving older documents and later ledger changes remain visible.
- Explicit pending-investigation, instruction and vital-sign vocabularies, with
  packet mapping and deterministic extraction. Exact source quotes and page links
  remain intact. Negation does not generate pending work. Scheduled procedures are
  not treated as completed events; identical dated mentions are deduplicated.
  Stated doses and full blood-pressure ratios remain in their supporting quotes.
- Shared configured OCR routing, optional document-level OCR, real page-preserving
  PDF batches and page counts, Sarvam job lifecycle/language, and existing Textract
  synchronous/async capabilities. Local PDF text extraction now handles line
  leading/movement. Empty/scanned or partially failed sources do not masquerade as
  successful extraction. Provider failures are explicit and safely audited.
- One new runtime dependency: `pdf-lib` 1.17.1, for deterministic PDF page copying
  and parsing. No new infrastructure, clinical agent, or independent record store.

## Changed files

Files changed by this phase, excluding unrelated pre-existing working-tree work:

| Area | Files |
| --- | --- |
| Domain | `packages/domain/src/vocab/{fact-types,fact-value,observation-date}.ts`; `src/conflict/{comparators,detector}.ts`; `src/journey/longitudinal-review.ts`; `src/packet/assemble.ts`; `src/index.ts` |
| Extraction/OCR | `packages/adapters/src/{rule-based-extractor,ocr-routing,sarvam-vision-ocr,textract-ocr,local-multimodal-ocr,fixture-ocr,index}.ts`; adapter package manifest; `pnpm-lock.yaml` |
| Ports | `packages/ports/src/index.ts` |
| Database | migration `0011_v4_oncology_enhancement.sql`; `packages/db/src/{container,index,seed}.ts`; services `{documents,ledger,longitudinal-review}.ts` |
| Web | OCR/extractor wiring in `apps/web/src/lib/actions.ts` only |
| Worker | `apps/worker/src/{bundled-migrations,ports,index}.ts`; handlers `{document-ingest,ocr-result}.ts` |
| Configuration/docs | OCR settings in `.env.example`; ADRs 0019–0021 and decision index; execution checklist; this report |

## Tests added and actual results

Baseline `pnpm test`: **582 passed, 0 failed**.
Final `pnpm verify`: **677 passed, 0 failed**, including typecheck, ESLint,
clinical-boundary scan and branding scan. Net addition: **95 tests**.

| Suite | Final passed | Failed |
| --- | ---: | ---: |
| Domain | 355 | 0 |
| Adapters | 86 | 0 |
| PostgreSQL integration and DB configuration | 83 | 0 |
| Worker | 28 | 0 |
| Web | 125 | 0 |
| Total | 677 | 0 |

New test files:

- `packages/domain/test/longitudinal-conflicts.test.ts`
- `packages/domain/test/longitudinal-review.test.ts`
- `packages/adapters/test/oncology-instructions.test.ts`
- `packages/adapters/test/ocr-correctness.test.ts`
- `packages/db/test/v4-foundation.test.ts`
- `packages/db/test/longitudinal-review.test.ts`
- `packages/db/test/ocr-ingestion.test.ts`
- `packages/db/test/ocr-routing.test.ts`

Worker ingestion/result regressions were added to existing test files. The old
Sarvam synthetic-page/fake-transcode expectation was replaced by real PDF
content-preservation tests and explicit unsupported-image behavior; existing demo
browser assertions were not weakened.

RED/GREEN runs covered missing schema, coordinator approval rejection, date-aware
conflict membership, missing review domain/service, instruction extraction,
page-local source dates, OCR failures/routing, mixed scans, PDF line movement,
duplicate/scheduled procedure regressions, blood-pressure ratios and absent units.

Additional checks:

- Fresh PostgreSQL migration from zero: passed (temporary local verification
  database removed); forward migration applied to local synthetic demo database.
- `pnpm --filter @oncobrief/web build`: passed.
- `pnpm worker:build`: passed, including bundled migration 0011.
- Prettier check on new TypeScript modules/tests and rewritten OCR modules: passed.
- Targeted Chromium browser results: **9 passed, 0 failed** (eight critical demo
  scenarios plus the real PDF upload/source-inspector regression). Acceptance
  used the production build at localhost:3001 with `OCR_DRIVER=local-pdf`.

## Security, clinical boundary and review

Existing ledger, audit-chain, source immutability, authorization, tenant isolation,
packet approval and consent-withdrawal regressions pass. New schema tests reject
cross-tenant rows, forged same-tenant references to another tenant/patient, missing
tenant context, invalid geometry, unapproved actors and changes to frozen content.
The journey service uses parameterized SQL under caller RLS, including existing
withdrawn-source policies; it creates no public endpoint or privileged bypass.

No clinical interpretation is introduced. Arithmetic requires explicit identical
units, distinct valid dates and unambiguous source points; conflicting, replaced,
rejected, superseded and nonnumeric/ratio values cannot drive numeric deltas.
Unknown dates remain unknown. Medication history does not label a regimen active,
stopped, appropriate or recommended. Extracted facts remain unverified. No pending
item automatically becomes a task, investigation order or patient message.

Independent code review identified blood-pressure truncation and absent-unit
arithmetic; both were reproduced with failing tests and fixed. Self-review also
found mixed scanned-page completeness and object-storage credentials accidentally
configuring Textract; both have passing regressions.

## Limitations, failures and deviations

- Live external OCR is **not acceptance-verified**. An initial browser upload under
  the machine's auto-provider configuration did not become ready; the failure was
  visible rather than fabricated. Deterministic upload acceptance uses explicit
  `OCR_DRIVER=local-pdf`. Mock provider transport tests verify real source bytes,
  documented requests, batching, page offsets, language, spans, and failures.
- Raster OCR requires a capable configured provider. Local images/image-only PDF
  pages require transcription. Sarvam TIFF/WebP is explicitly unsupported until a
  real codec is supplied; no byte-signature substitution remains.
- Migration is 0011 instead of proposed 0009 because existing ABDM migrations own
  0009/0010. Stricter tenant relationships/source geometry and frozen-artifact
  safeguards supplement the sample SQL.
- Distinct calendar dates are longitudinal, resolving the plan's contradictory
  one-day-tolerance wording. Old ledger slot keys/conflicts remain auditable.
- A first browser demo run exposed an extra procedure conflict; duplicate and
  future-cycle extraction was corrected, then all eight demo scenarios passed.
  A later upload test overlapped a local build and hit a stale build artifact;
  the final acceptance run uses a restarted server after the build.
- The full historical browser suite and real cloud deployment were not claimed
  as verified. The relevant critical demo/upload scenarios are tested separately.
- Schema storage does not establish consent validity, clinical authority,
  de-identification, narrative entailment or future service authorization/audit.
  Those later workflows remain governed by ADR0020 and existing security docs.

## Phase 2 prerequisites

Wire the existing read-only review into the Evidence Journey views; add the
specified oncology-only fixtures/checklists and explicit consultation baselines;
implement atomic human-confirmed batch verification with per-fact ledger/audit
entries. Preserve approved packet snapshots and source/consent access. Use the
foundation migration rather than adding duplicate tables. Validate deployed OCR
credentials, institution-approved endpoints and source documents before claiming
live provider acceptance. Phase 2 has not started.

Rationale and provider references: ADR0019, ADR0020, ADR0021. Execution checklist:
`docs/superpowers/plans/2026-10-23-v4-phase1.md`.
