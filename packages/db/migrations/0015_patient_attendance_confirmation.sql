-- ===========================================================================
-- 0015_patient_attendance_confirmation.sql
--
-- Phase 5: Cancer Patient & Caregiver Voice Continuity, Consented Caregiver
-- Lifecycle, and Administrative Attendance Confirmation.
-- ===========================================================================

SET ROLE oncobrief_migrator;

-- 1. Create attendance response enum
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'attendance_response_status') THEN
    CREATE TYPE attendance_response_status AS ENUM (
      'confirmed_attendance',
      'cannot_attend',
      'needs_coordinator_assistance',
      'no_response'
    );
  END IF;
END$$;

-- 2. Extend patient_message with attendance tracking fields
ALTER TABLE patient_message
  ADD COLUMN IF NOT EXISTS attendance_status attendance_response_status NOT NULL DEFAULT 'no_response',
  ADD COLUMN IF NOT EXISTS attendance_recorded_at timestamptz,
  ADD COLUMN IF NOT EXISTS attendance_channel text,
  ADD COLUMN IF NOT EXISTS attendance_responder text,
  ADD COLUMN IF NOT EXISTS attendance_note text;

-- 3. Extend caregiver_contact with explicit revocation and reminder sync fields
ALTER TABLE caregiver_contact
  ADD COLUMN IF NOT EXISTS revoked_at timestamptz,
  ADD COLUMN IF NOT EXISTS revoked_by uuid,
  ADD COLUMN IF NOT EXISTS sync_reminders boolean NOT NULL DEFAULT true;

-- Add foreign key constraint for revoked_by if not present
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'caregiver_contact_revoked_by_fkey'
  ) THEN
    ALTER TABLE caregiver_contact
      ADD CONSTRAINT caregiver_contact_revoked_by_fkey
      FOREIGN KEY (org_id, revoked_by) REFERENCES membership(org_id, user_id);
  END IF;
END$$;

RESET ROLE;
