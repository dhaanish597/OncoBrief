-- Migration 0017: Allow org_admin, platform_admin, and invitation activation to insert/manage app_user
DROP POLICY IF EXISTS app_user_visibility ON app_user;
CREATE POLICY app_user_visibility ON app_user
  USING (
    id = NULLIF(current_setting('app.user_id', true), '')::uuid
    OR NULLIF(current_setting('app.role', true), '') IN ('org_admin', 'platform_admin')
    OR EXISTS (
      SELECT 1 FROM membership m
      WHERE m.user_id = app_user.id
        AND m.org_id = NULLIF(current_setting('app.org_id', true), '')::uuid
    )
  )
  WITH CHECK (
    id = NULLIF(current_setting('app.user_id', true), '')::uuid
    OR NULLIF(current_setting('app.role', true), '') IN ('org_admin', 'platform_admin')
    OR NULLIF(current_setting('app.user_id', true), '') IS NULL
  );
