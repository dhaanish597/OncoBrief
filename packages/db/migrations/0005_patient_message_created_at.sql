-- ===========================================================================
-- 0005_patient_message_created_at.sql
--
-- `patient_message` was created without a `created_at` column, but the
-- continuity read model orders and displays messages by composition time.
-- Added here rather than by editing 0002, because 0002 is already applied.
-- ===========================================================================

SET ROLE oncobrief_migrator;

ALTER TABLE patient_message
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();

GRANT SELECT, INSERT, UPDATE, DELETE ON patient_message TO oncobrief_app;

RESET ROLE;
