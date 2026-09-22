# 0012 — Browser extension limited to a launch-layer contract

**Status:** Accepted
**Date:** 2026-09-22

## Context

The platform design document §1 names three deployment patterns: SMART on
FHIR/API, secure document upload, and an approved browser extension. §2
describes an extension user journey with eight safeguards.

`CLAUDE.md` is strict about what an extension may do: respect hospital
permissions, require explicit user initiation, transmit only approved context,
use short-lived sessions, never silently scrape a chart, never bypass EHR
permissions, never write back to the EHR.

In a 2–4 week window there is no hospital EHR to test against, no vendor
approval process to pass, and no way to validate any of it. Building something
that *looks* like a working EHR integration would be the fake-success-state
failure `CLAUDE.md` forbids — and it would be the most consequential place to
fake, since it is the part judges are least able to verify.

## Decision

**Implement the server-side launch-layer contract. Specify the client fully.
Build the MV3 client only as a clearly-labelled reference stub, and only if
Week 3 has slack.**

The extension is a launch layer: it lets a clinician, by explicit click, open
OncoBrief for the patient already on screen. It is not an ingestion mechanism,
not a scraper, and not a writeback path.

`POST /api/v1/extension/session` accepts `{ orgSlug, patientIdentifier,
identifierSystem }` — **identifiers only, never document content** — from a
registered origin, requires an already-authenticated OncoBrief session,
resolves the patient within the caller's org, and returns a single-use token
valid for 5 minutes.

`extension_grant` enforces the safety properties in the schema rather than in
configuration:

```sql
CONSTRAINT short_lived CHECK (expires_at <= created_at + INTERVAL '10 minutes')
```

so "short-lived" cannot be widened by changing a setting. `used_at` makes the
grant single-use. Scope is **intersected server-side** with the caller's own
role permissions, so a grant can never exceed what the user could already do.
Origins are allow-listed per org; an unregistered origin gets `403` plus an
`authz.denied` audit row. The manifest declares `activeTab` and a narrow host
pattern — never `<all_urls>`.

**Secure document upload is the primary, fully implemented ingestion path.**
It is the pattern that works without hospital integration, and it is what makes
the product interoperability-independent — which research §3.1 identifies as
the actual novelty. SMART on FHIR gets an interface sketch
(`FhirDocumentSourcePort` producing `document` rows with
`source_kind='fhir_document'`) and no implementation.

## Alternatives considered

**Build a full working extension against a mock EHR page.** Rejected as the
primary plan: it consumes a week of the build window to demonstrate a
capability that cannot be validated, while the ledger — the actual IP — is
still being finished. Retained as stretch item #2.

**Build nothing, document nothing.** Rejected: the design document names the
extension as a deliverable, and the launch-layer contract is cheap, testable
and genuinely the security-interesting part.

**A permanent extension session with a long-lived token.** Rejected outright:
it is a standing credential on a clinician's browser, and it defeats the
short-lived-session requirement.

**Extension scrapes the chart and uploads documents.** Rejected: explicitly
forbidden, and it would make the product's legal and ethical position
indefensible.

**Present the stub as a working integration.** Rejected: fake success state.
The `/about` page states plainly what is stub and what is real.

## Consequences

**Positive.** The security-interesting part — short-lived single-use grants,
scope intersection, origin allow-listing, audit on both grant and denial — is
real, tested and demonstrable via the API without any EHR. Schema-level
enforcement means the short-lived property cannot regress through
configuration. The build window stays focused on the ledger. Threats T9
(over-collection) and T10 (writeback) are mitigated by construction: no
outbound EHR client exists in the codebase, and no endpoint accepts an EHR
write target.

**Negative.** The demo cannot show an in-EHR launch. Real-world integration
friction — vendor review, per-EHR DOM selectors, hospital IT approval, SSO
interaction — is unexplored and will be substantial. Judges may read the
absence as incompleteness; the honest framing is that it is a deliberate
scope decision with a documented reason, which is a stronger position than a
convincing mock.

**Neutral.** The server contract is stable whether the client is a stub, a real
extension, or a future SMART launch — all three produce the same grant.
