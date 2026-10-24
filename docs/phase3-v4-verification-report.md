# OncoBrief V4 Phase 3 — implementation and verification

Verification date: **2026-10-24 (Asia/Kolkata)**. Work began 2026-10-23.
Scope: enhancement-plan tasks **3.1, 3.2 and 3.3 only**.

## 1. Completion status

Phase 3 is implemented and locally verified with real PostgreSQL transactions and
production-build browser acceptance. No known unresolved critical defect remains
in the supported Phase 3 service/action paths. This is synthetic prototype
verification, not a live hospital pilot or external scheduling certification.

The original uncommitted Phase 1/2 work was preserved. No commit, push, deployment,
production database operation, real patient message or Phase 4/5 implementation was
performed. The root enhancement plan was not changed.

## 2. Implemented functionality

- Explicit appointment state transitions for scheduled, checked-in, consultation,
  investigation delay, completed, cancelled, no-show, walk-in and vacant states.
  Invalid transitions, stale expected states and occupied states without a patient
  are rejected. Operational holds/releases require a staff reason. Cancellation
  preserves the appointment until staff explicitly release the slot. Prior patient,
  actor, reason and state remain in append-only history. Cancelling a registered
  waitlisted walk-in also closes its waitlist entry instead of leaving it slotted.
- Deterministic current-readiness candidate discovery over persisted waitlist and
  clinic capacity. Eligibility requires a configured matching clinic, reached
  requested date, existing checklist, ready band, valid source access, no overlapping
  booking and no active duplicate offer. Unsupported priority labels fall back to
  routine order. Explicit expedited administrative requests may sort first only
  with authenticated, immutable priority-selection provenance; then requested date,
  creation time and entry ID supply stable ordering. No medical score is produced.
- Staff review/confirmation creates a reserved **offer**, not acceptance or an
  appointment. Existing `offered`/`offered_slot_id` states are reused. Offers do not
  set the slot patient, send a message or count as successful assignment. Staff can
  explicitly release an offer. Ready waitlisted arrivals can be confirmed as
  walk-ins into existing vacant capacity; the server rechecks all eligibility.
- Persisted OPD board with date selection, status filters, times/tokens, room,
  timezone, arrival, patient links, readiness reasons, priority provenance, reserved
  offers and real actions. The original readiness worklist remains the default.
  Drawer handles empty candidates, failed/stale transactions and success feedback.
  Confirmation controls, Radix keyboard/focus behavior and a focusable horizontally
  scrolling table support desktop and narrow screens.
- Care-team assignment to active permitted organization members, current owner,
  role, due date, status, patient context, source document/quote and last update.
  Compare-and-set rejects a stale owner; row locks serialize concurrent changes.
  Assignment/reassignment is audited; completed tasks are not silently reassigned.
- Exact verified administrative instructions can become source-backed tasks only
  after human confirmation. Repeated/concurrent promotion is deduplicated. Quotes
  are read through current source access rather than copied into task details.
  Generic task creation also validates tenant/patient source ownership.
- Only authorized checklist authors can waive an actionable **expected**
  administrative requirement, with a reason and readiness recomputation. Required
  documents and unresolved source contradictions cannot be waived through this UI.
  Evidence remains unchanged; audit stores only that a reason was recorded.

## 3. Database/domain changes and reused foundations

`0012_opd_transaction_safety.sql` extends existing 0011 slots/waitlists with clinic
key/timezone and accountable priority selection, unique active-offer constraints,
append-only tenant-scoped `opd_slot_event`, idempotency and overlap guards.
Readiness-input triggers share the patient lock used by final eligibility checks.
`0013_opd_reservation_overlap.sql` adds comparison of actual instants across clinic
zones/date boundaries and protects offers from later incompatible bookings.
It follows locally applied 0012 without rewriting migration history. Both are
registered in the CLI and bundled worker migration paths. No table was recreated,
no destructive backfill was performed and no dependency/infrastructure was added.

Concurrency uses the existing tenant transaction, an organization-scoped advisory
lock, slot/waitlist/patient row locks, unique active-offer indexes and immutable
request IDs bound to actor/payload. Final selection recomputes the existing
readiness policy; the browser's previous candidate list is never authoritative.
Database failures roll back the reservation, history, readiness writes and audit.

Reused Phase 1/2 foundations: 0011 capacity/waitlist schema, typed RBAC, forced RLS,
Evidence Ledger and accessible source joins, deterministic readiness/checklists,
hash-chained audit, task/task-event storage, session-scoped transactions, Phase 2
oncology fixtures and longitudinal/batch/import experiences. DEMO-003's follow-up
checklist exposed missing laboratory/prescription documents despite an older ready
snapshot. Two explicitly synthetic administrative receipt sources were added;
they represent no laboratory values, medication or dose. The existing seed verifies
its source facts. Fixture slots use clinic-local dates, explicit clinic identity,
real checked-in timestamps and routine labels where priority provenance was absent.

## 4. Files added or modified for this phase

| Area | Phase 3 files |
| --- | --- |
| Domain | `packages/domain/src/flow/slot-optimizer.ts`; `test/slot-optimizer.test.ts`; `src/policy/rbac.ts`; `test/rbac.test.ts`; `src/index.ts` |
| Database | migrations `0012_opd_transaction_safety.sql`, `0013_opd_reservation_overlap.sql`; `src/services/opd-flow.ts`, `tasks.ts`, `twin.ts`, `audit.ts`; `src/{seed,fixtures,index}.ts`; `test/opd-flow.test.ts`, `task-ownership.test.ts`, `oncology-fixtures.test.ts`, `v4-foundation.test.ts` |
| Web | `src/app/(app)/workspace/page.tsx`; patient `tasks/page.tsx`, `record-map/page.tsx`; `src/components/OpdWorkspace.tsx`, `TaskOwnershipControls.tsx`; `src/lib/opd-actions.ts`, `opd-actions.test.ts`, `opd-presentation.ts`, `opd-presentation.test.ts`, `task-ownership-actions.ts`; `e2e/phase3-opd.spec.ts`, `phase3-ownership.spec.ts` |
| Worker | `apps/worker/src/bundled-migrations.ts` |
| Documentation | ADR0023 and decision index; Phase 3 execution checklist; this report |

This inventory excludes the substantial pre-existing Phase 1/2 working-tree diff.
The foundation test's inserted appointment now uses a separate synthetic date so
its positive schema test does not intentionally double-book a seeded patient.
No assertion was removed or weakened.

## 5. Automated verification and actual counts

Initial `pnpm verify`: **698 passed, 0 failed**. This differs from the historical
Phase 2 report's 694 because the actual current DB baseline contained 99 tests.
Final `pnpm verify`: **777 passed, 0 failed, 0 skipped**; **79 net new tests**.
Typecheck, ESLint, clinical-boundary and branding checks passed.

| Suite | Baseline | Final passed | Failed |
| --- | ---: | ---: | ---: |
| Domain | 360 | 392 | 0 |
| Adapters | 86 | 86 | 0 |
| PostgreSQL / DB | 99 | 136 | 0 |
| Worker | 28 | 28 | 0 |
| Web | 125 | 135 | 0 |
| Total | 698 | 777 | 0 |

New domain tests: 27 optimizer/state/timezone/metric scenarios plus five RBAC cells.
New DB tests: 22 OPD scenarios and 15 ownership/source/waiver scenarios. New web
tests: six action-validation and four presentation scenarios. Existing fixture
assertions were strengthened for arrival timestamp consistency.

Observed RED → GREEN cycles covered missing domain/service behavior, illegal
occupied transitions, cross-zone overlaps, protecting offered reservations, missing
waiver persistence, forged task origins, cancelled walk-in waitlist consistency,
and preservation of human-selected priority provenance in the queue.

Additional verification:

- `pnpm --filter @oncobrief/web build`: passed, optimized Next.js production build,
  TypeScript validation and route generation. `/workspace`: 7.1 kB / 124 kB first load.
- `pnpm worker:build`: passed, including bundled migrations 0012/0013.
- Fresh local temporary database: **all 13 migrations applied from zero**, forced
  RLS confirmed on slot/waitlist/history; temporary database removed afterwards.
- Forward migration and repeated local synthetic `pnpm demo:reset`: passed.
- Existing DB, worker, ledger, consent, batch-verification and source tests pass as
  part of `pnpm verify`; no external/cloud worker invocation is claimed.

## 6. Production browser acceptance

Chromium, production server, real session/server actions and PostgreSQL, one worker,
explicit `OCR_DRIVER=local-pdf`; isolated future-dated synthetic clinic slots.
No mocked mutation responses or fabricated success states.

| Acceptance | Persisted evidence | Result |
| --- | --- | --- |
| A/B queue and check-in | Time/token, slot state, slot event, audit event | Passed |
| C cancel and release | Cancelled history retained, explicit release, patient cleared | Passed |
| D/E eligible candidates and confirmed offer | Exactly ready candidate; waitlist offered; slot patient remains null | Passed |
| F stale candidate | Second browser reserves first; stale confirmation rejected; one active offer | Passed |
| G walk-in | Existing vacant slot occupied; waitlist slotted | Passed |
| Empty waitlist | Explicit empty state, no invented candidates or capacity | Passed |
| H ownership | Permitted coordinator, deadline, stored owner and audit | Passed |
| I instruction / waiver | Exact verified source task, reason, staff identity, gap and audit | Passed |

Phase 3: **8 tests passed, 0 failed** (final production run: 5.2 seconds).
Phase 2/demo regression J: **11 passed, 0 failed** (5.6 seconds), including source
navigation, reconciliation, batch verification, consultation readiness, ABDM/mCODE
bundle intake, packet/message approvals and audit-chain UI. Each mutation suite
started after a local synthetic reset so earlier tests did not make it vacuous.

Desktop, mobile and candidate-drawer screenshots were visually inspected. Evidence:
`apps/web/audit/screenshots/phase3-{opd-board,backfill-review,opd-desktop,opd-mobile}.png`.
Screenshots supplement persisted assertions; they are not the completion criterion.

## 7. Concurrency, integrity and security evidence

Real independent database transactions test:

- Two staff offers for one vacancy: exactly one succeeds, one history event.
- Same patient offered different slots concurrently: exactly one active offer.
- Concurrent identical request: one event; replay succeeds; changed payload rejected.
- Offer/release race: consistent waiting/offered state and matching active count.
- Stale readiness: a newly recorded conflict blocks final offer despite earlier list.
- Rollback injected after reservation update: no persisted offer or history event.
- Incompatible room, clinician, patient and cross-zone overlapping reservations.
- A subsequent booking cannot consume an offered patient's overlapping capacity.
- Withdrawn source access rejects candidate; forged priority source is rejected;
  fabricated human-selection fields without matching audit cannot raise priority.
- Auditor, forged actor and cross-tenant attempts rejected; no cross-tenant event.
- Real foreign-organization assignee rejected; concurrent reassignment uses expected
  owner; repeated source promotion is deduplicated. Revoked instruction quotes stay
  hidden. Waiver enforces role, reason and readiness recomputation.
- Walk-in produces no patient-message row. Existing ledger/source immutability,
  authorization, tenant/consent regressions and audit hashing remain passing.

Independent review found source-origin forgery, promoted quote retention, misleading
metric copy, missing occupied-patient validation and inadequate initial performance
coverage. All supported-path findings were fixed and regression tested. A follow-up
review found no unresolved critical defect in supported service/action paths.
Operational audit metadata contains identifiers/states, not patient/source text or
free-text reasons. Protected operational history retains the staff reason.

## 8. Telemetry and performance

All values come from SQL over stored records. ADR0023 defines exact scopes and
counting rules: clinic-day ready/occupied slots; occupied capacity utilization;
organization-wide promoted/completed-candidate gate rate and outstanding tasks;
source conflicts detected before recorded consultation start; confirmed walk-in
backfills. Pending validation is excluded from the gate denominator. Empty rate
denominators are unavailable, not zero. Offers are not counted as assignments.
Synthetic badges/copy distinguish demo measurements from hospital impact.

The real candidate-discovery test measures an eligible ready patient, including
transactional readiness recomputation, rather than timing workspace rendering.
Repeated local runs measured **9.27 ms for one eligible candidate in the final full-suite run** (roughly 9–11 ms across repeated runs);
the test asserts under 5,000 ms. Occupied-slot fast-path timing is logged separately
and is not used as recommendation evidence. This small synthetic dataset does not
prove the pilot target under hospital load; no percentile, throughput, capacity gain
or clinical outcome is claimed.

## 9. Limitations, deviations and unverified behavior

- Offer-only workflow deliberately does not implement patient acceptance, automatic
  expiry, external calendar integration or messaging. Staff can release offers;
  ready arrivals can register as walk-ins. Unaccepted offers reserve capacity until
  explicit release. Walk-ins require an existing ready waitlist entry.
- Institution-managed capacity/clinic configuration and priority selection services
  exist; no arbitrary slot creation/rescheduling or service-line catalog UI was
  invented. Legacy null clinic keys fail closed for candidate discovery. Operators
  must release reservations before changing capacity through trusted database/import
  operations; raw SQL rescheduling is outside the tested action paths.
- Required checklist requirements cannot be waived. The safer existing expected-item
  boundary was retained. Source contradictions remain human reconciliation work.
- There is no independently stored span-only validation-attempt denominator. The UI
  accurately labels the available measurement as **promotion gate pass rate**.
- Workspace readiness is the latest persisted snapshot; final recommendations and
  reservations recompute current readiness. Other writes may create new readiness
  changes after assignment; this is never medical clearance or a permanent guarantee.
- Per-organization serialization favors correctness; large-clinic load, soak testing,
  retry policy and a representative pilot latency distribution remain unverified.
  A PostgreSQL deadlock/transaction abort is surfaced as failure with refresh/review.
- No new packages or infrastructure. No external OCR provider, ABDM certification,
  production database, real patient or cloud deployment acceptance is claimed.
- Historical reports/root plan are preserved. Pre-existing whole-tree whitespace
  warnings from `.env.example`, `documents.ts`, `patients.ts` and `ports/index.ts`
  were left intact rather than rewriting unrelated changes.

## 10. Phase 4 prerequisites

Phase 4 has not started. Before a separate authorization to implement it, retain
current RLS/consent and non-clinical boundaries, version-approved guideline sources,
human artifact approval and citation validation, and the working Phase 1–3
regressions. Capacity/offer operations require no Phase 4 assistant or clinical
prioritization behavior. See ADR0023 and the Phase 3 checklist for this phase's
architecture and verification evidence.
