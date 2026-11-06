# ADR 0027: Restricted synthetic hackathon deployment

Date: 2026-11-05. Status: accepted for this prototype deployment.

## Context

The user clarified that this is a hackathon prototype, not a public product or clinical deployment. Judges may inspect both the running application and its code using AI. The old compute/database deployment was deleted; retained snapshots, documents and state must remain untouched. Recreating every optional worker and production-pilot component would add cost and operational ambiguity.

## Decision

Use a separate Terraform environment/state, fresh synthetic RDS database and dedicated synthetic S3 bucket. Retain the existing Next.js full-stack application and evidence-ledger/RLS architecture. One public-egress Fargate task has no internet ingress; its internal ALB is reached through a CloudFront VPC origin. Every viewer request requires an evaluator credential gate before normal application authentication; anonymous assets and APIs are denied too. CloudFront uses viewer HTTPS and private origin HTTP for this synthetic profile.

Use the existing synchronous ingestion path exclusively (`DOCUMENT_INGESTION_MODE=sync`). S3 presigning alone must not advertise an asynchronous upload path without an ingestion consumer. Do not deploy S3 notifications, Lambda ingestion or NAT in this profile. Database initialization is permitted once on an empty database and never truncates existing data. The existing local reset safeguard remains unchanged.

## Alternatives considered

- Restore/recreate the old full stack: preserves historical infrastructure shape but adds NAT/Lambda costs and risks mixing archived data into a demo. Retained artifacts remain recovery assets instead.
- Replace the application with a new hosting model or self-managed database: potentially cheaper, but changes the established architecture and adds unnecessary operational work.
- Fully private VPN/tunnel: strongest network isolation, but evaluator clients require a tunnel. The earlier user choice was a CloudFront demo URL; the selected HTTPS profile is access-restricted and remains internet-addressable. This distinction must be stated clearly.

## Consequences

Expected low-volume cost is approximately $55–$75/month before tax, with variable provider usage. No production availability or compliance claim follows. Synchronous uploads share web compute and cannot be described as an active cloud-worker deployment. Provider simulations/fallbacks must remain visible. An origin TLS/domain and a reviewed asynchronous worker/egress configuration are separate prerequisites for any future sensitive-data deployment.

The user explicitly selected the current short-lived root session for this prototype after AWS rejected root role assumption. This is a session-specific deployment choice, not a recommendation for future production operations. The account-locked Terraform provider avoids cross-account deployment; the unused deployment role creates no access keys.
