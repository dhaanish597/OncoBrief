-- ===========================================================================
-- 0004_auth_bootstrap_membership.sql
--
-- `membership` was created with FORCE ROW LEVEL SECURITY in 0003. That closed
-- the table-owner bypass, which is what we want for every tenant data table —
-- but it also blocked the auth bootstrap, because `auth_lookup_user()` runs
-- SECURITY DEFINER as the owner *before* any tenant context exists, and its
-- JOIN to `membership` was therefore filtered to zero rows. Login could never
-- succeed.
--
-- Fix: treat `membership` like the other identity tables (`organization`,
-- `app_user`, `session`), which are ENABLE-only. The application role is still
-- subject to the isolation policy, so every real request path stays scoped; the
-- bypass is available only to the migrator-owned SECURITY DEFINER functions
-- that must run pre-session.
--
-- Note this is a narrow, deliberate exception, not a weakening of tenant
-- isolation for patient data: `patient`, `document`, `evidence_fact`,
-- `ledger_entry`, `audit_event` and every other tenant-scoped table keep FORCE
-- and are covered by the isolation tests.
-- ===========================================================================

SET ROLE oncobrief_migrator;

ALTER TABLE membership NO FORCE ROW LEVEL SECURITY;

-- The isolation policy remains in force for non-owner roles.
DROP POLICY IF EXISTS tenant_isolation ON membership;
CREATE POLICY tenant_isolation ON membership
  USING (org_id = current_setting('app.org_id', true)::uuid)
  WITH CHECK (org_id = current_setting('app.org_id', true)::uuid);

RESET ROLE;
