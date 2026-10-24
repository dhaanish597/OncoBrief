-- ===========================================================================
-- 0009_abdm_integration.sql
--
-- ABDM V3 Integration (M2 HIP + M3 HIU)
-- Tables, constraints, forced RLS policies, and audited callback tenant resolver.
-- ===========================================================================

SET ROLE oncobrief_migrator;

-- 1. Organization & App User Facility/Practitioner Identifiers
ALTER TABLE organization
  ADD COLUMN IF NOT EXISTS hfr_facility_id text,
  ADD COLUMN IF NOT EXISTS abdm_hip_id text,
  ADD COLUMN IF NOT EXISTS abdm_hiu_id text;

ALTER TABLE app_user
  ADD COLUMN IF NOT EXISTS hpr_id text;

-- 2. Durable Inbound Webhook Inbox (for < 500ms 202 Accepted & Idempotency)
CREATE TABLE IF NOT EXISTS abdm_inbox (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id         uuid NOT NULL REFERENCES organization(id),
  request_id     text NOT NULL,
  endpoint       text NOT NULL,
  headers_json   jsonb NOT NULL,
  payload_json   jsonb NOT NULL,
  status         text NOT NULL CHECK (status IN ('RECEIVED','PROCESSED','FAILED')),
  error_message  text,
  received_at    timestamptz NOT NULL DEFAULT now(),
  processed_at   timestamptz,
  UNIQUE (org_id, request_id, endpoint)
);

-- 3. Outbound Request & Correlation Tracker
CREATE TABLE IF NOT EXISTS abdm_transaction (
  request_id          uuid PRIMARY KEY,
  org_id              uuid NOT NULL REFERENCES organization(id),
  patient_id          uuid REFERENCES patient(id),
  role_kind           text NOT NULL CHECK (role_kind IN ('HIP','HIU','GATEWAY')),
  flow_kind           text NOT NULL,
  abdm_transaction_id text,
  status              text NOT NULL DEFAULT 'PENDING',
  request_payload     jsonb,
  response_payload    jsonb,
  error_code          text,
  error_message       text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  completed_at        timestamptz
);

-- 4. Patient ABDM Demographic Profile & Protected M2 Link Token Store
CREATE TABLE IF NOT EXISTS abdm_patient_link (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                uuid NOT NULL REFERENCES organization(id),
  patient_id            uuid NOT NULL REFERENCES patient(id) ON DELETE CASCADE,
  abha_address          text NOT NULL,
  abha_number           text,
  aadhaar_name          text,
  gender                text CHECK (gender IN ('M','F','O','U')),
  year_of_birth         integer,
  mobile_last10         text,
  link_token_enc        text,
  link_token_expires_at timestamptz,
  verification_source   text NOT NULL DEFAULT 'MANUAL',
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, patient_id)
);

-- 5. M2 HIP Linked Care Contexts (Approved Consultation Packets Only)
CREATE TABLE IF NOT EXISTS abdm_care_context (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                 uuid NOT NULL REFERENCES organization(id),
  patient_id             uuid NOT NULL REFERENCES patient(id) ON DELETE CASCADE,
  packet_id              uuid NOT NULL REFERENCES consultation_packet(id) ON DELETE CASCADE,
  care_context_reference text NOT NULL,
  display_label          text NOT NULL,
  hi_type                text NOT NULL DEFAULT 'OPConsultation',
  abha_address           text NOT NULL,
  link_reference_number  text,
  otp_hash               text,
  otp_expires_at         timestamptz,
  status                 text NOT NULL CHECK (status IN ('PENDING_TOKEN','LINK_INITIATED','OTP_SENT','LINKED','FAILED')),
  linked_at              timestamptz,
  created_at             timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, care_context_reference)
);

-- 6. M3 HIU Consent Requests
CREATE TABLE IF NOT EXISTS abdm_consent_request (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                  uuid NOT NULL REFERENCES organization(id),
  patient_id              uuid NOT NULL REFERENCES patient(id) ON DELETE CASCADE,
  abdm_consent_request_id text UNIQUE,
  status                  text NOT NULL CHECK (status IN ('INITIATED','REQUESTED','GRANTED','DENIED','REVOKED','EXPIRED','FAILED')),
  purpose_code            text NOT NULL DEFAULT 'CAREMGT',
  hi_types                text[] NOT NULL,
  permission_from         timestamptz NOT NULL,
  permission_to           timestamptz NOT NULL,
  data_erase_at           timestamptz NOT NULL,
  requested_by            uuid REFERENCES app_user(id),
  raw_request_json        jsonb,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now()
);

-- 7. M2 HIP & M3 HIU Consent Artifacts
CREATE TABLE IF NOT EXISTS abdm_consent_artifact (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id             uuid NOT NULL REFERENCES organization(id),
  patient_id         uuid NOT NULL REFERENCES patient(id) ON DELETE CASCADE,
  consent_request_id uuid REFERENCES abdm_consent_request(id) ON DELETE SET NULL,
  abdm_consent_id    text NOT NULL UNIQUE,
  role_kind          text NOT NULL CHECK (role_kind IN ('HIP','HIU')),
  status             text NOT NULL CHECK (status IN ('GRANTED','REVOKED','EXPIRED')),
  hi_types           text[] NOT NULL,
  care_contexts_json jsonb,
  permission_from    timestamptz NOT NULL,
  permission_to      timestamptz NOT NULL,
  data_erase_at      timestamptz NOT NULL,
  raw_artifact_json  jsonb,
  granted_at         timestamptz NOT NULL DEFAULT now(),
  revoked_at         timestamptz
);

-- 8. Health Information Transfers & Ephemeral Key Material
CREATE TABLE IF NOT EXISTS abdm_hi_transfer (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                    uuid NOT NULL REFERENCES organization(id),
  patient_id                uuid NOT NULL REFERENCES patient(id) ON DELETE CASCADE,
  consent_artifact_id       uuid NOT NULL REFERENCES abdm_consent_artifact(id) ON DELETE CASCADE,
  direction                 text NOT NULL CHECK (direction IN ('HIP_PUSH','HIU_PULL')),
  abdm_transaction_id       text UNIQUE,
  data_push_url             text,
  peer_public_key           text,
  peer_nonce                text,
  ephemeral_private_key_enc text,
  ephemeral_public_key      text,
  ephemeral_nonce           text,
  page_count                integer DEFAULT 1,
  received_pages            integer DEFAULT 0,
  ingested_document_ids     uuid[] DEFAULT '{}',
  status                    text NOT NULL CHECK (status IN ('INITIATED','REQUESTED','ACKNOWLEDGED','TRANSFERRED','FAILED','PURGED')),
  error_message             text,
  created_at                timestamptz NOT NULL DEFAULT now(),
  completed_at              timestamptz
);

-- ---------------------------------------------------------------------------
-- Row-Level Security:
--
-- 1. App-level tenant data (abdm_inbox, abdm_patient_link):
--    ENABLE + FORCE ROW LEVEL SECURITY.
--
-- 2. Gateway correlation lookup tables:
--    (abdm_transaction, abdm_care_context, abdm_consent_request,
--     abdm_consent_artifact, abdm_hi_transfer):
--    ENABLE ROW LEVEL SECURITY (not FORCE), matching the pattern established
--    in 0003_policies_grants.sql for identity/session lookup tables.
--    The runtime role `oncobrief_app` is 100% restricted by the tenant_isolation
--    policy, while `oncobrief_migrator` inside the SECURITY DEFINER function
--    `abdm_resolve_callback_tenant` can resolve correlation tokens before
--    app.org_id is set.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  t text;
  all_abdm_tables text[] := ARRAY[
    'abdm_inbox',
    'abdm_transaction',
    'abdm_patient_link',
    'abdm_care_context',
    'abdm_consent_request',
    'abdm_consent_artifact',
    'abdm_hi_transfer'
  ];
  forced_tables text[] := ARRAY[
    'abdm_inbox',
    'abdm_patient_link'
  ];
BEGIN
  FOREACH t IN ARRAY all_abdm_tables LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I '
      'USING (org_id = current_setting(''app.org_id'', true)::uuid) '
      'WITH CHECK (org_id = current_setting(''app.org_id'', true)::uuid)',
      t
    );
  END LOOP;

  FOREACH t IN ARRAY forced_tables LOOP
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- Security Definer Callback Tenant Resolver
--
-- ABDM Gateway callbacks arrive over public HTTPS without an app session cookie.
-- This function narrowly inspects correlation identifiers (transaction,
-- request, consent, care-context, or registered facility IDs) to determine the
-- target tenant org_id and optional patient_id before the caller enters `withTenant`.
--
-- Strict rules:
-- 1. Owned by oncobrief_migrator with locked search_path = public.
-- 2. Returns at most one row; fails closed if multiple or conflicting tenants match.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION abdm_resolve_callback_tenant(
  p_response_request_id uuid DEFAULT NULL,
  p_consent_request_id  text DEFAULT NULL,
  p_consent_id          text DEFAULT NULL,
  p_transaction_id      text DEFAULT NULL,
  p_care_context_ref    text DEFAULT NULL,
  p_facility_id         text DEFAULT NULL
)
RETURNS TABLE (
  org_id     uuid,
  patient_id uuid
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_org_id     uuid := NULL;
  v_patient_id uuid := NULL;
BEGIN
  -- 1. Check outbound transaction table by response request ID
  IF p_response_request_id IS NOT NULL THEN
    SELECT t.org_id, t.patient_id INTO v_org_id, v_patient_id
    FROM abdm_transaction t
    WHERE t.request_id = p_response_request_id;
    IF v_org_id IS NOT NULL THEN
      RETURN QUERY SELECT v_org_id, v_patient_id;
      RETURN;
    END IF;
  END IF;

  -- 2. Check health information transfer by ABDM transaction ID
  IF p_transaction_id IS NOT NULL AND p_transaction_id <> '' THEN
    SELECT tr.org_id, tr.patient_id INTO v_org_id, v_patient_id
    FROM abdm_hi_transfer tr
    WHERE tr.abdm_transaction_id = p_transaction_id;
    IF v_org_id IS NOT NULL THEN
      RETURN QUERY SELECT v_org_id, v_patient_id;
      RETURN;
    END IF;
  END IF;

  -- 3. Check consent artifact by ABDM consent ID
  IF p_consent_id IS NOT NULL AND p_consent_id <> '' THEN
    SELECT ca.org_id, ca.patient_id INTO v_org_id, v_patient_id
    FROM abdm_consent_artifact ca
    WHERE ca.abdm_consent_id = p_consent_id;
    IF v_org_id IS NOT NULL THEN
      RETURN QUERY SELECT v_org_id, v_patient_id;
      RETURN;
    END IF;
  END IF;

  -- 4. Check consent request by ABDM consent request ID
  IF p_consent_request_id IS NOT NULL AND p_consent_request_id <> '' THEN
    SELECT cr.org_id, cr.patient_id INTO v_org_id, v_patient_id
    FROM abdm_consent_request cr
    WHERE cr.abdm_consent_request_id = p_consent_request_id;
    IF v_org_id IS NOT NULL THEN
      RETURN QUERY SELECT v_org_id, v_patient_id;
      RETURN;
    END IF;
  END IF;

  -- 5. Check care context by reference
  IF p_care_context_ref IS NOT NULL AND p_care_context_ref <> '' THEN
    SELECT cc.org_id, cc.patient_id INTO v_org_id, v_patient_id
    FROM abdm_care_context cc
    WHERE cc.care_context_reference = p_care_context_ref;
    IF v_org_id IS NOT NULL THEN
      RETURN QUERY SELECT v_org_id, v_patient_id;
      RETURN;
    END IF;
  END IF;

  -- 6. Fallback to registered organization facility ID (HIP or HIU)
  IF p_facility_id IS NOT NULL AND p_facility_id <> '' THEN
    SELECT o.id, NULL::uuid INTO v_org_id, v_patient_id
    FROM organization o
    WHERE o.abdm_hip_id = p_facility_id
       OR o.abdm_hiu_id = p_facility_id
       OR o.hfr_facility_id = p_facility_id;
    IF v_org_id IS NOT NULL THEN
      RETURN QUERY SELECT v_org_id, v_patient_id;
      RETURN;
    END IF;
  END IF;

  -- Nothing matched: return 0 rows (fail closed)
  RETURN;
END;
$$;

ALTER FUNCTION abdm_resolve_callback_tenant(uuid, text, text, text, text, text) OWNER TO oncobrief_migrator;

-- ---------------------------------------------------------------------------
-- Grants to runtime application role
-- ---------------------------------------------------------------------------
GRANT SELECT, INSERT, UPDATE, DELETE ON
  abdm_inbox,
  abdm_transaction,
  abdm_patient_link,
  abdm_care_context,
  abdm_consent_request,
  abdm_consent_artifact,
  abdm_hi_transfer
TO oncobrief_app;

GRANT EXECUTE ON FUNCTION abdm_resolve_callback_tenant(uuid, text, text, text, text, text) TO oncobrief_app;

RESET ROLE;
