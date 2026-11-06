-- ===========================================================================
-- 0021_wave2_complete_scope.sql
--
-- Wave 2 & Wave 3 Complete Scope Migration:
-- 1. document_subpacket table for persistent multi-report packet segmentation (TASK-017)
-- 2. admin_task.priority column for operational task priority & escalation controls (TASK-022)
-- 3. patient_message.webhook_event_id column for idempotent inbound continuity callbacks (TASK-023)
-- 4. opd_slot_event action CHECK constraint & opd_waitlist_entry offer expiration/message columns (TASK-008)
-- 5. guideline_document approval_status & superseded_by_id governance columns (TASK-018)
-- ===========================================================================

SET ROLE oncobrief_migrator;

-- 1. Persistent multi-report packet segmentation table (TASK-017)
CREATE TABLE IF NOT EXISTS document_subpacket (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organization(id),
  patient_id uuid NOT NULL REFERENCES patient(id),
  document_id uuid NOT NULL REFERENCES document(id) ON DELETE CASCADE,
  subpacket_index integer NOT NULL CHECK (subpacket_index >= 0),
  start_page integer NOT NULL CHECK (start_page >= 1),
  end_page integer NOT NULL CHECK (end_page >= start_page),
  category text NOT NULL CHECK (length(btrim(category)) > 0),
  stated_date date,
  stated_facility text,
  confidence numeric(4,3) NOT NULL DEFAULT 0.900 CHECK (confidence >= 0 AND confidence <= 1),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, id),
  UNIQUE (document_id, subpacket_index),
  FOREIGN KEY (org_id, patient_id) REFERENCES patient(org_id, id)
);

CREATE INDEX IF NOT EXISTS document_subpacket_doc_idx
  ON document_subpacket(org_id, document_id, subpacket_index);

CREATE INDEX IF NOT EXISTS document_subpacket_patient_idx
  ON document_subpacket(org_id, patient_id);

ALTER TABLE document_subpacket ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_subpacket FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON document_subpacket;
CREATE POLICY tenant_isolation ON document_subpacket
  USING (org_id = nullif(current_setting('app.org_id', true), '')::uuid)
  WITH CHECK (org_id = nullif(current_setting('app.org_id', true), '')::uuid);

GRANT SELECT, INSERT, UPDATE, DELETE ON document_subpacket TO oncobrief_app;

-- 2. Operational task priority column (TASK-022)
ALTER TABLE admin_task
  ADD COLUMN IF NOT EXISTS priority text NOT NULL DEFAULT 'normal'
  CHECK (priority IN ('urgent', 'high', 'normal', 'low'));

-- 3. Idempotent inbound continuity webhook event tracking (TASK-023)
ALTER TABLE patient_message
  ADD COLUMN IF NOT EXISTS webhook_event_id text UNIQUE;

-- 4. Extend opd_slot_event action CHECK constraint & opd_waitlist_entry offer lifecycle columns (TASK-008)
ALTER TABLE opd_slot_event DROP CONSTRAINT IF EXISTS opd_slot_event_action_check;
ALTER TABLE opd_slot_event ADD CONSTRAINT opd_slot_event_action_check
  CHECK (action IN ('status_changed', 'offered', 'walk_in', 'offer_accepted', 'offer_released', 'offer_declined', 'offer_expired'));

ALTER TABLE opd_waitlist_entry
  ADD COLUMN IF NOT EXISTS offer_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS offer_message_id uuid REFERENCES patient_message(id);

-- 5. Guideline approval & supersession lifecycle governance (TASK-018)
ALTER TABLE guideline_document
  ADD COLUMN IF NOT EXISTS approval_status text NOT NULL DEFAULT 'approved'
    CHECK (approval_status IN ('draft_unapproved', 'approved', 'superseded', 'withdrawn')),
  ADD COLUMN IF NOT EXISTS superseded_by_id uuid REFERENCES guideline_document(id);

-- Allow controlled lifecycle transitions (e.g. marking a guideline superseded / inactive when a newer version is approved)
-- while keeping code, title, version_label, and content_sha256 strictly immutable.
CREATE OR REPLACE FUNCTION enforce_guideline_document_immutability() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'guideline_document_is_append_only' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NEW.id <> OLD.id
     OR NEW.org_id <> OLD.org_id
     OR NEW.code <> OLD.code
     OR NEW.title <> OLD.title
     OR NEW.issuing_body <> OLD.issuing_body
     OR NEW.version_label <> OLD.version_label
     OR NEW.publication_date <> OLD.publication_date
     OR NEW.content_sha256 <> OLD.content_sha256
     OR NEW.uploaded_by <> OLD.uploaded_by THEN
    RAISE EXCEPTION 'guideline_document_content_is_immutable' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS guideline_document_append_only ON guideline_document;
CREATE TRIGGER guideline_document_append_only
  BEFORE UPDATE OR DELETE ON guideline_document
  FOR EACH ROW EXECUTE FUNCTION enforce_guideline_document_immutability();

GRANT UPDATE (is_active, approval_status, superseded_by_id) ON guideline_document TO oncobrief_app;

RESET ROLE;
