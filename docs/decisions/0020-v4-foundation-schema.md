# 0020 — Additive oncology workflow foundation with tenant-bound references

**Status:** Accepted  
**Date:** 2026-10-23

## Context

Phase 1 of `ONCOBRIEF_ENHANCEMENT_PLAN.md` requires patient consultation baselines,
consented caregivers, OPD slots/waitlists, versioned reference sources and clinician
studio drafts. Its proposed migration number 0009 is already occupied by ABDM;
0010 protects access to sources withdrawn by consent. Neither migration can be
replaced. The proposed UUID-only foreign keys also permit a tenant-owned row to
reference a different tenant's patient, and default guideline bounding boxes would
invent provenance.

## Decision

Add `0011_v4_oncology_enhancement.sql`; leave all earlier migrations and ledger
policies intact. Register the same migration in the CLI-discovered and worker
bundled paths and include its six tables in the synthetic demo reset.

- Add nullable `last_consultation_date` and default `primary_language = 'en-IN'`.
- Create the six planned foundation tables, with forced RLS, explicit tenant
  `USING`/`WITH CHECK` and least-privilege grants. Composite references bind patients,
  sources and staff memberships to the row's organization. OPD priority source
  references must also belong to the appointment/waitlist patient.
- Require explicit source geometry, bounded within the page; require 32-byte
  SHA-256 digests and increasing slot start/end times. No source coordinates are
  synthesized by the schema.
- Keep reference documents and spans append-only, including a mutation trigger
  for privileged accidental writes. New source versions require new rows.
- Keep the plan's studio citation arrays but validate every element against this
  patient's currently accessible facts and tenant's reference documents. Approval
  requires a clinician membership and a complete hash/approver/time record.
  Approved studio rows cannot be modified or returned to draft; a successor draft
  must be created. API/service authorization and audit remain required for future
  studio mutations.

This migration provisions storage only. It does not publish guidelines, create
caregivers, verify evidence, assign OPD priority, backfill slots, approve studio
content or send messages automatically.

## Alternatives considered

Reusing 0009 would break migration history and ABDM. UUID-only references plus
application filters cannot enforce cross-tenant referential integrity. Default
bounding boxes imply evidence that has not been extracted. Mutable approved
studio content undermines the meaning of sign-off. A separate scheduling or
knowledge infrastructure is unnecessary for this foundation.

## Consequences and security assumptions

Real PostgreSQL integration tests exercise tenant isolation, absent tenant context,
reference integrity, source immutability, clinician approval and approved-draft
freezing; legacy ledger and text-span protections remain covered. Synthetic reset
uses the migrator/admin boundary and may truncate these rows deliberately.

The schema does not establish caregiver identity/consent validity, validate guideline
clinical authority, prove studio text is entailed by citation arrays, calculate
snapshot digests, or redact/de-identify studio prose. Those are later governed
service workflows with human approval, source validation and audited changes.
Guideline publication/retirement and approved studio withdrawal are deliberately
not exposed by Phase 1. Real patient deployment retains the documented storage,
retention and external-consent prerequisites in `docs/security.md` and ADR 0018.
