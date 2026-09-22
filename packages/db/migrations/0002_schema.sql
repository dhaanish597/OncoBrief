-- ===========================================================================
-- 0002_schema.sql
--
-- Full relational schema. Runs as oncobrief_migrator so the migrator owns
-- every object. Tenancy, append-only enforcement and RLS live in 0003.
-- ===========================================================================

SET ROLE oncobrief_migrator;

-- ---------------------------------------------------------------------------
-- Enumerated types
-- ---------------------------------------------------------------------------
CREATE TYPE extractor_kind       AS ENUM ('rule', 'llm', 'human', 'fixture');
CREATE TYPE confidence_band      AS ENUM ('high', 'medium', 'low');
CREATE TYPE evidence_state_value AS ENUM ('extracted','verified','conflicting','corrected','rejected','superseded');
CREATE TYPE ledger_action        AS ENUM (
  'fact_extracted','fact_verified','fact_corrected','fact_rejected',
  'fact_flagged_conflicting','conflict_resolved','fact_superseded','fact_reinstated');
CREATE TYPE document_source_kind AS ENUM ('upload','scan','fax_pdf','photo','extension_capture','fhir_document');
CREATE TYPE ingest_status        AS ENUM ('received','rendering','ocr_running','classifying','extracting','ready','failed','quarantined');
CREATE TYPE span_granularity     AS ENUM ('word','line','block');
CREATE TYPE conflict_status      AS ENUM ('open','resolved','dismissed');
CREATE TYPE resolution_kind      AS ENUM ('retain_both','mark_superseded','corrected');
CREATE TYPE conflict_member_role AS ENUM ('candidate','retained','superseded','replacement');
CREATE TYPE gap_status           AS ENUM ('missing','partial','satisfied','waived');
CREATE TYPE task_status          AS ENUM ('open','assigned','in_progress','blocked','done','cancelled');
CREATE TYPE task_origin_kind     AS ENUM ('evidence','record_gap','conflict','document');
CREATE TYPE packet_status        AS ENUM ('draft','pending_approval','approved','superseded','withdrawn');
CREATE TYPE message_status       AS ENUM ('draft','pending_approval','approved','delivered','failed','withdrawn');
CREATE TYPE requirement_kind     AS ENUM ('required','expected','optional');
CREATE TYPE readiness_band       AS ENUM ('ready','gaps','blocked');

-- ---------------------------------------------------------------------------
-- Identity, tenancy and sessions
-- ---------------------------------------------------------------------------
CREATE TABLE organization (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug             text NOT NULL,
  name             text NOT NULL,
  is_demo_fixture  boolean NOT NULL DEFAULT false,
  created_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (slug)
);

CREATE TABLE app_user (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email            text NOT NULL,
  display_name     text NOT NULL,
  password_hash    text NOT NULL,
  is_active        boolean NOT NULL DEFAULT true,
  is_demo_fixture  boolean NOT NULL DEFAULT false,
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX app_user_email_lower_uq ON app_user (lower(email));

CREATE TABLE membership (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id           uuid NOT NULL REFERENCES organization(id),
  user_id          uuid NOT NULL REFERENCES app_user(id),
  role             text NOT NULL CHECK (role IN ('clinician','coordinator','records_officer','org_admin','auditor')),
  is_demo_fixture  boolean NOT NULL DEFAULT false,
  created_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, user_id)
);

CREATE TABLE session (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL REFERENCES organization(id),
  user_id       uuid NOT NULL REFERENCES app_user(id),
  token_hash    bytea NOT NULL,
  role          text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  last_seen_at  timestamptz NOT NULL DEFAULT now(),
  expires_at    timestamptz NOT NULL,
  revoked_at    timestamptz,
  UNIQUE (token_hash)
);
CREATE INDEX session_user_idx ON session (user_id);

-- Provisioned but not enforced in the prototype (architecture §13.1, §24).
CREATE TABLE user_totp (
  user_id     uuid PRIMARY KEY REFERENCES app_user(id),
  secret      text NOT NULL,
  enabled     boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Patients
-- ---------------------------------------------------------------------------
CREATE TABLE patient (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id           uuid NOT NULL REFERENCES organization(id),
  demo_code        text,
  display_name     text NOT NULL,
  clinical_context_note text,
  is_demo_fixture  boolean NOT NULL DEFAULT false,
  created_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, id)
);

CREATE TABLE patient_identifier (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid NOT NULL REFERENCES organization(id),
  patient_id  uuid NOT NULL REFERENCES patient(id),
  system      text NOT NULL,
  value       text NOT NULL,
  UNIQUE (org_id, system, value)
);

-- ---------------------------------------------------------------------------
-- Documents, pages and OCR spans
-- ---------------------------------------------------------------------------
CREATE TABLE document (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                  uuid NOT NULL REFERENCES organization(id),
  patient_id              uuid NOT NULL REFERENCES patient(id),

  source_kind             document_source_kind NOT NULL,
  original_filename       text NOT NULL,
  mime_type               text NOT NULL,
  byte_size               bigint NOT NULL,
  content_sha256          bytea NOT NULL,
  storage_key             text NOT NULL,
  page_count              integer,

  doc_version             integer NOT NULL DEFAULT 1 CHECK (doc_version >= 1),
  supersedes_document_id  uuid REFERENCES document(id),
  duplicate_of_document_id uuid REFERENCES document(id),

  document_type           text,
  type_confidence         confidence_band,
  classified_by           extractor_kind,
  type_confirmed_by       uuid REFERENCES app_user(id),
  type_confirmed_at       timestamptz,

  document_date           date,
  issuing_facility        text,
  record_origin           text NOT NULL DEFAULT 'internal_hospital'
                            CHECK (record_origin IN ('internal_hospital','external_hospital','diagnostic_lab','imaging_centre','patient_upload')),

  ingest_status           ingest_status NOT NULL DEFAULT 'received',
  ingest_error            text,
  ocr_driver              text,
  is_demo_fixture         boolean NOT NULL DEFAULT false,

  uploaded_by             uuid NOT NULL REFERENCES app_user(id),
  uploaded_at             timestamptz NOT NULL DEFAULT now(),

  UNIQUE (org_id, patient_id, content_sha256),
  UNIQUE (org_id, id)
);
CREATE INDEX document_patient_idx ON document (patient_id);
CREATE INDEX document_status_idx ON document (org_id, ingest_status);

CREATE TABLE document_page (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid NOT NULL REFERENCES organization(id),
  document_id uuid NOT NULL REFERENCES document(id),
  page_number integer NOT NULL CHECK (page_number >= 1),
  width_px    integer,
  height_px   integer,
  image_key   text,
  plain_text  text NOT NULL DEFAULT '',
  UNIQUE (document_id, page_number),
  UNIQUE (org_id, id)
);

CREATE TABLE text_span (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id             uuid NOT NULL REFERENCES organization(id),
  document_id        uuid NOT NULL REFERENCES document(id),
  page_id            uuid NOT NULL REFERENCES document_page(id),
  parent_span_id     uuid REFERENCES text_span(id),
  granularity        span_granularity NOT NULL,
  span_index         integer NOT NULL,
  text               text NOT NULL,
  char_start         integer NOT NULL,
  char_end           integer NOT NULL,
  bbox_x             real NOT NULL,
  bbox_y             real NOT NULL,
  bbox_w             real NOT NULL,
  bbox_h             real NOT NULL,
  ocr_confidence     real,
  ocr_engine         text NOT NULL,
  ocr_engine_version text NOT NULL,
  UNIQUE (page_id, granularity, span_index),
  UNIQUE (org_id, id)
);
CREATE INDEX text_span_page_idx ON text_span (page_id);

-- Extractors write here. Only the deterministic promoter writes to the ledger
-- (architecture §16.3). Rejected candidates are retained and counted.
CREATE TABLE extraction_candidate (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id            uuid NOT NULL REFERENCES organization(id),
  document_id       uuid NOT NULL REFERENCES document(id),
  patient_id        uuid NOT NULL REFERENCES patient(id),
  fact_type         text NOT NULL,
  value_json        jsonb NOT NULL,
  verbatim_quote    text NOT NULL,
  proposed_span_ids uuid[] NOT NULL,
  extractor_kind    extractor_kind NOT NULL,
  extractor_name    text NOT NULL,
  extractor_version text NOT NULL,
  confidence_raw    numeric(4,3),
  validation_status text NOT NULL CHECK (validation_status IN ('pending','promoted','rejected')),
  rejected_reason   text,
  promoted_fact_id  uuid,
  created_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX extraction_candidate_doc_idx ON extraction_candidate (document_id);

-- ---------------------------------------------------------------------------
-- Evidence ledger
-- ---------------------------------------------------------------------------
CREATE TABLE evidence_fact (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id            uuid NOT NULL REFERENCES organization(id),
  patient_id        uuid NOT NULL REFERENCES patient(id),

  fact_type         text NOT NULL,
  slot_key          text NOT NULL,
  value_json        jsonb NOT NULL,
  value_normalized  text NOT NULL,
  observed_on       date,
  verbatim_quote    text NOT NULL,

  document_id       uuid NOT NULL REFERENCES document(id),
  extractor_kind    extractor_kind NOT NULL,
  extractor_name    text NOT NULL,
  extractor_version text NOT NULL,
  confidence_band   confidence_band NOT NULL,
  confidence_raw    numeric(4,3),

  corrects_fact_id  uuid REFERENCES evidence_fact(id),
  created_at        timestamptz NOT NULL DEFAULT now(),
  created_by        uuid REFERENCES app_user(id),

  CONSTRAINT quote_not_empty CHECK (length(btrim(verbatim_quote)) > 0),
  CONSTRAINT human_fact_has_author CHECK (extractor_kind <> 'human' OR created_by IS NOT NULL),
  UNIQUE (org_id, id)
);
CREATE INDEX evidence_fact_patient_idx ON evidence_fact (patient_id);
CREATE INDEX evidence_fact_slot_idx ON evidence_fact (org_id, patient_id, slot_key);
CREATE INDEX evidence_fact_document_idx ON evidence_fact (document_id);

CREATE TABLE evidence_span_link (
  evidence_fact_id uuid NOT NULL REFERENCES evidence_fact(id),
  text_span_id     uuid NOT NULL REFERENCES text_span(id),
  org_id           uuid NOT NULL REFERENCES organization(id),
  ordinal          smallint NOT NULL,
  PRIMARY KEY (evidence_fact_id, text_span_id)
);

CREATE TABLE ledger_entry (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id            uuid NOT NULL REFERENCES organization(id),
  seq               bigint NOT NULL,
  patient_id        uuid NOT NULL REFERENCES patient(id),
  evidence_fact_id  uuid NOT NULL REFERENCES evidence_fact(id),
  conflict_set_id   uuid,

  action            ledger_action NOT NULL,
  from_state        evidence_state_value,
  to_state          evidence_state_value NOT NULL,

  actor_kind        text NOT NULL CHECK (actor_kind IN ('human','system')),
  actor_user_id     uuid REFERENCES app_user(id),
  actor_role        text,
  reason            text,
  payload_json      jsonb NOT NULL DEFAULT '{}',

  occurred_at       timestamptz NOT NULL DEFAULT now(),
  prev_entry_hash   bytea,
  entry_hash        bytea NOT NULL,

  UNIQUE (org_id, seq),
  CONSTRAINT human_action_has_actor CHECK (actor_kind <> 'human' OR actor_user_id IS NOT NULL),
  CONSTRAINT destructive_action_has_reason CHECK (
    action NOT IN ('fact_rejected','fact_corrected','fact_superseded','fact_reinstated','conflict_resolved')
    OR length(btrim(coalesce(reason,''))) >= 3)
);
CREATE INDEX ledger_entry_fact_idx ON ledger_entry (evidence_fact_id, seq);
CREATE INDEX ledger_entry_org_seq_idx ON ledger_entry (org_id, seq);

-- Maintained projection. Dropping and rebuilding must be a no-op (§23.2).
CREATE TABLE evidence_state (
  evidence_fact_id uuid PRIMARY KEY REFERENCES evidence_fact(id),
  org_id           uuid NOT NULL,
  patient_id       uuid NOT NULL,
  state            evidence_state_value NOT NULL,
  last_entry_id    uuid NOT NULL REFERENCES ledger_entry(id),
  last_actor_id    uuid REFERENCES app_user(id),
  last_changed_at  timestamptz NOT NULL
);

-- ---------------------------------------------------------------------------
-- Reconciliation
-- ---------------------------------------------------------------------------
CREATE TABLE conflict_set (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id            uuid NOT NULL REFERENCES organization(id),
  patient_id        uuid NOT NULL REFERENCES patient(id),
  fact_type         text NOT NULL,
  slot_key          text NOT NULL,
  member_fingerprint text NOT NULL,
  detector_name     text NOT NULL,
  detector_version  text NOT NULL,
  detection_reason  text NOT NULL DEFAULT 'disagreement',
  status            conflict_status NOT NULL DEFAULT 'open',
  detected_at       timestamptz NOT NULL DEFAULT now(),
  resolution_kind   resolution_kind,
  resolution_reason text,
  resolved_by       uuid REFERENCES app_user(id),
  resolved_at       timestamptz,
  UNIQUE (org_id, member_fingerprint),
  UNIQUE (org_id, id),
  CONSTRAINT resolved_is_complete CHECK (
    status <> 'resolved' OR (resolution_kind IS NOT NULL AND resolved_by IS NOT NULL
      AND resolved_at IS NOT NULL AND length(btrim(coalesce(resolution_reason,''))) >= 3))
);

CREATE TABLE conflict_member (
  conflict_set_id  uuid NOT NULL REFERENCES conflict_set(id),
  evidence_fact_id uuid NOT NULL REFERENCES evidence_fact(id),
  org_id           uuid NOT NULL REFERENCES organization(id),
  member_role      conflict_member_role NOT NULL DEFAULT 'candidate',
  PRIMARY KEY (conflict_set_id, evidence_fact_id)
);

-- ---------------------------------------------------------------------------
-- Administrative digital twin
-- ---------------------------------------------------------------------------
CREATE TABLE checklist_template (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       uuid NOT NULL REFERENCES organization(id),
  code         text NOT NULL,
  name         text NOT NULL,
  version      integer NOT NULL,
  care_context text NOT NULL,
  is_active    boolean NOT NULL DEFAULT true,
  authored_by  uuid NOT NULL REFERENCES app_user(id),
  authored_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, code, version),
  UNIQUE (org_id, id)
);

CREATE TABLE checklist_item (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                 uuid NOT NULL REFERENCES organization(id),
  template_id            uuid NOT NULL REFERENCES checklist_template(id),
  code                   text NOT NULL,
  label                  text NOT NULL,
  required_document_type text NOT NULL,
  requirement_kind       requirement_kind NOT NULL,
  ordinal                smallint NOT NULL,
  rationale              text NOT NULL,
  UNIQUE (template_id, code)
);

CREATE TABLE patient_checklist (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       uuid NOT NULL REFERENCES organization(id),
  patient_id   uuid NOT NULL REFERENCES patient(id),
  template_id  uuid NOT NULL REFERENCES checklist_template(id),
  template_version integer NOT NULL,
  assigned_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (patient_id, template_id),
  UNIQUE (org_id, id)
);

CREATE TABLE record_gap (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id               uuid NOT NULL REFERENCES organization(id),
  patient_id           uuid NOT NULL REFERENCES patient(id),
  patient_checklist_id uuid NOT NULL REFERENCES patient_checklist(id),
  checklist_item_id    uuid NOT NULL REFERENCES checklist_item(id),
  status               gap_status NOT NULL,
  satisfied_by_document_id uuid REFERENCES document(id),
  candidate_document_id    uuid REFERENCES document(id),
  first_detected_at    timestamptz NOT NULL DEFAULT now(),
  last_evaluated_at    timestamptz NOT NULL DEFAULT now(),
  waived_by            uuid REFERENCES app_user(id),
  waived_reason        text,
  UNIQUE (patient_checklist_id, checklist_item_id),
  UNIQUE (org_id, id),
  CONSTRAINT waived_has_reason CHECK (
    status <> 'waived' OR (waived_by IS NOT NULL AND length(btrim(coalesce(waived_reason,''))) >= 3))
);
CREATE INDEX record_gap_patient_idx ON record_gap (patient_id, status);

CREATE TABLE record_readiness_snapshot (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                uuid NOT NULL REFERENCES organization(id),
  patient_id            uuid NOT NULL REFERENCES patient(id),
  computed_at           timestamptz NOT NULL DEFAULT now(),
  required_items        integer NOT NULL,
  satisfied_items       integer NOT NULL,
  missing_required      integer NOT NULL,
  missing_expected      integer NOT NULL,
  partial_items         integer NOT NULL DEFAULT 0,
  unresolved_conflicts  integer NOT NULL,
  unverified_facts      integer NOT NULL,
  open_tasks            integer NOT NULL,
  overdue_tasks         integer NOT NULL,
  duplicate_documents   integer NOT NULL,
  stale_verified_facts  integer NOT NULL,
  readiness_band        readiness_band NOT NULL,
  inputs_json           jsonb NOT NULL
);
CREATE INDEX readiness_patient_idx ON record_readiness_snapshot (patient_id, computed_at DESC);

-- ---------------------------------------------------------------------------
-- Administrative tasks
-- ---------------------------------------------------------------------------
CREATE TABLE admin_task (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id           uuid NOT NULL REFERENCES organization(id),
  patient_id       uuid NOT NULL REFERENCES patient(id),
  title            text NOT NULL,
  detail           text,
  task_kind        text NOT NULL,
  status           task_status NOT NULL DEFAULT 'open',
  due_on           date,

  origin_kind             task_origin_kind NOT NULL,
  origin_evidence_fact_id uuid REFERENCES evidence_fact(id),
  origin_record_gap_id    uuid REFERENCES record_gap(id),
  origin_conflict_set_id  uuid REFERENCES conflict_set(id),
  origin_document_id      uuid REFERENCES document(id),

  assigned_to      uuid REFERENCES app_user(id),
  created_by       uuid NOT NULL REFERENCES app_user(id),
  created_at       timestamptz NOT NULL DEFAULT now(),
  closed_at        timestamptz,
  closure_note     text,

  UNIQUE (org_id, id),
  CONSTRAINT task_must_have_source CHECK (
    (origin_kind='evidence'   AND origin_evidence_fact_id IS NOT NULL) OR
    (origin_kind='record_gap' AND origin_record_gap_id    IS NOT NULL) OR
    (origin_kind='conflict'   AND origin_conflict_set_id  IS NOT NULL) OR
    (origin_kind='document'   AND origin_document_id      IS NOT NULL))
);
CREATE INDEX admin_task_patient_idx ON admin_task (patient_id, status);

CREATE TABLE task_event (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL REFERENCES organization(id),
  task_id       uuid NOT NULL REFERENCES admin_task(id),
  action        text NOT NULL CHECK (action IN ('created','assigned','status_changed','commented','closed')),
  from_status   task_status,
  to_status     task_status,
  actor_user_id uuid NOT NULL REFERENCES app_user(id),
  note          text,
  occurred_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX task_event_task_idx ON task_event (task_id, occurred_at);

-- ---------------------------------------------------------------------------
-- Consultation packet
-- ---------------------------------------------------------------------------
CREATE TABLE consultation_packet (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id           uuid NOT NULL REFERENCES organization(id),
  patient_id       uuid NOT NULL REFERENCES patient(id),
  encounter_label  text NOT NULL,
  status           packet_status NOT NULL DEFAULT 'draft',
  readiness_snapshot_id uuid REFERENCES record_readiness_snapshot(id),

  snapshot_json    jsonb,
  snapshot_sha256  bytea,
  ledger_seq_at_approval bigint,

  created_by       uuid NOT NULL REFERENCES app_user(id),
  created_at       timestamptz NOT NULL DEFAULT now(),
  submitted_by     uuid REFERENCES app_user(id),
  submitted_at     timestamptz,
  approved_by      uuid REFERENCES app_user(id),
  approved_at      timestamptz,
  approval_note    text,
  supersedes_packet_id uuid REFERENCES consultation_packet(id),

  UNIQUE (org_id, id),
  CONSTRAINT approved_is_frozen CHECK (
    status <> 'approved' OR (snapshot_json IS NOT NULL AND snapshot_sha256 IS NOT NULL
      AND approved_by IS NOT NULL AND approved_at IS NOT NULL AND ledger_seq_at_approval IS NOT NULL))
);
CREATE INDEX packet_patient_idx ON consultation_packet (patient_id, created_at DESC);

CREATE TABLE packet_item (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id            uuid NOT NULL REFERENCES organization(id),
  packet_id         uuid NOT NULL REFERENCES consultation_packet(id),
  section           text NOT NULL,
  ordinal           smallint NOT NULL,
  evidence_fact_id  uuid REFERENCES evidence_fact(id),
  record_gap_id     uuid REFERENCES record_gap(id),
  conflict_set_id   uuid REFERENCES conflict_set(id),
  task_id           uuid REFERENCES admin_task(id),
  state_at_snapshot evidence_state_value,
  inclusion_reason  text,
  UNIQUE (packet_id, section, ordinal),
  CONSTRAINT item_references_something CHECK (
    num_nonnulls(evidence_fact_id, record_gap_id, conflict_set_id, task_id) = 1)
);

-- ---------------------------------------------------------------------------
-- Patient continuity
-- ---------------------------------------------------------------------------
CREATE TABLE message_template (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id            uuid NOT NULL REFERENCES organization(id),
  code              text NOT NULL,
  locale            text NOT NULL,
  version           integer NOT NULL,
  body_template     text NOT NULL,
  allowed_variables text[] NOT NULL,
  approved_by       uuid NOT NULL REFERENCES app_user(id),
  approved_at       timestamptz NOT NULL,
  UNIQUE (org_id, code, locale, version)
);

CREATE TABLE patient_message (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id         uuid NOT NULL REFERENCES organization(id),
  patient_id     uuid NOT NULL REFERENCES patient(id),
  packet_id      uuid REFERENCES consultation_packet(id),
  template_id    uuid NOT NULL REFERENCES message_template(id),
  locale         text NOT NULL,
  variables_json jsonb NOT NULL,
  body_rendered  text NOT NULL,
  status         message_status NOT NULL DEFAULT 'draft',
  composed_by    uuid NOT NULL REFERENCES app_user(id),
  approved_by    uuid REFERENCES app_user(id),
  approved_at    timestamptz,
  UNIQUE (org_id, id),
  CONSTRAINT approved_has_approver CHECK (
    status IN ('draft','pending_approval','withdrawn')
    OR (approved_by IS NOT NULL AND approved_at IS NOT NULL))
);

CREATE TABLE message_variable_source (
  patient_message_id uuid NOT NULL REFERENCES patient_message(id),
  org_id             uuid NOT NULL REFERENCES organization(id),
  variable_name      text NOT NULL,
  source_kind        text NOT NULL CHECK (source_kind IN ('evidence','task','literal')),
  evidence_fact_id   uuid REFERENCES evidence_fact(id),
  admin_task_id      uuid REFERENCES admin_task(id),
  literal_value      text,
  PRIMARY KEY (patient_message_id, variable_name)
);

CREATE TABLE message_outbox (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id             uuid NOT NULL REFERENCES organization(id),
  patient_message_id uuid NOT NULL REFERENCES patient_message(id),
  channel            text NOT NULL,
  simulated          boolean NOT NULL DEFAULT true,
  external_ref       text,
  status             text NOT NULL CHECK (status IN ('accepted','failed')),
  attempted_by       uuid NOT NULL REFERENCES app_user(id),
  attempted_at       timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Audit and idempotency
-- ---------------------------------------------------------------------------
CREATE TABLE audit_event (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL REFERENCES organization(id),
  seq           bigint NOT NULL,
  actor_user_id uuid REFERENCES app_user(id),
  actor_role    text,
  on_behalf_of  text,
  action        text NOT NULL,
  entity_kind   text NOT NULL,
  entity_id     uuid,
  outcome       text NOT NULL CHECK (outcome IN ('success','denied','error')),
  request_id    text,
  ip_address    inet,
  user_agent    text,
  metadata_json jsonb NOT NULL DEFAULT '{}',
  occurred_at   timestamptz NOT NULL DEFAULT now(),
  prev_hash     bytea,
  entry_hash    bytea NOT NULL,
  UNIQUE (org_id, seq)
);
CREATE INDEX audit_event_entity_idx ON audit_event (org_id, entity_kind, entity_id);
CREATE INDEX audit_event_action_idx ON audit_event (org_id, action, occurred_at DESC);

CREATE TABLE idempotency_key (
  org_id          uuid NOT NULL REFERENCES organization(id),
  key             text NOT NULL,
  endpoint        text NOT NULL,
  response_status integer NOT NULL,
  response_json   jsonb NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (org_id, key, endpoint)
);

CREATE TABLE extension_grant (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL REFERENCES organization(id),
  user_id       uuid NOT NULL REFERENCES app_user(id),
  patient_id    uuid NOT NULL REFERENCES patient(id),
  scope         text[] NOT NULL,
  token_hash    bytea NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  expires_at    timestamptz NOT NULL,
  used_at       timestamptz,
  revoked_at    timestamptz,
  origin        text NOT NULL,
  UNIQUE (token_hash),
  CONSTRAINT short_lived CHECK (expires_at <= created_at + INTERVAL '10 minutes')
);

-- ---------------------------------------------------------------------------
-- Projections (derived, rebuildable, never authoritative)
-- ---------------------------------------------------------------------------
CREATE TABLE timeline_event (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id           uuid NOT NULL REFERENCES organization(id),
  patient_id       uuid NOT NULL REFERENCES patient(id),
  evidence_fact_id uuid NOT NULL REFERENCES evidence_fact(id),
  fact_type        text NOT NULL,
  value_text       text NOT NULL,
  observed_on      date,
  document_id      uuid NOT NULL REFERENCES document(id),
  display_date     date,
  state            evidence_state_value NOT NULL,
  updated_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (evidence_fact_id)
);
CREATE INDEX timeline_event_patient_idx ON timeline_event (patient_id, display_date);

-- ---------------------------------------------------------------------------
-- Projection rebuild functions (architecture §23.2)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION rebuild_evidence_state(p_org uuid) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  DELETE FROM evidence_state WHERE org_id = p_org;
  INSERT INTO evidence_state (evidence_fact_id, org_id, patient_id, state, last_entry_id, last_actor_id, last_changed_at)
  SELECT DISTINCT ON (le.evidence_fact_id)
         le.evidence_fact_id, le.org_id, le.patient_id, le.to_state, le.id, le.actor_user_id, le.occurred_at
  FROM ledger_entry le
  WHERE le.org_id = p_org
  ORDER BY le.evidence_fact_id, le.seq DESC;
END $$;

CREATE OR REPLACE FUNCTION rebuild_timeline(p_org uuid) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  DELETE FROM timeline_event WHERE org_id = p_org;
  INSERT INTO timeline_event (org_id, patient_id, evidence_fact_id, fact_type, value_text, observed_on, document_id, display_date, state)
  SELECT ef.org_id, ef.patient_id, ef.id, ef.fact_type,
         coalesce(ef.value_json->>'date', ef.value_json->>'name', ef.value_json->>'text',
                  ef.value_json->>'value', ef.value_json->>'label', ef.value_normalized),
         ef.observed_on, ef.document_id, coalesce(ef.observed_on, d.document_date, ef.created_at::date),
         coalesce(es.state, 'extracted')
  FROM evidence_fact ef
  JOIN document d ON d.id = ef.document_id
  LEFT JOIN evidence_state es ON es.evidence_fact_id = ef.id
  WHERE ef.org_id = p_org;
END $$;

RESET ROLE;
