-- Phase 3: extend existing capacity and waitlist; no inferred service lines.
SET ROLE oncobrief_migrator;
ALTER TABLE opd_appointment_slot ADD COLUMN clinic_key text,
 ADD COLUMN clinic_timezone text NOT NULL DEFAULT 'Asia/Kolkata';
ALTER TABLE opd_waitlist_entry ADD COLUMN clinic_key text,
 ADD COLUMN priority_selected_by uuid,
 ADD COLUMN priority_selected_at timestamptz,
 ADD CONSTRAINT waitlist_priority_actor_fk FOREIGN KEY(org_id,priority_selected_by) REFERENCES membership(org_id,user_id),
 ADD CONSTRAINT waitlist_priority_selection_complete CHECK ((priority_selected_by IS NULL) = (priority_selected_at IS NULL));
-- Unconfigured legacy records remain visible, but cannot be backfilled until
-- an institution explicitly configures matching clinic keys. Never infer a line.
CREATE UNIQUE INDEX opd_one_active_offer_slot ON opd_waitlist_entry(org_id,offered_slot_id) WHERE status='offered';
CREATE UNIQUE INDEX opd_one_active_offer_patient ON opd_waitlist_entry(org_id,patient_id) WHERE status='offered';
ALTER TABLE opd_waitlist_entry ADD CONSTRAINT opd_offer_requires_slot CHECK(status <> 'offered' OR offered_slot_id IS NOT NULL);
CREATE TABLE opd_slot_event (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),org_id uuid NOT NULL REFERENCES organization(id),
 slot_id uuid NOT NULL, patient_id uuid, waitlist_entry_id uuid,
 action text NOT NULL CHECK(action IN ('status_changed','offered','walk_in')),
 from_status opd_slot_status NOT NULL,to_status opd_slot_status NOT NULL,
 actor_id uuid NOT NULL, request_id text NOT NULL CHECK(length(request_id) BETWEEN 1 AND 120),
 request_payload jsonb NOT NULL, reason text, occurred_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(org_id,slot_id) REFERENCES opd_appointment_slot(org_id,id),
 FOREIGN KEY(org_id,patient_id) REFERENCES patient(org_id,id),
 FOREIGN KEY(org_id,waitlist_entry_id) REFERENCES opd_waitlist_entry(org_id,id),
 FOREIGN KEY(org_id,actor_id) REFERENCES membership(org_id,user_id), UNIQUE(org_id,request_id)
);
ALTER TABLE opd_slot_event ENABLE ROW LEVEL SECURITY;
ALTER TABLE opd_slot_event FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON opd_slot_event USING(org_id=current_setting('app.org_id',true)::uuid) WITH CHECK(org_id=current_setting('app.org_id',true)::uuid);
CREATE TRIGGER opd_events_append_only BEFORE UPDATE OR DELETE ON opd_slot_event FOR EACH ROW EXECUTE FUNCTION oncobrief_block_mutation();
GRANT SELECT,INSERT ON opd_slot_event TO oncobrief_app;
-- Every persisted row represents capacity, including vacant/released rows.
-- A new appointment must consume that capacity rather than insert a duplicate.
CREATE FUNCTION opd_capacity_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('opd:'||NEW.org_id::text,0));
 IF NOT EXISTS(SELECT 1 FROM pg_timezone_names WHERE name=NEW.clinic_timezone) THEN RAISE EXCEPTION 'invalid_clinic_timezone'; END IF;
 IF EXISTS(SELECT 1 FROM opd_appointment_slot s WHERE s.org_id=NEW.org_id AND s.id<>NEW.id AND s.clinic_date=NEW.clinic_date
  AND s.slot_start_time<NEW.slot_end_time AND NEW.slot_start_time<s.slot_end_time
  AND (s.room_label=NEW.room_label OR (NEW.clinician_id IS NOT NULL AND s.clinician_id=NEW.clinician_id)
   OR (NEW.patient_id IS NOT NULL AND s.patient_id=NEW.patient_id AND s.status NOT IN ('cancelled','no_show','completed','vacant') AND NEW.status NOT IN ('cancelled','no_show','completed','vacant'))))
 THEN RAISE EXCEPTION 'opd_capacity_overlap'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER opd_capacity_safe BEFORE INSERT OR UPDATE ON opd_appointment_slot FOR EACH ROW EXECUTE FUNCTION opd_capacity_guard();
-- Serialize readiness inputs with the patient row locked by final backfill.
-- This also guards consent-source withdrawal, which changes document metadata.
CREATE FUNCTION opd_lock_readiness_patient() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
DECLARE pid uuid; oid uuid;
BEGIN
 IF TG_OP='DELETE' THEN pid:=OLD.patient_id;oid:=OLD.org_id; ELSE pid:=NEW.patient_id;oid:=NEW.org_id; END IF;
 PERFORM 1 FROM patient WHERE id=pid AND org_id=oid FOR UPDATE;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW;
END $$;
DO $$ DECLARE t text; BEGIN FOREACH t IN ARRAY ARRAY['document','evidence_fact','evidence_state','conflict_set','admin_task','record_gap','patient_checklist'] LOOP
 EXECUTE format('CREATE TRIGGER opd_readiness_serialized BEFORE INSERT OR UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION opd_lock_readiness_patient()',t);
END LOOP; END $$;
RESET ROLE;
