-- ===========================================================================
-- 0022_patient_portal_foundation.sql
--
-- Milestone M2 / MOB-006: Patient Portal Schema, RLS, and Authentication.
--
-- Supports:
-- 1. Patient & Caregiver authenticated sessions with cryptographically hashed tokens.
-- 2. Patient document review confirmations (strictly separate from clinician verification).
-- 3. Patient factual discrepancy flags (linked to coordinator/clinician reconciliation tasks).
-- 4. Consultation preparation workspace synchronization (checks, questions, notes).
-- 5. Time-bounded revocable share grants for second opinions and family caregivers.
-- 6. Rate-limited, single-use OTP challenge records.
--
-- Security Invariants:
-- - Tenant isolation: `org_id = portal_current_org_id()`.
-- - Patient isolation: `portal_is_authorized_patient_or_caregiver(patient_id)`.
-- - Fail-closed: missing patient context (NULL) returns ZERO rows for patient role.
-- - Staff access: explicit `portal_is_authorized_staff()` role check, never accidental NULL bypass.
-- - Sensitive patient data tables enforce ENABLE + FORCE ROW LEVEL SECURITY.
-- - Auth token lookup tables (session, share) use ENABLE ROW LEVEL SECURITY with migrator
--   SECURITY DEFINER lookup functions, mirroring the core session design in 0003_policies_grants.sql.
-- ===========================================================================

SET ROLE oncobrief_migrator;

-- ---------------------------------------------------------------------------
-- 0. Helper functions for fail-closed RLS in public schema
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION portal_current_org_id()
RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('app.org_id', true), '')::uuid;
$$;

CREATE OR REPLACE FUNCTION portal_current_patient_id()
RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('app.current_patient_id', true), '')::uuid;
$$;

CREATE OR REPLACE FUNCTION portal_actor_role()
RETURNS text LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('app.actor_role', true), '');
$$;

CREATE OR REPLACE FUNCTION portal_is_authorized_staff()
RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT (
    portal_current_org_id() IS NOT NULL
    AND current_setting('app.role', true) IN (
      'clinician', 'coordinator', 'records_officer', 'org_admin',
      'auditor', 'receptionist', 'platform_admin', 'tumor_board_coordinator'
    )
  );
$$;

CREATE OR REPLACE FUNCTION portal_is_authorized_patient_or_caregiver(p_patient_id uuid)
RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT (
    portal_current_org_id() IS NOT NULL
    AND portal_current_patient_id() IS NOT NULL
    AND portal_current_patient_id() = p_patient_id
    AND portal_actor_role() IN ('patient', 'caregiver')
  );
$$;

-- ---------------------------------------------------------------------------
-- 1. Patient / Caregiver Portal Sessions
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS patient_portal_session (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  patient_id uuid NOT NULL,
  actor_role text NOT NULL CHECK (actor_role IN ('patient', 'caregiver')),
  caregiver_contact_id uuid,
  token_sha256 text NOT NULL UNIQUE,
  granted_scopes text[] NOT NULL DEFAULT ARRAY['appointments','reminders','documents','preparation']::text[],
  device_label text,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, id),
  FOREIGN KEY (org_id, patient_id) REFERENCES patient(org_id, id) ON DELETE CASCADE,
  FOREIGN KEY (org_id, caregiver_contact_id) REFERENCES caregiver_contact(org_id, id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_patient_portal_session_lookup
  ON patient_portal_session (org_id, patient_id, token_sha256)
  WHERE revoked_at IS NULL;

-- ---------------------------------------------------------------------------
-- 2. Patient Document Review Confirmations (Distinct from clinician verification)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS patient_document_review (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  patient_id uuid NOT NULL,
  document_id uuid NOT NULL,
  review_status text NOT NULL CHECK (review_status IN ('unreviewed', 'confirmed_by_patient', 'discrepancy_flagged')),
  reviewed_by_role text NOT NULL CHECK (reviewed_by_role IN ('patient', 'caregiver')),
  note text,
  reviewed_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, id),
  UNIQUE (org_id, patient_id, document_id),
  FOREIGN KEY (org_id, patient_id) REFERENCES patient(org_id, id) ON DELETE CASCADE,
  FOREIGN KEY (org_id, document_id) REFERENCES document(org_id, id) ON DELETE CASCADE
);

-- ---------------------------------------------------------------------------
-- 3. Patient Factual Discrepancy Flags (Links to Coordinator / Clinician Task)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS patient_discrepancy_flag (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  patient_id uuid NOT NULL,
  document_id uuid NOT NULL,
  linked_task_id uuid,
  field_name text NOT NULL CHECK (field_name IN ('date', 'facility', 'summary', 'lab_value', 'missing_page', 'other')),
  patient_reason text NOT NULL CHECK (char_length(patient_reason) BETWEEN 3 AND 1000),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'acknowledged', 'resolved', 'dismissed')),
  resolution_note text,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, id),
  FOREIGN KEY (org_id, patient_id) REFERENCES patient(org_id, id) ON DELETE CASCADE,
  FOREIGN KEY (org_id, document_id) REFERENCES document(org_id, id) ON DELETE CASCADE,
  FOREIGN KEY (org_id, linked_task_id) REFERENCES admin_task(org_id, id) ON DELETE SET NULL
);

-- ---------------------------------------------------------------------------
-- 4. Patient Consultation Preparation Workspace State
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS patient_preparation_state (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  patient_id uuid NOT NULL,
  appointment_id uuid,
  checks_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  questions_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  symptom_notes text NOT NULL DEFAULT '' CHECK (char_length(symptom_notes) <= 4000),
  companion_name text NOT NULL DEFAULT '' CHECK (char_length(companion_name) <= 200),
  pack_selected_document_ids uuid[] NOT NULL DEFAULT ARRAY[]::uuid[],
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, id),
  UNIQUE (org_id, patient_id),
  FOREIGN KEY (org_id, patient_id) REFERENCES patient(org_id, id) ON DELETE CASCADE,
  FOREIGN KEY (org_id, appointment_id) REFERENCES appointment(org_id, id) ON DELETE SET NULL
);

-- ---------------------------------------------------------------------------
-- 5. Time-Bounded Revocable Consultation Share Grants
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS patient_share_grant (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  patient_id uuid NOT NULL,
  recipient_label text NOT NULL CHECK (char_length(recipient_label) BETWEEN 1 AND 200),
  recipient_role text NOT NULL CHECK (recipient_role IN ('caregiver', 'second_opinion_clinician', 'self_print')),
  shared_document_ids uuid[] NOT NULL DEFAULT ARRAY[]::uuid[],
  include_questions boolean NOT NULL DEFAULT true,
  share_token_sha256 text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, id),
  FOREIGN KEY (org_id, patient_id) REFERENCES patient(org_id, id) ON DELETE CASCADE
);

-- ---------------------------------------------------------------------------
-- 6. Rate-Limited, Single-Use OTP Challenges
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS patient_otp_challenge (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  patient_id uuid NOT NULL,
  identifier_value text NOT NULL,
  otp_hash text NOT NULL,
  attempts integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 3,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, id),
  FOREIGN KEY (org_id, patient_id) REFERENCES patient(org_id, id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_patient_otp_lookup
  ON patient_otp_challenge (org_id, patient_id, identifier_value)
  WHERE consumed_at IS NULL;

-- ---------------------------------------------------------------------------
-- 7. Row-Level Security
-- Patient data tables enforce ENABLE + FORCE.
-- Bootstrap token tables (session, share) enforce ENABLE without FORCE, allowing
-- migrator-owned SECURITY DEFINER lookup functions to execute before session context is set.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  tbl text;
  forced_tables text[] := ARRAY[
    'patient_document_review',
    'patient_discrepancy_flag',
    'patient_preparation_state',
    'patient_otp_challenge'
  ];
  auth_tables text[] := ARRAY[
    'patient_portal_session',
    'patient_share_grant'
  ];
BEGIN
  FOREACH tbl IN ARRAY forced_tables LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', tbl);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', tbl);
    EXECUTE format('DROP POLICY IF EXISTS %I_isolation ON %I', tbl, tbl);
    EXECUTE format(
      'CREATE POLICY %I_isolation ON %I '
      'USING ('
      '  org_id = portal_current_org_id() '
      '  AND ('
      '    portal_is_authorized_patient_or_caregiver(patient_id) '
      '    OR portal_is_authorized_staff()'
      '  )'
      ') '
      'WITH CHECK ('
      '  org_id = portal_current_org_id() '
      '  AND ('
      '    portal_is_authorized_patient_or_caregiver(patient_id) '
      '    OR portal_is_authorized_staff()'
      '  )'
      ')',
      tbl, tbl
    );
  END LOOP;

  FOREACH tbl IN ARRAY auth_tables LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', tbl);
    EXECUTE format('ALTER TABLE %I NO FORCE ROW LEVEL SECURITY', tbl);
    EXECUTE format('DROP POLICY IF EXISTS %I_isolation ON %I', tbl, tbl);
    EXECUTE format(
      'CREATE POLICY %I_isolation ON %I '
      'USING ('
      '  org_id = portal_current_org_id() '
      '  AND ('
      '    portal_is_authorized_patient_or_caregiver(patient_id) '
      '    OR portal_is_authorized_staff()'
      '  )'
      ') '
      'WITH CHECK ('
      '  org_id = portal_current_org_id() '
      '  AND ('
      '    portal_is_authorized_patient_or_caregiver(patient_id) '
      '    OR portal_is_authorized_staff()'
      '  )'
      ')',
      tbl, tbl
    );
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 8. Narrowly Scoped SECURITY DEFINER Auth Bootstrap Functions
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION portal_lookup_session(p_token_sha256 text)
RETURNS TABLE (
  session_id uuid,
  org_id uuid,
  patient_id uuid,
  actor_role text,
  caregiver_contact_id uuid,
  granted_scopes text[],
  expires_at timestamptz,
  revoked_at timestamptz,
  last_seen_at timestamptz
)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT s.id, s.org_id, s.patient_id, s.actor_role,
         s.caregiver_contact_id, s.granted_scopes,
         s.expires_at, s.revoked_at, s.last_seen_at
  FROM patient_portal_session s
  WHERE s.token_sha256 = p_token_sha256;
$$;
ALTER FUNCTION portal_lookup_session(text) OWNER TO oncobrief_migrator;

CREATE OR REPLACE FUNCTION portal_lookup_share(p_share_token_sha256 text)
RETURNS TABLE (
  grant_id uuid,
  org_id uuid,
  patient_id uuid,
  recipient_label text,
  recipient_role text,
  shared_document_ids uuid[],
  include_questions boolean,
  expires_at timestamptz,
  revoked_at timestamptz
)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT g.id, g.org_id, g.patient_id, g.recipient_label,
         g.recipient_role, g.shared_document_ids, g.include_questions,
         g.expires_at, g.revoked_at
  FROM patient_share_grant g
  WHERE g.share_token_sha256 = p_share_token_sha256;
$$;
ALTER FUNCTION portal_lookup_share(text) OWNER TO oncobrief_migrator;

-- ---------------------------------------------------------------------------
-- 9. Grants for application runtime role
-- ---------------------------------------------------------------------------
GRANT SELECT, INSERT, UPDATE, DELETE ON
  patient_portal_session,
  patient_document_review,
  patient_discrepancy_flag,
  patient_preparation_state,
  patient_share_grant,
  patient_otp_challenge
TO oncobrief_app;

GRANT EXECUTE ON FUNCTION portal_lookup_session(text) TO oncobrief_app;
GRANT EXECUTE ON FUNCTION portal_lookup_share(text) TO oncobrief_app;
GRANT EXECUTE ON FUNCTION portal_current_org_id() TO oncobrief_app;
GRANT EXECUTE ON FUNCTION portal_current_patient_id() TO oncobrief_app;
GRANT EXECUTE ON FUNCTION portal_actor_role() TO oncobrief_app;
GRANT EXECUTE ON FUNCTION portal_is_authorized_staff() TO oncobrief_app;
GRANT EXECUTE ON FUNCTION portal_is_authorized_patient_or_caregiver(uuid) TO oncobrief_app;

RESET ROLE;
