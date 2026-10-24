-- V4 foundation only. No scheduling, messages, verification or clinical action
-- is automated by this migration. Existing ledger/source policies stay intact.
SET ROLE oncobrief_migrator;

ALTER TABLE patient
  ADD COLUMN last_consultation_date date,
  ADD COLUMN primary_language text NOT NULL DEFAULT 'en-IN'
    CHECK (length(btrim(primary_language)) > 0);

-- A priority source must describe this patient as well as this tenant.
ALTER TABLE evidence_fact ADD CONSTRAINT evidence_fact_org_patient_id_uq
  UNIQUE (org_id, patient_id, id);

CREATE TABLE caregiver_contact (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organization(id),
  patient_id uuid NOT NULL,
  full_name text NOT NULL CHECK (length(btrim(full_name)) > 0),
  relationship text NOT NULL CHECK (length(btrim(relationship)) > 0),
  phone_number text NOT NULL CHECK (length(btrim(phone_number)) > 0),
  preferred_locale text NOT NULL DEFAULT 'hi-IN' CHECK (length(btrim(preferred_locale)) > 0),
  prefers_voice_note boolean NOT NULL DEFAULT true,
  consent_recorded_at timestamptz NOT NULL DEFAULT now(),
  consent_recorded_by uuid NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  UNIQUE (org_id, id),
  FOREIGN KEY (org_id, patient_id) REFERENCES patient(org_id, id),
  FOREIGN KEY (org_id, consent_recorded_by) REFERENCES membership(org_id, user_id)
);
CREATE INDEX caregiver_patient_idx ON caregiver_contact(org_id, patient_id);

CREATE TYPE opd_slot_status AS ENUM (
  'scheduled','checked_in','in_consult','delayed_investigation','completed',
  'cancelled','no_show','walk_in','vacant'
);
CREATE TYPE admin_priority_tag AS ENUM (
  'routine_followup','new_referral','post_op_wound_check_documented',
  'chemo_cycle_clearance_documented','expedited_slot_requested'
);

CREATE TABLE opd_appointment_slot (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organization(id),
  clinic_date date NOT NULL DEFAULT CURRENT_DATE,
  slot_start_time time NOT NULL,
  slot_end_time time NOT NULL,
  room_label text NOT NULL DEFAULT 'OPD Room 1',
  clinician_id uuid,
  patient_id uuid,
  token_number text,
  status opd_slot_status NOT NULL DEFAULT 'scheduled',
  priority_tag admin_priority_tag NOT NULL DEFAULT 'routine_followup',
  priority_source_fact_id uuid,
  bottleneck_note text,
  checked_in_at timestamptz,
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, id),
  CHECK (slot_end_time > slot_start_time),
  CHECK (priority_source_fact_id IS NULL OR patient_id IS NOT NULL),
  FOREIGN KEY (org_id, patient_id) REFERENCES patient(org_id, id),
  FOREIGN KEY (org_id, clinician_id) REFERENCES membership(org_id, user_id),
  FOREIGN KEY (org_id, updated_by) REFERENCES membership(org_id, user_id),
  FOREIGN KEY (org_id, patient_id, priority_source_fact_id)
    REFERENCES evidence_fact(org_id, patient_id, id)
);
CREATE INDEX opd_slot_date_idx ON opd_appointment_slot(org_id, clinic_date, slot_start_time);

CREATE TABLE opd_waitlist_entry (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organization(id),
  patient_id uuid NOT NULL,
  requested_date date NOT NULL DEFAULT CURRENT_DATE,
  priority_tag admin_priority_tag NOT NULL DEFAULT 'routine_followup',
  priority_source_fact_id uuid,
  status text NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting','offered','slotted','cancelled')),
  offered_slot_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, id),
  FOREIGN KEY (org_id, patient_id) REFERENCES patient(org_id, id),
  FOREIGN KEY (org_id, patient_id, priority_source_fact_id)
    REFERENCES evidence_fact(org_id, patient_id, id),
  FOREIGN KEY (org_id, offered_slot_id) REFERENCES opd_appointment_slot(org_id, id)
);
CREATE INDEX opd_waitlist_date_idx ON opd_waitlist_entry(org_id, requested_date, status);

CREATE TABLE guideline_document (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organization(id),
  code text NOT NULL CHECK (length(btrim(code)) > 0),
  title text NOT NULL CHECK (length(btrim(title)) > 0),
  issuing_body text NOT NULL CHECK (length(btrim(issuing_body)) > 0),
  version_label text NOT NULL CHECK (length(btrim(version_label)) > 0),
  publication_date date NOT NULL,
  content_sha256 bytea NOT NULL CHECK (octet_length(content_sha256) = 32),
  is_active boolean NOT NULL DEFAULT true,
  uploaded_by uuid NOT NULL,
  uploaded_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, id),
  UNIQUE (org_id, code, version_label),
  FOREIGN KEY (org_id, uploaded_by) REFERENCES membership(org_id, user_id)
);

CREATE TABLE guideline_span (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organization(id),
  guideline_document_id uuid NOT NULL,
  page_number integer NOT NULL CHECK (page_number >= 1),
  section_heading text NOT NULL,
  span_index integer NOT NULL CHECK (span_index >= 0),
  verbatim_text text NOT NULL CHECK (length(btrim(verbatim_text)) > 0),
  -- Geometry must be supplied from extraction. No fabricated default boxes.
  bbox_x real NOT NULL CHECK (bbox_x >= 0 AND bbox_x <= 1),
  bbox_y real NOT NULL CHECK (bbox_y >= 0 AND bbox_y <= 1),
  bbox_w real NOT NULL CHECK (bbox_w > 0 AND bbox_w <= 1),
  bbox_h real NOT NULL CHECK (bbox_h > 0 AND bbox_h <= 1),
  keywords text[] NOT NULL DEFAULT '{}',
  UNIQUE (org_id, id),
  UNIQUE (guideline_document_id, page_number, span_index),
  CHECK (bbox_x + bbox_w <= 1 AND bbox_y + bbox_h <= 1),
  FOREIGN KEY (org_id, guideline_document_id) REFERENCES guideline_document(org_id, id)
);
CREATE INDEX guideline_span_document_idx ON guideline_span(org_id, guideline_document_id);

CREATE TYPE studio_artifact_kind AS ENUM (
  'referral_letter','tumor_board_deck','academic_case_abstract','patient_info_sheet'
);
CREATE TABLE studio_artifact (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organization(id),
  patient_id uuid NOT NULL,
  artifact_kind studio_artifact_kind NOT NULL,
  title text NOT NULL CHECK (length(btrim(title)) > 0),
  locale text NOT NULL DEFAULT 'en-IN',
  markdown_body text NOT NULL,
  cited_fact_ids uuid[] NOT NULL DEFAULT '{}',
  cited_guideline_ids uuid[] NOT NULL DEFAULT '{}',
  is_deidentified boolean NOT NULL DEFAULT false,
  status packet_status NOT NULL DEFAULT 'draft',
  snapshot_sha256 bytea CHECK (snapshot_sha256 IS NULL OR octet_length(snapshot_sha256) = 32),
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  approved_by uuid,
  approved_at timestamptz,
  UNIQUE (org_id, id),
  FOREIGN KEY (org_id, patient_id) REFERENCES patient(org_id, id),
  FOREIGN KEY (org_id, created_by) REFERENCES membership(org_id, user_id),
  FOREIGN KEY (org_id, approved_by) REFERENCES membership(org_id, user_id),
  CONSTRAINT approved_studio_has_snapshot CHECK (
    status <> 'approved' OR
    (snapshot_sha256 IS NOT NULL AND approved_by IS NOT NULL AND approved_at IS NOT NULL)
  )
);
CREATE INDEX studio_patient_idx ON studio_artifact(org_id, patient_id, created_at);

-- Arrays are retained for compatibility with the enhancement plan. Enforce
-- their references with invoker-security validation under the caller's RLS.
CREATE OR REPLACE FUNCTION validate_studio_citations() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.status = 'approved' AND NEW.approved_by IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM membership m
     WHERE m.org_id = NEW.org_id AND m.user_id = NEW.approved_by AND m.role = 'clinician'
  ) THEN
    RAISE EXCEPTION 'studio_approval_requires_clinician' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF EXISTS (
    SELECT 1 FROM unnest(NEW.cited_fact_ids) cited(id)
     WHERE cited.id IS NULL OR NOT EXISTS (
       SELECT 1 FROM evidence_fact f
        WHERE f.id = cited.id AND f.org_id = NEW.org_id AND f.patient_id = NEW.patient_id
     )
  ) OR EXISTS (
    SELECT 1 FROM unnest(NEW.cited_guideline_ids) cited(id)
     WHERE cited.id IS NULL OR NOT EXISTS (
       SELECT 1 FROM guideline_document d WHERE d.id = cited.id AND d.org_id = NEW.org_id
     )
  ) THEN
    RAISE EXCEPTION 'invalid_studio_citation' USING ERRCODE = 'foreign_key_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER studio_citations_valid BEFORE INSERT OR UPDATE ON studio_artifact
  FOR EACH ROW EXECUTE FUNCTION validate_studio_citations();

CREATE FUNCTION freeze_approved_studio() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF OLD.status = 'approved' THEN
    RAISE EXCEPTION 'approved_studio_is_immutable' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER approved_studio_immutable BEFORE UPDATE OR DELETE ON studio_artifact
  FOR EACH ROW EXECUTE FUNCTION freeze_approved_studio();

CREATE TRIGGER guideline_document_append_only BEFORE UPDATE OR DELETE ON guideline_document
  FOR EACH ROW EXECUTE FUNCTION oncobrief_block_mutation();
CREATE TRIGGER guideline_span_append_only BEFORE UPDATE OR DELETE ON guideline_span
  FOR EACH ROW EXECUTE FUNCTION oncobrief_block_mutation();

DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'caregiver_contact','opd_appointment_slot','opd_waitlist_entry',
    'guideline_document','guideline_span','studio_artifact'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', table_name);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I USING (org_id = current_setting(''app.org_id'', true)::uuid) WITH CHECK (org_id = current_setting(''app.org_id'', true)::uuid)', table_name
    );
  END LOOP;
END $$;
GRANT SELECT, INSERT, UPDATE ON caregiver_contact, opd_appointment_slot, opd_waitlist_entry, studio_artifact TO oncobrief_app;
GRANT SELECT, INSERT ON guideline_document, guideline_span TO oncobrief_app;
REVOKE ALL ON FUNCTION validate_studio_citations(), freeze_approved_studio() FROM PUBLIC;
RESET ROLE;
