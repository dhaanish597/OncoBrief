-- ===========================================================================
-- 0003_policies_grants.sql
--
-- Row-Level Security, the least-privilege grant surface, the append-only
-- guarantee, and the two narrowly-scoped auth bootstrap functions.
--
-- Failure direction is the point: `current_setting('app.org_id', true)`
-- returns NULL when unset, and `org_id = NULL` is never true, so a forgotten
-- set_config fails closed with zero rows rather than open with all rows
-- (architecture §14.1).
-- ===========================================================================

SET ROLE oncobrief_migrator;

-- ---------------------------------------------------------------------------
-- Tenant-scoped tables: ENABLE + FORCE + a single isolation policy.
-- FORCE closes the table-owner bypass so even the migrator cannot read across
-- tenants through a normal query.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  t text;
  tenant_tables text[] := ARRAY[
    'membership','patient','patient_identifier','document','document_page',
    'text_span','extraction_candidate','evidence_fact','evidence_span_link',
    'ledger_entry','evidence_state','conflict_set','conflict_member',
    'checklist_template','checklist_item','patient_checklist','record_gap',
    'record_readiness_snapshot','admin_task','task_event','consultation_packet',
    'packet_item','message_template','patient_message','message_variable_source',
    'message_outbox','audit_event','idempotency_key','extension_grant',
    'timeline_event'
  ];
BEGIN
  FOREACH t IN ARRAY tenant_tables LOOP
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

-- ---------------------------------------------------------------------------
-- Identity tables. ENABLE only (not FORCE): the migrator owns them and the
-- SECURITY DEFINER auth functions below must read them before a session
-- exists. The app role is still subject to the policies.
-- ---------------------------------------------------------------------------
ALTER TABLE organization ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS org_isolation ON organization;
CREATE POLICY org_isolation ON organization
  USING (id = current_setting('app.org_id', true)::uuid)
  WITH CHECK (id = current_setting('app.org_id', true)::uuid);

ALTER TABLE app_user ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS app_user_visibility ON app_user;
CREATE POLICY app_user_visibility ON app_user
  USING (
    id = current_setting('app.user_id', true)::uuid
    OR EXISTS (
      SELECT 1 FROM membership m
      WHERE m.user_id = app_user.id
        AND m.org_id = current_setting('app.org_id', true)::uuid
    )
  )
  WITH CHECK (id = current_setting('app.user_id', true)::uuid);

ALTER TABLE session ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS session_visibility ON session;
CREATE POLICY session_visibility ON session
  USING (user_id = current_setting('app.user_id', true)::uuid)
  WITH CHECK (org_id = current_setting('app.org_id', true)::uuid);

-- ---------------------------------------------------------------------------
-- Auth bootstrap. Narrowly scoped SECURITY DEFINER functions, because login
-- and session validation happen before app.org_id is known.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION auth_lookup_user(p_email text)
RETURNS TABLE (
  user_id uuid, email text, display_name text, password_hash text, is_active boolean,
  org_id uuid, org_slug text, org_name text, role text
)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT u.id, u.email, u.display_name, u.password_hash, u.is_active,
         m.org_id, o.slug, o.name, m.role
  FROM app_user u
  JOIN membership m ON m.user_id = u.id
  JOIN organization o ON o.id = m.org_id
  WHERE lower(u.email) = lower(p_email);
$$;
ALTER FUNCTION auth_lookup_user(text) OWNER TO oncobrief_migrator;

CREATE OR REPLACE FUNCTION auth_lookup_session(p_token_hash bytea)
RETURNS TABLE (
  session_id uuid, org_id uuid, user_id uuid, role text,
  expires_at timestamptz, revoked_at timestamptz, last_seen_at timestamptz
)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT s.id, s.org_id, s.user_id, s.role, s.expires_at, s.revoked_at, s.last_seen_at
  FROM session s
  WHERE s.token_hash = p_token_hash;
$$;
ALTER FUNCTION auth_lookup_session(bytea) OWNER TO oncobrief_migrator;

-- ---------------------------------------------------------------------------
-- Least-privilege grants to the runtime role.
-- ---------------------------------------------------------------------------
GRANT USAGE ON SCHEMA public TO oncobrief_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO oncobrief_app;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO oncobrief_app;

-- Infrastructure the app must not touch directly.
REVOKE ALL ON schema_migration, ledger_counter, audit_counter, user_totp FROM oncobrief_app;

-- Append-only tables: insert and select only. A bug, a careless migration or a
-- compromised handler cannot rewrite history (architecture §4.1).
REVOKE UPDATE, DELETE ON
  evidence_fact, ledger_entry, audit_event,
  extraction_candidate, task_event, message_outbox,
  record_readiness_snapshot, idempotency_key
FROM oncobrief_app;

-- Belt and braces: a row-level trigger that blocks mutation even for a role
-- that somehow holds the grant. TRUNCATE is unaffected, so demo reset works.
CREATE OR REPLACE FUNCTION oncobrief_block_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'append_only_table: % cannot be %', TG_TABLE_NAME, TG_OP
    USING ERRCODE = 'restrict_violation';
END $$;
ALTER FUNCTION oncobrief_block_mutation() OWNER TO oncobrief_migrator;

DROP TRIGGER IF EXISTS evidence_fact_append_only ON evidence_fact;
CREATE TRIGGER evidence_fact_append_only
  BEFORE UPDATE OR DELETE ON evidence_fact
  FOR EACH ROW EXECUTE FUNCTION oncobrief_block_mutation();

DROP TRIGGER IF EXISTS ledger_entry_append_only ON ledger_entry;
CREATE TRIGGER ledger_entry_append_only
  BEFORE UPDATE OR DELETE ON ledger_entry
  FOR EACH ROW EXECUTE FUNCTION oncobrief_block_mutation();

DROP TRIGGER IF EXISTS audit_event_append_only ON audit_event;
CREATE TRIGGER audit_event_append_only
  BEFORE UPDATE OR DELETE ON audit_event
  FOR EACH ROW EXECUTE FUNCTION oncobrief_block_mutation();

RESET ROLE;
