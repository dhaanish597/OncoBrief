-- ===========================================================================
-- 0016_foundation_users_clinicians_patients.sql
--
-- Milestone A: Core relational foundation for persistent multi-user oncology
-- operations: Facilities, Departments, Clinician Profiles, User Invitations,
-- Patient Demographics & Care Teams, with strict tenant isolation and RLS.
-- ===========================================================================

SET ROLE oncobrief_migrator;

-- 1. Update membership role CHECK constraint to include receptionist, platform_admin, tumor_board_coordinator
ALTER TABLE membership DROP CONSTRAINT IF EXISTS membership_role_check;
ALTER TABLE membership ADD CONSTRAINT membership_role_check
  CHECK (role IN ('clinician','coordinator','records_officer','org_admin','auditor','receptionist','platform_admin','tumor_board_coordinator'));

-- 2. Facilities
CREATE TABLE IF NOT EXISTS facility (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organization(id),
  name text NOT NULL CHECK (length(btrim(name)) > 0),
  code text NOT NULL CHECK (length(btrim(code)) > 0),
  address text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, id),
  UNIQUE (org_id, code)
);

-- 3. Departments
CREATE TABLE IF NOT EXISTS department (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organization(id),
  facility_id uuid,
  name text NOT NULL CHECK (length(btrim(name)) > 0),
  code text NOT NULL CHECK (length(btrim(code)) > 0),
  specialty text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, id),
  UNIQUE (org_id, code),
  FOREIGN KEY (org_id, facility_id) REFERENCES facility(org_id, id) ON DELETE SET NULL
);

-- 4. Clinician profiles
CREATE TABLE IF NOT EXISTS clinician_profile (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organization(id),
  user_id uuid NOT NULL REFERENCES app_user(id),
  specialty text NOT NULL CHECK (length(btrim(specialty)) > 0),
  sub_specialty text,
  license_number text,
  department_id uuid,
  consultation_room text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, id),
  UNIQUE (org_id, user_id),
  FOREIGN KEY (org_id, department_id) REFERENCES department(org_id, id) ON DELETE SET NULL
);

-- 5. User invitations & activation state
CREATE TABLE IF NOT EXISTS user_invitation (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organization(id),
  email text NOT NULL CHECK (length(btrim(email)) > 0),
  display_name text NOT NULL CHECK (length(btrim(display_name)) > 0),
  role text NOT NULL CHECK (role IN ('clinician','coordinator','records_officer','org_admin','auditor','receptionist','platform_admin','tumor_board_coordinator')),
  department_id uuid,
  specialty text,
  token text NOT NULL UNIQUE,
  invited_by uuid NOT NULL REFERENCES app_user(id),
  expires_at timestamptz NOT NULL,
  accepted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, id),
  FOREIGN KEY (org_id, department_id) REFERENCES department(org_id, id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS user_invitation_email_idx ON user_invitation(org_id, lower(email));

-- 6. Extend Patient demographics & status
ALTER TABLE patient
  ADD COLUMN IF NOT EXISTS dob date,
  ADD COLUMN IF NOT EXISTS gender text CHECK (gender IS NULL OR gender IN ('female', 'male', 'other', 'unknown')),
  ADD COLUMN IF NOT EXISTS phone text,
  ADD COLUMN IF NOT EXISTS email text,
  ADD COLUMN IF NOT EXISTS address text,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived', 'transferred', 'inactive')),
  ADD COLUMN IF NOT EXISTS referral_source text,
  ADD COLUMN IF NOT EXISTS referral_notes text,
  ADD COLUMN IF NOT EXISTS primary_clinician_id uuid REFERENCES app_user(id),
  ADD COLUMN IF NOT EXISTS department_id uuid,
  ADD COLUMN IF NOT EXISTS facility_id uuid,
  ADD COLUMN IF NOT EXISTS archived_at timestamptz,
  ADD COLUMN IF NOT EXISTS archived_by uuid REFERENCES app_user(id),
  ADD COLUMN IF NOT EXISTS archival_reason text;

-- Add foreign keys for patient department and facility
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'patient_department_fkey'
  ) THEN
    ALTER TABLE patient
      ADD CONSTRAINT patient_department_fkey
      FOREIGN KEY (org_id, department_id) REFERENCES department(org_id, id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'patient_facility_fkey'
  ) THEN
    ALTER TABLE patient
      ADD CONSTRAINT patient_facility_fkey
      FOREIGN KEY (org_id, facility_id) REFERENCES facility(org_id, id) ON DELETE SET NULL;
  END IF;
END$$;

-- 7. Patient care team assignments
CREATE TABLE IF NOT EXISTS patient_care_team (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organization(id),
  patient_id uuid NOT NULL,
  user_id uuid NOT NULL REFERENCES app_user(id),
  role_in_team text NOT NULL DEFAULT 'primary_oncologist' CHECK (role_in_team IN ('primary_oncologist', 'consulting_oncologist', 'radiation_oncologist', 'surgical_oncologist', 'care_coordinator', 'nurse', 'records_officer')),
  is_active boolean NOT NULL DEFAULT true,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  assigned_by uuid REFERENCES app_user(id),
  notes text,
  UNIQUE (org_id, id),
  UNIQUE (org_id, patient_id, user_id),
  FOREIGN KEY (org_id, patient_id) REFERENCES patient(org_id, id)
);
CREATE INDEX IF NOT EXISTS patient_care_team_patient_idx ON patient_care_team(org_id, patient_id);
CREATE INDEX IF NOT EXISTS patient_care_team_user_idx ON patient_care_team(org_id, user_id);

-- 8. Row-Level Security: ENABLE, FORCE and Isolation Policies
DO $$
DECLARE
  t text;
  new_tenant_tables text[] := ARRAY[
    'facility', 'department', 'clinician_profile', 'user_invitation', 'patient_care_team'
  ];
BEGIN
  FOREACH t IN ARRAY new_tenant_tables LOOP
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

-- 9. Runtime Grants
GRANT SELECT, INSERT, UPDATE, DELETE ON facility, department, clinician_profile, user_invitation, patient_care_team TO oncobrief_app;

RESET ROLE;
