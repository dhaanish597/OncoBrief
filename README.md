# OncoBrief

Source-verified oncology record readiness and care continuity for Health-a-thon 2026.

OncoBrief reconstructs fragmented documents into an **Evidence Ledger**. Facts retain their source document, page, exact text, extraction method and review state. The timeline is a view over that ledger. People verify evidence, reconcile contradictions, approve consultation packets and approve patient continuity messages.

**Synthetic prototype only.** This is an administrative operations platform, not a diagnosis system, treatment recommender, medical interpreter or patient risk-scoring system. No real patient data should be introduced.

## Start here

- [Submission pack and existing decks](submission/README.md)
- [Current release checks and limitations](submission/RELEASE_CHECKLIST.md)
- [Documentation index](docs/README.md)
- [Evaluator guide and code map](docs/aws-deployment/23-hackathon-evaluator-guide.md)
- [Patient mobile app](apps/mobile/README.md)

The web app, patient mobile app, browser extension, worker, shared packages, plans and deployment source are integrated in **main**. A separate patient-app branch is no longer required to obtain the mobile code.

## Run the clinician platform locally

Use Node 24 LTS (24.3 or later), pnpm **9.15.4**, and PostgreSQL 16. Docker Compose provides a local PostgreSQL instance. Use a dedicated disposable local database for resets/tests; never point demo reset at an existing patient environment.

```bash
git clone https://github.com/dhaanish597/OncoBrief.git
cd OncoBrief
pnpm install --frozen-lockfile
cp .env.example .env
pnpm db:up
pnpm db:migrate
pnpm demo:reset
pnpm dev
```

Open [localhost:3000](http://localhost:3000). The landing page is public; the consultation workspace requires sign-in. Demo credentials are printed by `demo:reset`; synthetic accounts include `dr.rao@rci.demo` (clinician), `coord.anita@rci.demo` (coordinator), `records.deepak@rci.demo`, `admin.sys@rci.demo` and `auditor.k@rci.demo`.

`demo:reset` replaces **local synthetic fixture data** after its safety checks; it does not migrate a fresh database. Run migrations first. Select deterministic local providers in `.env` when reproducing offline checks; optional configured providers may make external requests. See [.env.example](.env.example).

## Run the patient app

The Expo / React Native companion includes an offline synthetic mode and authenticated connected mode. Patient review stays distinct from clinician verification. Connected data requires the hospital backend and a valid patient session; the fictional offline demo needs neither.

```bash
pnpm --filter @oncobrief/mobile start
# Browser preview:
pnpm --filter @oncobrief/mobile export:web
pnpm --filter @oncobrief/mobile preview
```

See [mobile setup, security and native-build instructions](apps/mobile/README.md). An Android Hermes bundle is not an installable APK. The [Android workflow](.github/workflows/android-apk.yml) generates the native project and builds a debug APK as a workflow artifact.

## What to demonstrate

Follow [the demo guide](docs/demo-flow.md) and [evaluator guide](docs/aws-deployment/23-hackathon-evaluator-guide.md):

1. Open a synthetic patient with fragmented sources.
2. Inspect extracted evidence and its exact supporting source.
3. Verify or correct an item; inspect the recorded state change.
4. Reconcile a contradiction manually while preserving both source values.
5. Inspect record readiness and create a source-backed retrieval task.
6. Generate and approve the consultation packet.
7. Preview and approve an administrative continuity message.
8. Inspect the audit trail as the auditor; review the companion patient workflow.

The three primary fixtures exercise fragmented/conflicting records (`DEMO-001`), a later source reopening a settled fact (`DEMO-002`), and a verified ready record (`DEMO-003`). Tests change fixture state, so use a fresh dedicated demo database when reproducing the full sequence.

## Repository map

| Location | Contents |
|---|---|
| [apps/web](apps/web/) | Next.js clinician UI, authenticated patient APIs, source inspection, workflows and browser tests |
| [apps/mobile](apps/mobile/) | Expo / React Native patient companion, offline synthetic fixtures, connected API client, tests and Maestro flows |
| [apps/extension](apps/extension/) | User-initiated browser integration layer; not a general chart scraper |
| [apps/worker](apps/worker/) | Optional asynchronous document-ingestion worker and Lambda build |
| [packages/domain](packages/domain/) | Evidence state transitions, provenance, reconciliation, packets, readiness and safety policy |
| [packages/db](packages/db/) | PostgreSQL migrations, RLS, services, synthetic fixtures and integration tests |
| [packages/ports](packages/ports/) | Typed adapter contracts |
| [packages/adapters](packages/adapters/) | OCR, extraction, storage, FHIR, voice and delivery adapters |
| [infra](infra/) | Terraform; use the isolated hackathon profile for the documented evaluator deployment |
| [tools](tools/) | Verification, bootstrap and demo-recording tools |
| [docs](docs/README.md) | Product rules, architecture, decisions, research, plans and historical evidence |
| [submission](submission/README.md) | Submission entry point, decks, curated assets and current release checklist |
| [reports](reports/README.md) | Dated independent audits and short visual-proof recordings |

## Verification

With a dedicated local PostgreSQL database migrated and seeded:

```bash
pnpm verify                  # typecheck, lint, boundary/branding scans, workspace tests
pnpm worker:build
pnpm --filter @oncobrief/web build
pnpm --filter @oncobrief/web exec playwright install chromium
pnpm test:e2e
pnpm verify:patient-mobile
```

The suites mutate synthetic data. Use the [current release checklist](submission/RELEASE_CHECKLIST.md) for exact checked scopes, native/mobile evidence levels and skipped external-provider tests. Do not infer current test counts from historical reports.

## Evaluator deployment and limits

The [November 5 deployment report](docs/aws-deployment/24-hackathon-deployment-report.md) records the restricted synthetic site at [d1idx0s43enxlm.cloudfront.net](https://d1idx0s43enxlm.cloudfront.net). Evaluators need privately shared edge credentials plus application sign-in. The older September CloudFront URL is historical. This repository release does not redeploy AWS; the live image has a separate [source manifest](docs/aws-deployment/hackathon-release-manifest.json).

The documented hackathon profile uses synchronous web ingestion, deterministic extraction, private PostgreSQL and S3, and optional configured provider adapters. The worker/cloud ingestion source is included but is not deployed in that profile. ABDM and outbound continuity delivery remain simulated there. Implemented FHIR adapters and the extension are not evidence of real hospital integration. Clinical efficacy, pilot outcomes, production SLA and regulatory certification are not established.

Read [security assumptions](docs/security.md), [architecture decisions](docs/decisions/README.md), [engineering rules](CLAUDE.md) and [research claims discipline](docs/oncobrief_deep_research_health-a-thon-2026.md) before extending or presenting the system.

Prototype for Health-a-thon 2026. Not for clinical use.
