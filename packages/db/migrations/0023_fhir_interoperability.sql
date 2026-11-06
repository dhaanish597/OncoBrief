-- ===========================================================================
-- 0023_fhir_interoperability.sql
--
-- Milestone Phase 07B: Bidirectional FHIR R4 Interoperability & System Registry
--
-- Supports:
-- 1. External FHIR R4 HIS/EMR endpoint registry with security policies & allowlists.
-- 2. External FHIR resource mapping & structured-resource provenance links.
-- 3. Idempotent inbound/outbound FHIR exchange transaction audit history.
--
-- Invariants:
-- - Strict multi-tenant isolation via PostgreSQL Row-Level Security.
-- - Immutable Evidence Ledger facts remain unmutated; FHIR mappings attach via foreign keys.
-- - Structured FHIR resources preserve raw element pointers rather than fabricating OCR boxes.
-- ===========================================================================

SET ROLE oncobrief_migrator;

-- ---------------------------------------------------------------------------
-- 1. External FHIR Endpoint Registry
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS fhir_endpoint_registry (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id             uuid NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  name               text NOT NULL,
  base_url           text NOT NULL,
  auth_kind          text NOT NULL CHECK (auth_kind IN ('none', 'bearer', 'basic', 'smart_on_fhir', 'mTLS')),
  auth_config        jsonb NOT NULL DEFAULT '{}',
  allowed_operations text[] NOT NULL DEFAULT ARRAY['read', 'search', 'create', 'update', 'bundle'],
  is_active          boolean NOT NULL DEFAULT true,
  is_trusted         boolean NOT NULL DEFAULT false,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, name)
);

-- ---------------------------------------------------------------------------
-- 2. FHIR Resource Link & Structured Provenance
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS fhir_resource_link (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                uuid NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  patient_id            uuid NOT NULL REFERENCES patient(id) ON DELETE CASCADE,
  endpoint_id           uuid REFERENCES fhir_endpoint_registry(id) ON DELETE SET NULL,
  resource_type         text NOT NULL,
  external_resource_id  text NOT NULL,
  version_id            text,
  system_url            text,
  internal_entity_kind  text NOT NULL CHECK (internal_entity_kind IN ('evidence_fact', 'document', 'consultation_packet', 'clinical_encounter')),
  internal_entity_id    uuid NOT NULL,
  element_path          text,
  raw_resource_sha256   text NOT NULL,
  created_at            timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, endpoint_id, resource_type, external_resource_id)
);

-- ---------------------------------------------------------------------------
-- 3. FHIR Exchange Transactions (Idempotency & Auditable Transfer State)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS fhir_exchange_transaction (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                 uuid NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  patient_id             uuid REFERENCES patient(id) ON DELETE CASCADE,
  endpoint_id            uuid REFERENCES fhir_endpoint_registry(id) ON DELETE SET NULL,
  direction              text NOT NULL CHECK (direction IN ('INBOUND_IMPORT', 'OUTBOUND_EXPORT')),
  bundle_type            text NOT NULL DEFAULT 'document',
  transaction_status     text NOT NULL CHECK (transaction_status IN ('INITIATED', 'COMPLETED', 'FAILED', 'REJECTED')),
  idempotency_key        text NOT NULL,
  resources_count        integer NOT NULL DEFAULT 0,
  request_payload_sha256 text NOT NULL,
  response_payload_sha256 text,
  error_code             text,
  error_message          text,
  created_at             timestamptz NOT NULL DEFAULT now(),
  completed_at           timestamptz,
  UNIQUE (org_id, idempotency_key)
);

-- ---------------------------------------------------------------------------
-- 4. Indices for Fast Tenant and Patient Querying
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_fhir_registry_org ON fhir_endpoint_registry(org_id);
CREATE INDEX IF NOT EXISTS idx_fhir_resource_link_patient ON fhir_resource_link(org_id, patient_id);
CREATE INDEX IF NOT EXISTS idx_fhir_resource_link_entity ON fhir_resource_link(internal_entity_kind, internal_entity_id);
CREATE INDEX IF NOT EXISTS idx_fhir_exchange_tx_patient ON fhir_exchange_transaction(org_id, patient_id);

-- ---------------------------------------------------------------------------
-- 5. Row-Level Security Policies (Tenant Isolation)
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  t text;
  fhir_tables text[] := ARRAY[
    'fhir_endpoint_registry',
    'fhir_resource_link',
    'fhir_exchange_transaction'
  ];
BEGIN
  FOREACH t IN ARRAY fhir_tables LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I '
      'USING (org_id = NULLIF(current_setting(''app.org_id'', true), '''')::uuid) '
      'WITH CHECK (org_id = NULLIF(current_setting(''app.org_id'', true), '''')::uuid)',
      t
    );
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 6. Grants for Runtime Application Role
-- ---------------------------------------------------------------------------
GRANT SELECT, INSERT, UPDATE, DELETE ON
  fhir_endpoint_registry,
  fhir_resource_link,
  fhir_exchange_transaction
TO oncobrief_app;

RESET ROLE;
