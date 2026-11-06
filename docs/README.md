# OncoBrief documentation

Start with the [submission pack](../submission/README.md) and [current release checklist](../submission/RELEASE_CHECKLIST.md). This index distinguishes product rules, implementation plans and historical evidence. A dated report is evidence of that run, not proof of current behavior.

## Product and safety rules

Read these before changing the platform:

1. [Engineering and safety rules](../CLAUDE.md) and [agent instructions](../AGENTS.md)
2. [Research, scope and claims discipline](oncobrief_deep_research_health-a-thon-2026.md)
3. [Clinician platform design](oncobrief_clinician_platform_design.md)
4. [Original cancer-track blueprint](cancer_track.md) — research background; its aspirational impact figures and older stack proposals are not implementation or efficacy claims

The Evidence Ledger is the source of truth. Timeline views, tasks, packets and continuity messages retain provenance and human approval. No diagnosis, treatment recommendation, medical interpretation or patient risk scoring.

## Build and understand the system

| Topic | Start here |
|---|---|
| Local setup | [Repository README](../README.md), [development setup](development-setup.md), [troubleshooting](troubleshooting.md) |
| System architecture | [Architecture](architecture/oncobrief-architecture.md), [backend](backend-architecture.md), [decision records](decisions/README.md) |
| Evidence and database | [Evidence Ledger](evidence-ledger.md), [database and migrations](database-and-migrations.md) |
| Access and audit | [Security](security.md), [roles and permissions](roles-and-permissions.md) |
| Clinician workflows | [Demo flow](demo-flow.md), [OPD operations](opd-operations.md), [encounter lifecycle](encounter-lifecycle.md), [care coordination](care-coordination.md) |
| Patient mobile | [Mobile README](../apps/mobile/README.md), [architecture ADR 0026](decisions/0026-patient-mobile-architecture.md), [patient continuity](patient-continuity.md) |
| APIs and interoperability | [API reference](api.md), [FHIR R4 report](implementation-planning/healthathon-final-remediation/FHIR_R4_INTEROPERABILITY_REPORT.md), [ABDM plan](ABDM_M2_M3_INTEGRATION_PLAN.md) |
| Evaluator deployment | [AWS documentation index](aws-deployment/README.md), [restricted deployment report](aws-deployment/24-hackathon-deployment-report.md), [evaluator guide](aws-deployment/23-hackathon-evaluator-guide.md) |

## Plans and execution records

- [November 6 repository integration plan](implementation-planning/2026-11-06-submission-integration.md): preservation, merges, organization and release checks for this submission.
- [Platform planning](implementation-planning/README.md): assessment/remediation plan, scope matrices and final-remediation records.
- [Patient mobile plans](plans/README.md): implementation plan, execution tracker, requirements and release gates.
- [Earlier implementation plans](superpowers/plans/): dated development history.
- [Research and slide evidence](research/README.md): solution brief, provider traceability, evaluation and safety notes.
- [Archived root documents](archive/README.md): earlier enhancement plans and phase report.

## Verification and presentation evidence

- [Current repository release checklist](../submission/RELEASE_CHECKLIST.md): checks actually rerun for the integrated repository.
- [Independent audit reports](../reports/README.md) and [visual proof](../reports/visual-proof/VIDEO_VERIFICATION_REPORT.md): dated evidence, not a replacement for release tests.
- [Review evidence from October 24](review-evidence/2026-10-24/README.md).
- [Historical September deployment verification](final-submission-verification.md): superseded as a deployment entry point by the November restricted deployment report.
- [Submission decks and presentation assets](../submission/README.md).

Keep plans in their existing implementation/plans folders so task identifiers and historical citations remain stable. New release status belongs in the submission checklist; do not rewrite old reports to imply they were rerun.
