-- Consent withdrawal restricts source access without mutating the append-only ledger.
SET ROLE oncobrief_migrator;
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['evidence_fact','text_span','document_page','extraction_candidate','timeline_event'] LOOP
    EXECUTE format(
      'CREATE POLICY abdm_source_access ON %I AS RESTRICTIVE FOR SELECT TO oncobrief_app '
      'USING (NOT EXISTS (SELECT 1 FROM document d WHERE d.id = %I.document_id '
      'AND d.ingest_error = ''consent_revoked_or_expired''))', t, t
    );
  END LOOP;
END $$;
RESET ROLE;
