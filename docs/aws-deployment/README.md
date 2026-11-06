# AWS deployment documentation

Start with [the deployed hackathon release report](24-hackathon-deployment-report.md), [the hackathon prototype deployment plan](22-hackathon-deployment-plan.md) and [evaluator guide](23-hackathon-evaluator-guide.md). The user clarified hackathon-only scope and authorized deployment; document 22 supersedes the production-pilot sizing and snapshot restore proposal in document 21.

The November 5 architecture studies (`00`–`20`) describe recommendations and include historical deployment claims. They are not evidence that those resources currently exist. Read-only AWS inspection on November 5 confirmed that the main stack was decommissioned and the retained Terraform state is stale.

- Historical pre-deployment inventory and initial proposal: [21-redeployment-audit-and-plan-2026-11-05.md](21-redeployment-audit-and-plan-2026-11-05.md).
- Target architecture and background: [14-final-aws-architecture.md](14-final-aws-architecture.md).
- Historical command sequence: [16-deployment-runbook.md](16-deployment-runbook.md). Apply the corrections in document 21 before using it.

Document 21 records a read-only initial audit. Subsequent authorized provisioning, migration and evaluator release are recorded in document 24.

- [24 — Restricted hackathon deployment report](24-hackathon-deployment-report.md): live release, verification, preserved resources, operational limits and rollback.
