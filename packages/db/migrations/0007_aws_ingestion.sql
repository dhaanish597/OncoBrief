-- ===========================================================================
-- 0007_aws_ingestion.sql
--
-- Additive only. Nothing in 0001–0006 is altered destructively. This adds the
-- async-ingestion bookkeeping the AWS pipeline needs (ADR 0015):
--
--   * correlation ids on document / audit / ledger, so one upload can be
--     traced across S3 → SQS → Textract → Bedrock;
--   * S3 object version tracking on document;
--   * a duplicate *status* distinct from the duplicate *link*, so a
--     near-duplicate is visible as a candidate for human confirmation and is
--     never silently deleted;
--   * document_ingestion_job — the idempotency and retry ledger for workers;
--   * packet_event — an append-only lifecycle stream for consultation packets.
-- ===========================================================================

SET ROLE oncobrief_migrator;

-- ---------------------------------------------------------------------------
-- Direct-to-S3 uploads create the document row at presign time, before the
-- bytes (and therefore the hash) exist. Allow a NULL hash while pending: in
-- Postgres NULLs are distinct under a UNIQUE constraint, so many pending rows
-- coexist, and the canonical `UNIQUE (org_id, patient_id, content_sha256)` is
-- still enforced once the worker computes the real hash. This is additive and
-- does not touch existing rows.
-- ---------------------------------------------------------------------------
ALTER TABLE document ALTER COLUMN content_sha256 DROP NOT NULL;
ALTER TABLE document ALTER COLUMN byte_size SET DEFAULT 0;

-- ---------------------------------------------------------------------------
-- Correlation and version columns
-- ---------------------------------------------------------------------------
ALTER TABLE document     ADD COLUMN IF NOT EXISTS correlation_id text;
ALTER TABLE document     ADD COLUMN IF NOT EXISTS s3_version_id  text;
ALTER TABLE evidence_fact ADD COLUMN IF NOT EXISTS correlation_id text;
ALTER TABLE ledger_entry  ADD COLUMN IF NOT EXISTS correlation_id text;
ALTER TABLE audit_event   ADD COLUMN IF NOT EXISTS correlation_id text;

ALTER TABLE document ADD COLUMN IF NOT EXISTS duplicate_status text NOT NULL DEFAULT 'none'
  CHECK (duplicate_status IN ('none','duplicate_candidate','confirmed_duplicate'));

CREATE INDEX IF NOT EXISTS document_correlation_idx ON document (org_id, correlation_id);
CREATE INDEX IF NOT EXISTS ledger_entry_correlation_idx ON ledger_entry (org_id, correlation_id);

-- ---------------------------------------------------------------------------
-- document_ingestion_job — worker idempotency and retry state.
--
-- SQS and S3 notifications are at-least-once. A worker must be able to answer
-- "have I already finished this document?" from the database, not from the
-- message, before it appends any evidence.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS document_ingestion_job (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid NOT NULL REFERENCES organization(id),
  document_id     uuid NOT NULL REFERENCES document(id),
  correlation_id  text NOT NULL,
  stage           text NOT NULL DEFAULT 'queued'
                    CHECK (stage IN ('queued','textract_started','ocr_fetched','extracting','completed','failed')),
  provider_job_id text,
  s3_bucket       text,
  s3_key          text,
  s3_version_id   text,
  attempts        integer NOT NULL DEFAULT 0,
  last_error      text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (document_id)
);
CREATE INDEX IF NOT EXISTS ingestion_job_stage_idx ON document_ingestion_job (org_id, stage);

-- ---------------------------------------------------------------------------
-- packet_event — append-only packet lifecycle stream.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS packet_event (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id           uuid NOT NULL REFERENCES organization(id),
  packet_id        uuid NOT NULL REFERENCES consultation_packet(id),
  action           text NOT NULL
                     CHECK (action IN ('created','submitted','approved','withdrawn','exported','needs_refresh','superseded')),
  from_status      packet_status,
  to_status        packet_status,
  actor_user_id    uuid REFERENCES app_user(id),
  reason           text,
  correlation_id   text,
  occurred_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS packet_event_packet_idx ON packet_event (packet_id, occurred_at);

-- ---------------------------------------------------------------------------
-- Tenant isolation for the new tables.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  t text;
  tenant_tables text[] := ARRAY['document_ingestion_job','packet_event'];
BEGIN
  FOREACH t IN ARRAY tenant_tables LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I '
      'USING (org_id = current_setting(''app.org_id'', true)::uuid) '
      'WITH CHECK (org_id = current_setting(''app.org_id'', true)::uuid)',
      t
    );
  END LOOP;
END $$;

-- New tables need explicit grants: the 0003 `GRANT ... ON ALL TABLES` ran
-- before these existed and does not cover them.
GRANT SELECT, INSERT, UPDATE ON document_ingestion_job TO oncobrief_app;
GRANT SELECT, INSERT ON packet_event TO oncobrief_app;
REVOKE UPDATE, DELETE ON packet_event FROM oncobrief_app;

DROP TRIGGER IF EXISTS packet_event_append_only ON packet_event;
CREATE TRIGGER packet_event_append_only
  BEFORE UPDATE OR DELETE ON packet_event
  FOR EACH ROW EXECUTE FUNCTION oncobrief_block_mutation();

RESET ROLE;
