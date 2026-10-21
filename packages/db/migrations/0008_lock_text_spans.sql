-- ---------------------------------------------------------------------------
-- Migration 0008: Make text_span strictly append-only (Task 1.1)
--
-- 1. Revoke UPDATE, DELETE, and TRUNCATE on text_span from oncobrief_app;
--    keep SELECT, INSERT.
-- 2. Create PL/pgSQL function prevent_text_span_mutation() and trigger
--    trg_text_span_immutable (BEFORE UPDATE OR DELETE ON text_span FOR EACH ROW)
--    raising SQLSTATE 42501 on any UPDATE, and on any DELETE where the parent
--    document_page row still exists.
-- ---------------------------------------------------------------------------

REVOKE UPDATE, DELETE, TRUNCATE ON text_span FROM oncobrief_app;

CREATE OR REPLACE FUNCTION prevent_text_span_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'Provenance violation: text_span rows are immutable'
      USING ERRCODE = '42501';
  ELSIF TG_OP = 'DELETE' THEN
    IF EXISTS (SELECT 1 FROM document_page WHERE id = OLD.page_id) THEN
      RAISE EXCEPTION 'Provenance violation: text_span rows are immutable'
        USING ERRCODE = '42501';
    END IF;
    RETURN OLD;
  END IF;
  RETURN NEW;
END $$;

ALTER FUNCTION prevent_text_span_mutation() OWNER TO oncobrief_migrator;

DROP TRIGGER IF EXISTS trg_text_span_immutable ON text_span;
CREATE TRIGGER trg_text_span_immutable
  BEFORE UPDATE OR DELETE ON text_span
  FOR EACH ROW EXECUTE FUNCTION prevent_text_span_mutation();
