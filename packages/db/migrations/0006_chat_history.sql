-- ===========================================================================
-- 0006_chat_history.sql
--
-- Chat history for Ask OncoBrief assistant.
-- ===========================================================================

SET ROLE oncobrief_migrator;

CREATE TYPE chat_message_role AS ENUM ('user', 'assistant', 'system');
CREATE TYPE chat_intent AS ENUM (
  'evidence_question',
  'missing_documents_question',
  'continuity_question',
  'navigation_question',
  'unsupported_medical_question',
  'ambiguous_question'
);

-- Conversation table: one per user per patient (or global)
CREATE TABLE conversation (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id             uuid NOT NULL REFERENCES organization(id),
  patient_id         uuid REFERENCES patient(id),  -- null for global/non-patient conversations
  user_id            uuid NOT NULL REFERENCES app_user(id),
  title              text NOT NULL DEFAULT 'New conversation',
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, id)
);
CREATE INDEX conversation_user_idx ON conversation (user_id, updated_at DESC);
CREATE INDEX conversation_patient_idx ON conversation (patient_id, updated_at DESC) WHERE patient_id IS NOT NULL;

-- Message table: each message in a conversation
CREATE TABLE chat_message (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id             uuid NOT NULL REFERENCES organization(id),
  conversation_id    uuid NOT NULL REFERENCES conversation(id) ON DELETE CASCADE,
  role               chat_message_role NOT NULL,
  content            text NOT NULL,
  intent             chat_intent,
  grounded           boolean DEFAULT false,
  sources_json       jsonb DEFAULT '[]',
  navigation_json    jsonb,
  created_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, id)
);
CREATE INDEX chat_message_conversation_idx ON chat_message (conversation_id, created_at);

-- Add RLS policies
ALTER TABLE conversation ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversation FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON conversation;
CREATE POLICY tenant_isolation ON conversation
  USING (org_id = current_setting('app.org_id', true)::uuid)
  WITH CHECK (org_id = current_setting('app.org_id', true)::uuid);

ALTER TABLE chat_message ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_message FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON chat_message;
CREATE POLICY tenant_isolation ON chat_message
  USING (org_id = current_setting('app.org_id', true)::uuid)
  WITH CHECK (org_id = current_setting('app.org_id', true)::uuid);

-- Grants
GRANT SELECT, INSERT, UPDATE, DELETE ON conversation TO oncobrief_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON chat_message TO oncobrief_app;

RESET ROLE;