-- ===========================================================================
-- 0014_guideline_chat_intent.sql
--
-- Adds guideline_knowledge_question to chat_intent enum for Phase 4 Oncology Guideline Co-Pilot.
-- ===========================================================================

SET ROLE oncobrief_migrator;

ALTER TYPE chat_intent ADD VALUE IF NOT EXISTS 'guideline_knowledge_question';

RESET ROLE;
