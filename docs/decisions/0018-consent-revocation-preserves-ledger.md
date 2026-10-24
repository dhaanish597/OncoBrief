# 0018 — Consent revocation preserves immutable ledger history

Status: Accepted

The HIU revocation handler attempted DELETE on append-only `evidence_fact`, causing
PostgreSQL 42501 after an imported document was present. Granting DELETE or
removing immutability triggers would violate the project evidence architecture.

Revocation/expiry now quarantines associated sources, deletes original and rendered
source objects when storage is supplied, clears transfer keys, updates request and
artifact status, and appends an audit event. Migration 0010 adds restrictive SELECT
policies for the runtime role on facts, spans, pages, candidates and timeline rows
whose source is withdrawn. Source metadata remains visible as access withdrawn;
source inspectors and evidence APIs return 404. No review status is fabricated.

Immutable database history is retained under the existing migration/admin access
boundary. This is access withdrawal and raw object removal, not a claim of complete
health-data erasure: ledger quotes, prior approved frozen packets, backups and S3
object versions require a separately governed retention/deletion policy before real
patient deployment. No privileged deletion backdoor is added.

Object cleanup failures do not undo consent withdrawal or key clearing. They leave
the transfer FAILED with `raw_source_cleanup_incomplete` and an error audit event
containing the outstanding object keys for administrative cleanup.
