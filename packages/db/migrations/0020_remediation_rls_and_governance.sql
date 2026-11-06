-- ===========================================================================
-- 0020_remediation_rls_and_governance.sql
--
-- TASK-002: Security, RLS & Clinical Governance Remediation Foundation
--
-- Addresses:
--  1. Enforces ENABLE + FORCE ROW LEVEL SECURITY and null-safe UUID session
--     policies across all 14 Milestone A/B tenant tables (5 in 0016 + 9 in 0019).
--  2. Adds composite (org_id, patient_id, id) uniqueness and foreign-key
--     constraints plus trigger validation on tumor_board_case and
--     encounter_note_version so Evidence Ledger references (staging_fact_id,
--     cited_fact_ids) and consultation packets are guaranteed to belong to the
--     same organization AND the same patient, with verified state and active
--     document consent.
--  3. Adds execution_trace_json, pending_action_json, and provider_mode
--     persistence columns to chat_message (defined in 0006_chat_history.sql).
--  4. Adds composite tenant foreign keys and partial unique index
--     opd_slot_appointment_id_uq on opd_appointment_slot(org_id, appointment_id)
--     required for transactional appointment <-> OPD slot synchronization.
-- ===========================================================================

SET ROLE oncobrief_migrator;

-- ---------------------------------------------------------------------------
-- 1. Enforce ENABLE + FORCE ROW LEVEL SECURITY & Null-Safe Tenant Policies
--    across all 14 Milestone A/B Tenant Tables (5 in 0016 + 9 in 0019)
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  t text;
  milestone_ab_tables text[] := ARRAY[
    -- Milestone A (0016): 5 tables
    'facility',
    'department',
    'clinician_profile',
    'user_invitation',
    'patient_care_team',
    -- Milestone B (0019): 9 tables
    'clinic_session',
    'clinician_unavailability',
    'appointment',
    'appointment_status_history',
    'encounter',
    'encounter_participant',
    'encounter_note_version',
    'tumor_board_meeting',
    'tumor_board_case'
  ];
BEGIN
  FOREACH t IN ARRAY milestone_ab_tables LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I '
      'USING (org_id = NULLIF(current_setting(''app.org_id'', true), '''')::uuid) '
      'WITH CHECK (org_id = NULLIF(current_setting(''app.org_id'', true), '''')::uuid)',
      t
    );
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 2. Composite (org_id, patient_id, id) Uniqueness Keys for Same-Tenant &
--    Same-Patient Referential Integrity
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'consultation_packet_org_patient_id_uq'
  ) THEN
    ALTER TABLE consultation_packet
      ADD CONSTRAINT consultation_packet_org_patient_id_uq UNIQUE (org_id, patient_id, id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'encounter_org_patient_id_uq'
  ) THEN
    ALTER TABLE encounter
      ADD CONSTRAINT encounter_org_patient_id_uq UNIQUE (org_id, patient_id, id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'appointment_org_patient_id_uq'
  ) THEN
    ALTER TABLE appointment
      ADD CONSTRAINT appointment_org_patient_id_uq UNIQUE (org_id, patient_id, id);
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 3. Tumor Board Case Evidence Ledger Governance Columns, Composite FKs & Trigger
-- ---------------------------------------------------------------------------
ALTER TABLE tumor_board_case
  ADD COLUMN IF NOT EXISTS staging_fact_id uuid,
  ADD COLUMN IF NOT EXISTS cited_fact_ids uuid[] NOT NULL DEFAULT '{}';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'tumor_board_case_staging_fact_org_patient_fkey'
  ) THEN
    ALTER TABLE tumor_board_case
      ADD CONSTRAINT tumor_board_case_staging_fact_org_patient_fkey
      FOREIGN KEY (org_id, patient_id, staging_fact_id)
      REFERENCES evidence_fact(org_id, patient_id, id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'tumor_board_case_packet_org_patient_fkey'
  ) THEN
    ALTER TABLE tumor_board_case
      ADD CONSTRAINT tumor_board_case_packet_org_patient_fkey
      FOREIGN KEY (org_id, patient_id, packet_id)
      REFERENCES consultation_packet(org_id, patient_id, id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'tumor_board_case_meeting_org_fkey'
  ) THEN
    ALTER TABLE tumor_board_case
      ADD CONSTRAINT tumor_board_case_meeting_org_fkey
      FOREIGN KEY (org_id, meeting_id)
      REFERENCES tumor_board_meeting(org_id, id) ON DELETE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS tumor_board_case_staging_fact_idx
  ON tumor_board_case (org_id, patient_id, staging_fact_id)
  WHERE staging_fact_id IS NOT NULL;

CREATE OR REPLACE FUNCTION validate_tumor_board_case_governance() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  -- 1. If staging_fact_id is provided, it must belong to (NEW.org_id, NEW.patient_id),
  --    be a documented stage/diagnosis/histology fact in state 'verified' or 'corrected',
  --    and come from a source document whose consent has not been revoked.
  IF NEW.staging_fact_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1
        FROM evidence_fact ef
        JOIN document d ON d.id = ef.document_id AND d.org_id = ef.org_id
        LEFT JOIN evidence_state es ON es.evidence_fact_id = ef.id
       WHERE ef.id = NEW.staging_fact_id
         AND ef.org_id = NEW.org_id
         AND ef.patient_id = NEW.patient_id
         AND ef.fact_type IN (
           'stage_text.as_written',
           'diagnosis_text.as_written',
           'procedure.recorded',
           'stage.recorded',
           'diagnosis.recorded',
           'pathology.histology'
         )
         AND COALESCE(es.state, 'extracted') IN ('verified', 'corrected')
         AND d.ingest_error IS DISTINCT FROM 'consent_revoked_or_expired'
    ) THEN
      RAISE EXCEPTION 'invalid_tumor_board_staging_fact' USING ERRCODE = 'foreign_key_violation';
    END IF;
  END IF;

  -- 2. Every UUID in cited_fact_ids must belong to (NEW.org_id, NEW.patient_id)
  --    and come from a non-withdrawn source document.
  IF EXISTS (
    SELECT 1 FROM unnest(NEW.cited_fact_ids) cited(id)
     WHERE cited.id IS NULL OR NOT EXISTS (
       SELECT 1
         FROM evidence_fact ef
         JOIN document d ON d.id = ef.document_id AND d.org_id = ef.org_id
        WHERE ef.id = cited.id
          AND ef.org_id = NEW.org_id
          AND ef.patient_id = NEW.patient_id
          AND d.ingest_error IS DISTINCT FROM 'consent_revoked_or_expired'
     )
  ) THEN
    RAISE EXCEPTION 'invalid_tumor_board_citation' USING ERRCODE = 'foreign_key_violation';
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS tumor_board_case_governance_valid ON tumor_board_case;
CREATE TRIGGER tumor_board_case_governance_valid
  BEFORE INSERT OR UPDATE ON tumor_board_case
  FOR EACH ROW EXECUTE FUNCTION validate_tumor_board_case_governance();

-- ---------------------------------------------------------------------------
-- 4. Encounter Note Version Governance Columns, Composite FKs & Trigger
-- ---------------------------------------------------------------------------
ALTER TABLE encounter_note_version
  ADD COLUMN IF NOT EXISTS consultation_packet_id uuid,
  ADD COLUMN IF NOT EXISTS cited_fact_ids uuid[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS note_governance_kind text NOT NULL DEFAULT 'human_operational_coordination';

ALTER TABLE encounter_note_version
  DROP CONSTRAINT IF EXISTS encounter_note_version_note_governance_kind_check;

ALTER TABLE encounter_note_version
  ADD CONSTRAINT encounter_note_version_note_governance_kind_check
  CHECK (note_governance_kind IN ('human_operational_coordination', 'ledger_anchored'));

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'encounter_note_version_encounter_org_fkey'
  ) THEN
    ALTER TABLE encounter_note_version
      ADD CONSTRAINT encounter_note_version_encounter_org_fkey
      FOREIGN KEY (org_id, encounter_id)
      REFERENCES encounter(org_id, id) ON DELETE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS encounter_note_packet_idx
  ON encounter_note_version (org_id, consultation_packet_id)
  WHERE consultation_packet_id IS NOT NULL;

CREATE OR REPLACE FUNCTION validate_encounter_note_governance() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  v_patient_id uuid;
  v_signer_id  uuid;
BEGIN
  -- 1. Resolve parent encounter's patient_id within the same tenant
  SELECT e.patient_id INTO v_patient_id
    FROM encounter e
   WHERE e.id = NEW.encounter_id
     AND e.org_id = NEW.org_id;

  IF v_patient_id IS NULL THEN
    RAISE EXCEPTION 'invalid_encounter_reference' USING ERRCODE = 'foreign_key_violation';
  END IF;

  -- 2. If consultation_packet_id is set, it must belong to (NEW.org_id, v_patient_id)
  IF NEW.consultation_packet_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM consultation_packet cp
       WHERE cp.id = NEW.consultation_packet_id
         AND cp.org_id = NEW.org_id
         AND cp.patient_id = v_patient_id
    ) THEN
      RAISE EXCEPTION 'invalid_encounter_packet_reference' USING ERRCODE = 'foreign_key_violation';
    END IF;
  END IF;

  -- 3. Every UUID in cited_fact_ids must belong to (NEW.org_id, v_patient_id)
  --    and come from a non-withdrawn source document.
  IF EXISTS (
    SELECT 1 FROM unnest(NEW.cited_fact_ids) cited(id)
     WHERE cited.id IS NULL OR NOT EXISTS (
       SELECT 1
         FROM evidence_fact ef
         JOIN document d ON d.id = ef.document_id AND d.org_id = ef.org_id
        WHERE ef.id = cited.id
          AND ef.org_id = NEW.org_id
          AND ef.patient_id = v_patient_id
          AND d.ingest_error IS DISTINCT FROM 'consent_revoked_or_expired'
     )
  ) THEN
    RAISE EXCEPTION 'invalid_encounter_note_citation' USING ERRCODE = 'foreign_key_violation';
  END IF;

  -- 4. Finalizing or amending a consultation note requires an active clinician in the tenant
  IF NEW.status IN ('finalized', 'amended') THEN
    v_signer_id := COALESCE(NEW.finalized_by, NEW.authored_by);
    IF v_signer_id IS NULL OR NOT EXISTS (
      SELECT 1
        FROM membership m
        JOIN app_user u ON u.id = m.user_id
       WHERE m.org_id = NEW.org_id
         AND m.user_id = v_signer_id
         AND m.role = 'clinician'
         AND u.is_active = true
    ) THEN
      RAISE EXCEPTION 'encounter_note_signoff_requires_clinician' USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS encounter_note_governance_valid ON encounter_note_version;
CREATE TRIGGER encounter_note_governance_valid
  BEFORE INSERT OR UPDATE ON encounter_note_version
  FOR EACH ROW EXECUTE FUNCTION validate_encounter_note_governance();

-- ---------------------------------------------------------------------------
-- 5. Assistant Execution Trace & Pending Action Persistence on chat_message
--    (Actual table in 0006_chat_history.sql is chat_message, not assistant_message)
-- ---------------------------------------------------------------------------
ALTER TABLE chat_message
  ADD COLUMN IF NOT EXISTS execution_trace_json jsonb NOT NULL DEFAULT '[]'::jsonb
    CHECK (jsonb_typeof(execution_trace_json) = 'array'),
  ADD COLUMN IF NOT EXISTS pending_action_json jsonb
    CHECK (pending_action_json IS NULL OR jsonb_typeof(pending_action_json) = 'object'),
  ADD COLUMN IF NOT EXISTS provider_mode text NOT NULL DEFAULT 'deterministic';

ALTER TABLE chat_message
  DROP CONSTRAINT IF EXISTS chat_message_provider_mode_check;

ALTER TABLE chat_message
  ADD CONSTRAINT chat_message_provider_mode_check
  CHECK (provider_mode IN ('deterministic', 'nvidia-llm', 'bedrock-llm', 'hybrid', 'live_bedrock', 'deterministic_grounded'));

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chat_message_conversation_org_fkey'
  ) THEN
    ALTER TABLE chat_message
      ADD CONSTRAINT chat_message_conversation_org_fkey
      FOREIGN KEY (org_id, conversation_id)
      REFERENCES conversation(org_id, id) ON DELETE CASCADE;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 6. Scheduling Synchronization Constraints & Indexes (opd_appointment_slot <-> appointment)
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'opd_slot_appointment_org_fkey'
  ) THEN
    ALTER TABLE opd_appointment_slot
      ADD CONSTRAINT opd_slot_appointment_org_fkey
      FOREIGN KEY (org_id, appointment_id)
      REFERENCES appointment(org_id, id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'encounter_appointment_org_patient_fkey'
  ) THEN
    ALTER TABLE encounter
      ADD CONSTRAINT encounter_appointment_org_patient_fkey
      FOREIGN KEY (org_id, patient_id, appointment_id)
      REFERENCES appointment(org_id, patient_id, id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS opd_slot_appointment_id_uq
  ON opd_appointment_slot (org_id, appointment_id)
  WHERE appointment_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS encounter_appointment_idx
  ON encounter (org_id, appointment_id)
  WHERE appointment_id IS NOT NULL;

REVOKE ALL ON FUNCTION validate_tumor_board_case_governance(), validate_encounter_note_governance() FROM PUBLIC;

RESET ROLE;
