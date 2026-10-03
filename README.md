# OncoBrief

Source-Verified Oncology Consultation Preparation Platform.

A source-verified oncology **record-readiness** platform that organizes
fragmented records into a human-reviewed consultation preparation workflow.

OncoBrief turns fragmented documents into a structured **Evidence Ledger**. Every
displayed fact keeps its source document, page, exact text span, extraction
method, confidence band, reviewer and timestamp. The timeline is a *view* over
that ledger. Contradictions are never resolved silently. Every consequential
action requires a human.

It is an assistive **operations** layer. It is not a diagnostic system, a
treatment recommender, clinical decision support, a risk-scoring tool, or an
autonomous clinical assistant. The boundary is enforced in code, not just in
prose — see [`apps/web/src/app/(app)/about/page.tsx`](apps/web/src/app/(app)/about/page.tsx)
and the CI-failing boundary scan in [`tools/check-clinical-boundary.ts`](tools/check-clinical-boundary.ts).

> **Demo data only.** Every patient is synthetic and badged as a fixture in the
> interface. No real patient information is present, and no real patient data
> should be introduced without ethics review.

---

## Deployed — Health-a-thon 2026 submission

| | |
|---|---|
| **Frontend** | **https://dsc1vmsr4q09g.cloudfront.net** |
| Region | `ap-south-1` (Mumbai) |
| Runtime | Next.js on **ECS Fargate** in private subnets, behind an **ALB**, fronted by **CloudFront** for HTTPS on the AWS-owned certificate. The app connects directly to the **private RDS**; no database port is public. |
| Pipeline | The same Evidence Ledger and AWS ingestion path: **S3 → SQS → Lambda → Textract → Bedrock → PostgreSQL**. |
| Verification | [`docs/final-submission-verification.md`](docs/final-submission-verification.md) |

Sign in with any demo username below; the sign-in form is pre-filled with the
synthetic demo credential. No password or secret is published here.

> **AI-assisted features are optional.** The evidence assistant uses an
> external model provider when `NVIDIA_API_KEY` is configured and degrades
> gracefully (navigation and boundary guidance only) when it is not. The
> evidence-extraction pipeline uses Bedrock in the cloud worker; the deployed
> web tier runs rule-based extraction for its local fallback path.

---

## Run it

Requirements: Node ≥ 22, pnpm 9, Docker (for Postgres).

```bash
pnpm install
cp .env.example .env          # defaults are fine for local development
pnpm db:up                    # docker compose up -d postgres
pnpm demo:reset               # migrate, seed, and ingest the demo fixtures
pnpm dev                      # http://localhost:3000 — public landing at /
```

The root path `/` is the public landing page and renders without a session.
Everything under `/workspace` and `/patients/…` requires sign-in; an anonymous
visit to those paths is forwarded to `/login`.

`pnpm demo:reset` is idempotent. It truncates tenant data, re-seeds the
fixtures, and re-runs the ingestion pipeline for real, then prints the demo
credentials:

| Email | Role |
|---|---|
| `dr.rao@rci.demo` | clinician |
| `coord.anita@rci.demo` | coordinator |
| `records.deepak@rci.demo` | records officer |
| `admin.sys@rci.demo` | org admin |
| `auditor.k@rci.demo` | auditor |

Password for all demo users: the synthetic demo credential, pre-filled on the
sign-in form. It is not a secret; it is not restated here.

The whole flow runs offline. No third-party API call is made at any point.

---

## What the demo shows

Three seeded patients, each engineered to exercise a specific mechanism:

| Patient | The problem it contains | What it demonstrates |
|---|---|---|
| **DEMO-001** | A fragmented referral: 9 documents from 4 facilities, a re-faxed duplicate, a missing required insurance authorization, and **two documents that genuinely disagree about the surgery date** | Fragmentation, hover-to-source, a real contradiction, a missing document, a source-backed retrieval task |
| **DEMO-002** | A *verified* appointment fact, then a later document that contradicts it | A settled fact reopened by new evidence (`verified → conflicting`) |
| **DEMO-003** | A complete, fully verified record | `readiness_band = 'ready'`, packet approval, continuity message |

The contradiction is a date disagreement between two real documents detected by
the comparator at ingestion — not a flag set in a seed file. If the detector
broke, the demo would visibly lack a conflict.

---

## Architecture in one screen

```
Documents → OCR → Classification → Extraction → Evidence Ledger → Provenance
        → Human verification → Reconciliation → Administrative digital twin
        → Consultation packet → Care continuity
```

| Concern | Choice |
|---|---|
| Language | TypeScript, strict |
| App | Next.js 15 App Router (Server Components + Server Actions + `/api/v1` route handlers) |
| Database | PostgreSQL 16, forced Row-Level Security, append-only ledger |
| Data access | Hand-written parameterised SQL via `node-postgres` ([ADR 0014](docs/decisions/0014-raw-sql-data-access-via-node-postgres.md)) |
| Auth | Argon2id + opaque server-side session tokens in `HttpOnly` cookies |
| Object storage | `StoragePort` with a local-filesystem default ([ADR 0013](docs/decisions/0013-object-storage-port-defaults-to-filesystem.md)) and an S3-compatible path |

Four properties are enforced by the database rather than by convention:

1. **Append-only.** `REVOKE UPDATE, DELETE` plus a row trigger means the ledger,
   the claims and the audit stream cannot be rewritten — by the app role or by
   the schema owner.
2. **Tenant isolation.** Forced RLS with transaction-local `app.org_id`. A
   forgotten `set_config` fails closed with zero rows. Cross-tenant fetches
   return 404, never 403.
3. **Span-anchored provenance.** No fact reaches the ledger unless its verbatim
   quote is a contiguous substring of the linked OCR spans. A fabricated value
   has no anchor.
4. **Source-backed tasks.** A `CHECK` constraint refuses to store a task that is
   not anchored to evidence, a gap, a conflict, or a document. There is no
   "add task" affordance anywhere in the UI.

Full detail: [`docs/architecture/oncobrief-architecture.md`](docs/architecture/oncobrief-architecture.md)
and the decision records in [`docs/decisions/`](docs/decisions/).

---

## Layout

```
apps/web/          Next.js UI + /api/v1 + server actions; the public landing
                   page is `/`, the workspace sits behind sign-in
packages/domain/   Pure, I/O-free domain logic (the IP): state machine, span
                   validation, comparators, gaps, readiness, packet, messages,
                   RBAC, clinical-boundary guard
packages/db/       SQL migrations, RLS, repositories, application services,
                   seed + demo fixtures
packages/ports/    Interfaces: OcrPort, StoragePort, ExtractionPort, DeliveryPort
packages/adapters/ Implementations: fixture OCR, rule-based extractor,
                   local-filesystem storage, simulated delivery
tools/             Clinical-boundary scan, HTTP smoke check
docs/              Governing documents, architecture, decision records
```

---

## Verify

```bash
pnpm verify         # typecheck + lint + clinical-boundary scan + branding scan + all tests
pnpm test           # 429 tests: domain 301, adapters 24, Postgres integration 33, worker 26, web 45
pnpm test:integration   # integration tests only (needs Postgres)
```

Product-name and deployed-API guards:

```bash
pnpm branding:check                              # fails if a retired product name leaks into a shipped surface
SMOKE_BASE_URL=<deployed-host> pnpm smoke:api    # real sign-in + /api/v1 checks against a deployment
```

Browser E2E (Playwright) — the demo *is* the test suite:

```bash
pnpm --filter @oncobrief/web exec playwright install chromium   # once
pnpm demo:reset && pnpm --filter @oncobrief/web test:e2e
```

HTTP smoke check against a running server (no browser needed):

```bash
pnpm --filter @oncobrief/web start        # in one terminal
npx tsx tools/smoke.ts                    # in another
```

The integration tests assert the security properties directly: append-only
refusal, tenant isolation, fail-closed RLS, corrections preserving the original,
human-only verification, projection rebuild equivalence, and frozen packets.

---

## Honest limitations

These are stated as gaps, not as present:

- **OCR is deterministic fixtures in the demo.** Demo documents carry
  pre-computed spans so geometry is exact and reproducible. In the cloud path
  the worker calls Amazon Textract; a real upload with no text layer is
  quarantined for manual transcription rather than guessed at. Handwriting and
  low-quality Indic-script scans are beyond what is wired.
- **Two LLM paths are implemented, both span-constrained.** The cloud worker
  can extract with Amazon Bedrock (`EXTRACTION_DRIVER=bedrock`, Nova via forced
  tool use); the assistant uses an OpenAI-compatible provider
  (`NVIDIA_API_KEY`). Both may only return candidates that are verbatim
  substrings of the OCR spans — a candidate that fails span validation is
  dropped, and the system never writes an unanchored fact. The deployed web
  task runs `EXTRACTION_DRIVER=rule` for its local fallback path.
- **The assistant degrades rather than guesses.** With no provider key
  configured, navigation, boundary refusals and the deterministic
  "not found in the selected record set" answer still work; only the phrasing
  of a retrieved evidence answer is unavailable.
- **Patient delivery is simulated**, and labelled as simulated in the UI. Real
  WhatsApp / SMS / IVR needs credentials. Voice ASR/TTS is out of scope.
- **No SMART on FHIR implementation**, no browser-extension client.
- **No penetration test, WAF, key-management service, backup/restore drill, or
  DPDP compliance review.** Pilot prerequisites, not present.
- **No off-box audit anchoring** — a database-superuser compromise could rewrite
  and re-chain; that residual risk is documented rather than mitigated.
- **Claims discipline.** The impact percentages sometimes quoted for this idea
  (8→2 minute chart review, 20% capacity, 35–50% attrition reduction) trace to
  forum threads and vendor pages, not studies, and are not claimed anywhere in
  this repository. The only numbers quoted as results are self-measured:
  candidates proposed, candidates that passed span validation, and candidates a
  human confirmed.

## License

Prototype for Health-a-thon 2026. Not for clinical use.
