-- ===========================================================================
-- 0018_task_origin_encounter.sql
--
-- Adds 'encounter' value to task_origin_kind enum.
-- Must be committed before being referenced in constraints.
-- ===========================================================================

SET ROLE oncobrief_migrator;

ALTER TYPE task_origin_kind ADD VALUE IF NOT EXISTS 'encounter';

RESET ROLE;
