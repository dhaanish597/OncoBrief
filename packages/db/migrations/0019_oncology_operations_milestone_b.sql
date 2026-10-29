-- ===========================================================================
-- 0018_oncology_operations_milestone_b.sql
--
-- Milestone B: Complete Real-World Oncology Operations Application
--
-- Adds:
--  1. Clinic sessions & clinician availability/unavailability
--  2. Appointments & appointment status history with concurrency guard
--  3. Clinical Encounters, participants, and versioned clinician-authored notes
--  4. Tumor Board meetings and registered patient cases
--  5. OPD slot linking & task encounter origin
--  6. Strict tenant-isolated RLS and app grants
-- ===========================================================================

SET ROLE oncobrief_migrator;

-- 1. Clinic sessions (facility / department operating hours & room allocations)
CREATE TABLE IF NOT EXISTS clinic_session (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organization(id),
  facility_id uuid REFERENCES facility(id),
  department_id uuid,
  clinician_id uuid REFERENCES app_user(id),
  title text NOT NULL CHECK (length(btrim(title)) > 0),
  day_of_week integer NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  start_time time NOT NULL,
  end_time time NOT NULL CHECK (end_time > start_time),
  room_label text NOT NULL DEFAULT 'OPD Room 1',
  max_patients integer NOT NULL DEFAULT 20 CHECK (max_patients > 0),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, id),
  FOREIGN KEY (org_id, department_id) REFERENCES department(org_id, id)
);
CREATE INDEX IF NOT EXISTS clinic_session_lookup_idx ON clinic_session (org_id, clinician_id, day_of_week);

-- 2. Clinician unavailability / leave windows
CREATE TABLE IF NOT EXISTS clinician_unavailability (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organization(id),
  clinician_id uuid NOT NULL REFERENCES app_user(id),
  start_time timestamptz NOT NULL,
  end_time timestamptz NOT NULL CHECK (end_time > start_time),
  reason text NOT NULL CHECK (length(btrim(reason)) > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, id)
);
CREATE INDEX IF NOT EXISTS clinician_unavailability_idx ON clinician_unavailability (org_id, clinician_id, start_time);

-- 3. Appointment & status history
CREATE TABLE IF NOT EXISTS appointment (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organization(id),
  patient_id uuid NOT NULL,
  clinician_id uuid NOT NULL REFERENCES app_user(id),
  facility_id uuid REFERENCES facility(id),
  department_id uuid,
  clinic_session_id uuid REFERENCES clinic_session(id),
  scheduled_start timestamptz NOT NULL,
  scheduled_end timestamptz NOT NULL CHECK (scheduled_end > scheduled_start),
  room_label text NOT NULL DEFAULT 'OPD Room 1',
  appointment_type text NOT NULL DEFAULT 'follow_up' CHECK (appointment_type IN ('new_consultation', 'follow_up', 'chemo_clearance', 'post_op', 'urgent_review')),
  arrival_category text NOT NULL DEFAULT 'scheduled' CHECK (arrival_category IN ('scheduled', 'walk_in')),
  status text NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'confirmed', 'checked_in', 'waiting', 'in_consultation', 'completed', 'delayed', 'cancelled', 'no_show')),
  token_number text,
  cancellation_reason text,
  notes text,
  created_by uuid REFERENCES app_user(id),
  updated_by uuid REFERENCES app_user(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, id),
  FOREIGN KEY (org_id, patient_id) REFERENCES patient(org_id, id),
  FOREIGN KEY (org_id, department_id) REFERENCES department(org_id, id)
);
CREATE INDEX IF NOT EXISTS appointment_patient_idx ON appointment (org_id, patient_id, scheduled_start);
CREATE INDEX IF NOT EXISTS appointment_clinician_idx ON appointment (org_id, clinician_id, scheduled_start);
CREATE INDEX IF NOT EXISTS appointment_date_idx ON appointment (org_id, scheduled_start, status);

CREATE TABLE IF NOT EXISTS appointment_status_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organization(id),
  appointment_id uuid NOT NULL REFERENCES appointment(id) ON DELETE CASCADE,
  from_status text NOT NULL,
  to_status text NOT NULL,
  actor_id uuid NOT NULL REFERENCES app_user(id),
  reason text,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, id)
);
CREATE INDEX IF NOT EXISTS appointment_history_idx ON appointment_status_history (org_id, appointment_id, occurred_at);

-- Concurrency and collision prevention trigger for appointments
CREATE OR REPLACE FUNCTION appointment_conflict_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('appointment:'||NEW.org_id::text, 0));
  IF NEW.status NOT IN ('cancelled', 'no_show') THEN
    -- Prevent overlapping active appointments for the same clinician
    IF EXISTS (
      SELECT 1 FROM appointment a
      WHERE a.org_id = NEW.org_id
        AND a.id <> NEW.id
        AND a.clinician_id = NEW.clinician_id
        AND a.status NOT IN ('cancelled', 'no_show')
        AND a.scheduled_start < NEW.scheduled_end
        AND NEW.scheduled_start < a.scheduled_end
    ) THEN
      RAISE EXCEPTION 'clinician_schedule_conflict';
    END IF;

    -- Prevent overlapping active appointments in the same room
    IF EXISTS (
      SELECT 1 FROM appointment a
      WHERE a.org_id = NEW.org_id
        AND a.id <> NEW.id
        AND a.room_label = NEW.room_label
        AND a.status NOT IN ('cancelled', 'no_show')
        AND a.scheduled_start < NEW.scheduled_end
        AND NEW.scheduled_start < a.scheduled_end
    ) THEN
      RAISE EXCEPTION 'room_schedule_conflict';
    END IF;

    -- Prevent overlapping active appointments for the same patient
    IF EXISTS (
      SELECT 1 FROM appointment a
      WHERE a.org_id = NEW.org_id
        AND a.id <> NEW.id
        AND a.patient_id = NEW.patient_id
        AND a.status NOT IN ('cancelled', 'no_show')
        AND a.scheduled_start < NEW.scheduled_end
        AND NEW.scheduled_start < a.scheduled_end
    ) THEN
      RAISE EXCEPTION 'patient_schedule_conflict';
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS appointment_conflict_safe ON appointment;
CREATE TRIGGER appointment_conflict_safe BEFORE INSERT OR UPDATE ON appointment FOR EACH ROW EXECUTE FUNCTION appointment_conflict_guard();

-- 4. Consultation and encounter lifecycle
CREATE TABLE IF NOT EXISTS encounter (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organization(id),
  patient_id uuid NOT NULL,
  appointment_id uuid REFERENCES appointment(id),
  facility_id uuid REFERENCES facility(id),
  department_id uuid,
  clinician_id uuid NOT NULL REFERENCES app_user(id),
  encounter_type text NOT NULL DEFAULT 'outpatient' CHECK (encounter_type IN ('outpatient', 'inpatient', 'emergency', 'tumor_board', 'teleconsult')),
  status text NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'completed', 'amended', 'cancelled')),
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, id),
  FOREIGN KEY (org_id, patient_id) REFERENCES patient(org_id, id),
  FOREIGN KEY (org_id, department_id) REFERENCES department(org_id, id)
);
CREATE INDEX IF NOT EXISTS encounter_patient_idx ON encounter (org_id, patient_id, started_at);

CREATE TABLE IF NOT EXISTS encounter_participant (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organization(id),
  encounter_id uuid NOT NULL REFERENCES encounter(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES app_user(id),
  role text NOT NULL DEFAULT 'attending_oncologist',
  joined_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, encounter_id, user_id)
);

CREATE TABLE IF NOT EXISTS encounter_note_version (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organization(id),
  encounter_id uuid NOT NULL REFERENCES encounter(id) ON DELETE CASCADE,
  version integer NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'finalized', 'amended')),
  title text NOT NULL DEFAULT 'Consultation Note',
  chief_complaint text,
  history_present_illness text,
  clinical_assessment text,
  plan_and_instructions text,
  follow_up_instructions text,
  authored_by uuid NOT NULL REFERENCES app_user(id),
  finalized_by uuid REFERENCES app_user(id),
  finalized_at timestamptz,
  amendment_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, encounter_id, version)
);
CREATE INDEX IF NOT EXISTS encounter_note_version_idx ON encounter_note_version (org_id, encounter_id, version);

-- 5. Tumor Board operations
CREATE TABLE IF NOT EXISTS tumor_board_meeting (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organization(id),
  title text NOT NULL CHECK (length(btrim(title)) > 0),
  meeting_date date NOT NULL,
  start_time time NOT NULL,
  end_time time NOT NULL CHECK (end_time > start_time),
  location text NOT NULL CHECK (length(btrim(location)) > 0),
  status text NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'in_progress', 'completed', 'cancelled')),
  moderator_user_id uuid REFERENCES app_user(id),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, id)
);
CREATE INDEX IF NOT EXISTS tumor_board_meeting_idx ON tumor_board_meeting (org_id, meeting_date, status);

CREATE TABLE IF NOT EXISTS tumor_board_case (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organization(id),
  meeting_id uuid NOT NULL REFERENCES tumor_board_meeting(id) ON DELETE CASCADE,
  patient_id uuid NOT NULL,
  packet_id uuid REFERENCES consultation_packet(id),
  presenter_user_id uuid REFERENCES app_user(id),
  status text NOT NULL DEFAULT 'registered' CHECK (status IN ('registered', 'presented', 'deferred', 'concluded')),
  order_index integer NOT NULL DEFAULT 0,
  discussion_summary text,
  recommendation_notes text,
  clinical_staging text,
  checklist_histology_verified boolean NOT NULL DEFAULT false,
  checklist_imaging_verified boolean NOT NULL DEFAULT false,
  checklist_staging_verified boolean NOT NULL DEFAULT false,
  checklist_genomics_verified boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, meeting_id, patient_id),
  FOREIGN KEY (org_id, patient_id) REFERENCES patient(org_id, id)
);
CREATE INDEX IF NOT EXISTS tumor_board_case_idx ON tumor_board_case (org_id, meeting_id, order_index);

-- 6. Link opd_appointment_slot to appointment
ALTER TABLE opd_appointment_slot ADD COLUMN IF NOT EXISTS appointment_id uuid REFERENCES appointment(id);

-- 7. Extend admin_task for encounter linkage
ALTER TABLE admin_task ADD COLUMN IF NOT EXISTS origin_encounter_id uuid REFERENCES encounter(id);

-- Recreate task_must_have_source constraint with encounter origin
ALTER TABLE admin_task DROP CONSTRAINT IF EXISTS task_must_have_source;
ALTER TABLE admin_task ADD CONSTRAINT task_must_have_source CHECK (
  (origin_kind='evidence'   AND origin_evidence_fact_id IS NOT NULL) OR
  (origin_kind='record_gap' AND origin_record_gap_id    IS NOT NULL) OR
  (origin_kind='conflict'   AND origin_conflict_set_id  IS NOT NULL) OR
  (origin_kind='document'   AND origin_document_id      IS NOT NULL) OR
  (origin_kind='encounter'  AND origin_encounter_id     IS NOT NULL)
);

-- 8. Row-Level Security
ALTER TABLE clinic_session ENABLE ROW LEVEL SECURITY;
ALTER TABLE clinic_session FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON clinic_session;
CREATE POLICY tenant_isolation ON clinic_session
  USING (org_id = current_setting('app.org_id', true)::uuid)
  WITH CHECK (org_id = current_setting('app.org_id', true)::uuid);

ALTER TABLE clinician_unavailability ENABLE ROW LEVEL SECURITY;
ALTER TABLE clinician_unavailability FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON clinician_unavailability;
CREATE POLICY tenant_isolation ON clinician_unavailability
  USING (org_id = current_setting('app.org_id', true)::uuid)
  WITH CHECK (org_id = current_setting('app.org_id', true)::uuid);

ALTER TABLE appointment ENABLE ROW LEVEL SECURITY;
ALTER TABLE appointment FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON appointment;
CREATE POLICY tenant_isolation ON appointment
  USING (org_id = current_setting('app.org_id', true)::uuid)
  WITH CHECK (org_id = current_setting('app.org_id', true)::uuid);

ALTER TABLE appointment_status_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE appointment_status_history FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON appointment_status_history;
CREATE POLICY tenant_isolation ON appointment_status_history
  USING (org_id = current_setting('app.org_id', true)::uuid)
  WITH CHECK (org_id = current_setting('app.org_id', true)::uuid);

ALTER TABLE encounter ENABLE ROW LEVEL SECURITY;
ALTER TABLE encounter FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON encounter;
CREATE POLICY tenant_isolation ON encounter
  USING (org_id = current_setting('app.org_id', true)::uuid)
  WITH CHECK (org_id = current_setting('app.org_id', true)::uuid);

ALTER TABLE encounter_participant ENABLE ROW LEVEL SECURITY;
ALTER TABLE encounter_participant FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON encounter_participant;
CREATE POLICY tenant_isolation ON encounter_participant
  USING (org_id = current_setting('app.org_id', true)::uuid)
  WITH CHECK (org_id = current_setting('app.org_id', true)::uuid);

ALTER TABLE encounter_note_version ENABLE ROW LEVEL SECURITY;
ALTER TABLE encounter_note_version FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON encounter_note_version;
CREATE POLICY tenant_isolation ON encounter_note_version
  USING (org_id = current_setting('app.org_id', true)::uuid)
  WITH CHECK (org_id = current_setting('app.org_id', true)::uuid);

ALTER TABLE tumor_board_meeting ENABLE ROW LEVEL SECURITY;
ALTER TABLE tumor_board_meeting FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON tumor_board_meeting;
CREATE POLICY tenant_isolation ON tumor_board_meeting
  USING (org_id = current_setting('app.org_id', true)::uuid)
  WITH CHECK (org_id = current_setting('app.org_id', true)::uuid);

ALTER TABLE tumor_board_case ENABLE ROW LEVEL SECURITY;
ALTER TABLE tumor_board_case FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON tumor_board_case;
CREATE POLICY tenant_isolation ON tumor_board_case
  USING (org_id = current_setting('app.org_id', true)::uuid)
  WITH CHECK (org_id = current_setting('app.org_id', true)::uuid);

-- 9. Grants
GRANT SELECT, INSERT, UPDATE, DELETE ON clinic_session TO oncobrief_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON clinician_unavailability TO oncobrief_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON appointment TO oncobrief_app;
GRANT SELECT, INSERT, UPDATE ON appointment_status_history TO oncobrief_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON encounter TO oncobrief_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON encounter_participant TO oncobrief_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON encounter_note_version TO oncobrief_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON tumor_board_meeting TO oncobrief_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON tumor_board_case TO oncobrief_app;

RESET ROLE;
