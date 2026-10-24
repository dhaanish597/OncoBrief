# 0023 — Human-controlled oncology capacity, reservations and task ownership

Status: Accepted. Date: 2026-10-23.

## Context

Phase 3 reuses the Phase 1 `opd_appointment_slot` and `opd_waitlist_entry` tables.
Their foundation lacked clinic identity, timezone, offer reservation constraints,
transition history, idempotency and overlap prevention. Phase 2 seeded labels did
not establish priority provenance; a ready snapshot did not guarantee current
readiness. There is no configured service-line catalog.

## Decision

Use deterministic domain transitions and ranking, with server session/membership
validation and a new `opd:manage` permission for clinician, coordinator, records
officer and organization administrator. Auditors retain read-only access.

Add migration 0012, extending existing rows with nullable explicit clinic keys,
clinic timezone and accountable priority selection, plus append-only slot events.
An unconfigured legacy slot stays visible and cannot supply backfill candidates.
The synthetic seed explicitly configures one oncology OPD; room text and medical
facts never determine eligibility. No service-line selector is fabricated.
Migration 0013 adds reservation protection and comparison of real instants across
clinic timezones after failing concurrency/time-boundary regression tests; it
preserves the already locally applied 0012 migration history.

Every service mutation runs in the existing tenant transaction. A per-organization
transaction advisory lock serializes capacity/offer changes; row locks and unique
active-offer indexes prevent competing slot and patient reservations. Replays bind
request ID, actor and payload to one append-only event. Payload changes conflict.
A cancelled appointment is retained until staff explicitly release its capacity;
slot history keeps the previous patient and state. Delayed operational holds need
an explicit reason to release; they are never automatically backfilled.

An offer uses existing waitlist `offered` and `offered_slot_id`; the slot remains
vacant but reserved and the patient field is unset. This is not acceptance or a
scheduled appointment. Explicit release returns the offer to waiting. A separately
confirmed arrived walk-in consumes existing vacant capacity and changes its
waitlist entry to slotted. Neither operation sends a message. Patient acceptance,
expiry and external scheduling integrations are not fabricated.

Final selection recomputes the existing checklist/readiness policy under a patient
row lock, checks configured clinic, requested date, overlapping appointments,
active duplicate offers and source/consent access. Triggers on readiness inputs
share the patient lock so evidence, document consent flags, gaps and tasks cannot
commit a readiness change through final revalidation. Conflicting transactions
may be aborted by PostgreSQL; UI reports failure and requires refresh/review.
The application never converts administrative readiness into medical clearance.

Only explicitly expedited administrative requests receive ordering preference;
other documented labels do not establish clinical ordering. Unsupported labels
fall back to routine order. Explicit priority selection requires an authorized
session and matching immutable audit provenance. Source IDs are patient/tenant
bound and verified for access; text is never interpreted to derive a priority.
Stable ordering uses requested date, waitlist creation time, then entry ID; no
match, urgency, risk or medical score is emitted.

Tasks reuse existing source anchors, events and audit. Assignees must be active
permitted members; UI supplies the expected current owner to reject stale edits.
Task promotion requires an exact verified instruction, accessible source and human
confirmation; source/gap tasks are deduplicated under the patient lock. Quotes are
read from accessible evidence, not copied into task details. Waivers apply only to
expected administrative items, require authorized identity/reason and recompute
readiness. They never modify evidence or resolve source contradictions.

## Alternatives and consequences

A separate appointment/offer system duplicates 0011. Automatic assignment or
patient acceptance violates human control. Frontend-only eligibility and slot-only
locking allow stale and competing assignments. An invented severity score violates
the clinical boundary. Exclusion extensions or a scheduling service are unnecessary
for this prototype; guarded existing rows and transactional locks suffice.

Capacity is configured through existing institutional database/import operations;
Phase 3 exposes no arbitrary capacity creation UI. Database credentials remain a
trusted application boundary; end users use authenticated server actions. RLS is
forced on history as well as existing tenant tables. Audit contains IDs, states and
request identifiers, not source text or free-text operational reasons. Reasons
remain in protected operational history. Existing deployment/retention and live
external-provider limitations in security.md and earlier reports remain applicable.

## Measurement definitions

Clinic-day consultation-ready rate: latest stored ready snapshots among occupied
non-cancelled/non-no-show slots divided by those slots (completed included).
Utilization: those occupied slots / persisted capacity slots; offers excluded.
Promotion gate: promoted / completed promoted-or-rejected extraction candidates
organization-wide; it is not every span-validator invocation. Contradictions:
distinct source conflicts for clinic-day patients detected before their first
recorded consultation start, including resolved ones. Without a recorded start,
these are pre-consultation recorded conflicts, not proven clinical outcomes.
Successful backfills count confirmed walk-in assignment events on clinic-day slots;
unaccepted offers do not count. Outstanding tasks count open/assigned/in-progress/
blocked organization-wide. Zero denominators display unavailable. Synthetic records
are labeled, and local test latency is not a hospital pilot result.
