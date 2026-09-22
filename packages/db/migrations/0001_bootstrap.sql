-- ===========================================================================
-- 0001_bootstrap.sql
--
-- Roles, extensions and infrastructure that must exist before any table.
-- Runs as a superuser; every statement is idempotent so a re-run is a no-op.
--
-- Privilege model (architecture §4.1, §14):
--   oncobrief_migrator  owns the schema. DDL only. Used by `pnpm db:migrate`.
--   oncobrief_app       the runtime role. Subject to RLS, and holds no
--                       UPDATE/DELETE grant on the append-only tables.
-- ===========================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$
BEGIN
  -- The migrator owns the schema and is the SET ROLE target for DDL. It is
  -- NOLOGIN: DDL runs through the bootstrap superuser assuming this role.
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'oncobrief_migrator') THEN
    CREATE ROLE oncobrief_migrator NOLOGIN;
  END IF;
  -- The runtime role. Dev password only; production uses a managed credential
  -- or IAM auth. Subject to RLS and to the append-only grant restrictions.
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'oncobrief_app') THEN
    CREATE ROLE oncobrief_app LOGIN PASSWORD 'oncobrief_app';
  END IF;
END $$;

-- Migrator owns what it creates.
ALTER SCHEMA public OWNER TO oncobrief_migrator;
GRANT CREATE, USAGE ON SCHEMA public TO oncobrief_migrator;
GRANT USAGE ON SCHEMA public TO oncobrief_app;
GRANT CONNECT ON DATABASE oncobrief TO oncobrief_app, oncobrief_migrator;

-- ---------------------------------------------------------------------------
-- Migration bookkeeping
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS schema_migration (
  id          text PRIMARY KEY,
  applied_at  timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE schema_migration OWNER TO oncobrief_migrator;

-- ---------------------------------------------------------------------------
-- Per-org monotonic sequence counters.
--
-- `seq` is allocated inside the same transaction as the insert using a row
-- lock on these tables, so the ledger and audit chains are gap-free and
-- totally ordered (architecture §4.4).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ledger_counter (
  org_id    uuid PRIMARY KEY,
  next_seq  bigint NOT NULL DEFAULT 1
);
ALTER TABLE ledger_counter OWNER TO oncobrief_migrator;

CREATE TABLE IF NOT EXISTS audit_counter (
  org_id    uuid PRIMARY KEY,
  next_seq  bigint NOT NULL DEFAULT 1
);
ALTER TABLE audit_counter OWNER TO oncobrief_migrator;

CREATE OR REPLACE FUNCTION oncobrief_next_ledger_seq(p_org uuid) RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v bigint;
BEGIN
  INSERT INTO ledger_counter(org_id, next_seq) VALUES (p_org, 2)
  ON CONFLICT (org_id) DO UPDATE SET next_seq = ledger_counter.next_seq + 1
  RETURNING next_seq - 1 INTO v;
  RETURN v;
END $$;
ALTER FUNCTION oncobrief_next_ledger_seq(uuid) OWNER TO oncobrief_migrator;

CREATE OR REPLACE FUNCTION oncobrief_next_audit_seq(p_org uuid) RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v bigint;
BEGIN
  INSERT INTO audit_counter(org_id, next_seq) VALUES (p_org, 2)
  ON CONFLICT (org_id) DO UPDATE SET next_seq = audit_counter.next_seq + 1
  RETURNING next_seq - 1 INTO v;
  RETURN v;
END $$;
ALTER FUNCTION oncobrief_next_audit_seq(uuid) OWNER TO oncobrief_migrator;
