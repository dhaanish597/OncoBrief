-- Follow-up to locally exercised 0012: enforce real instants across clinic zones
-- and protect an offered reservation from subsequently inserted appointments.
SET ROLE oncobrief_migrator;
CREATE OR REPLACE FUNCTION opd_capacity_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
DECLARE starts timestamptz; ends timestamptz;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('opd:'||NEW.org_id::text,0));
 IF NOT EXISTS(SELECT 1 FROM pg_timezone_names WHERE name=NEW.clinic_timezone) THEN RAISE EXCEPTION 'invalid_clinic_timezone'; END IF;
 starts := (NEW.clinic_date+NEW.slot_start_time) AT TIME ZONE NEW.clinic_timezone;
 ends := (NEW.clinic_date+NEW.slot_end_time) AT TIME ZONE NEW.clinic_timezone;
 IF EXISTS(SELECT 1 FROM opd_appointment_slot s WHERE s.org_id=NEW.org_id AND s.id<>NEW.id
  AND ((s.clinic_date+s.slot_start_time) AT TIME ZONE s.clinic_timezone)<ends
  AND starts<((s.clinic_date+s.slot_end_time) AT TIME ZONE s.clinic_timezone)
  AND (s.room_label=NEW.room_label OR (NEW.clinician_id IS NOT NULL AND s.clinician_id=NEW.clinician_id)
   OR (NEW.patient_id IS NOT NULL AND s.patient_id=NEW.patient_id AND s.status NOT IN ('cancelled','no_show','completed','vacant') AND NEW.status NOT IN ('cancelled','no_show','completed','vacant'))))
 THEN RAISE EXCEPTION 'opd_capacity_overlap'; END IF;
 IF NEW.patient_id IS NOT NULL AND NEW.status NOT IN ('cancelled','no_show','completed','vacant') AND EXISTS(
  SELECT 1 FROM opd_waitlist_entry w JOIN opd_appointment_slot a ON a.org_id=w.org_id AND a.id=w.offered_slot_id
  WHERE w.org_id=NEW.org_id AND w.status='offered' AND (w.offered_slot_id=NEW.id OR (w.patient_id=NEW.patient_id
   AND ((a.clinic_date+a.slot_start_time) AT TIME ZONE a.clinic_timezone)<ends
   AND starts<((a.clinic_date+a.slot_end_time) AT TIME ZONE a.clinic_timezone))))
 THEN RAISE EXCEPTION 'opd_offer_overlap'; END IF;
 RETURN NEW;
END $$;
CREATE FUNCTION opd_offer_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
DECLARE target opd_appointment_slot;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('opd:'||NEW.org_id::text,0));
 IF NEW.status='offered' THEN
  SELECT * INTO target FROM opd_appointment_slot WHERE org_id=NEW.org_id AND id=NEW.offered_slot_id FOR UPDATE;
  IF target.id IS NULL OR target.status<>'vacant' OR target.patient_id IS NOT NULL THEN RAISE EXCEPTION 'opd_slot_not_vacant'; END IF;
  IF EXISTS(SELECT 1 FROM opd_appointment_slot a WHERE a.org_id=NEW.org_id AND a.patient_id=NEW.patient_id
   AND a.status NOT IN ('cancelled','no_show','completed','vacant')
   AND ((a.clinic_date+a.slot_start_time) AT TIME ZONE a.clinic_timezone)<((target.clinic_date+target.slot_end_time) AT TIME ZONE target.clinic_timezone)
   AND ((target.clinic_date+target.slot_start_time) AT TIME ZONE target.clinic_timezone)<((a.clinic_date+a.slot_end_time) AT TIME ZONE a.clinic_timezone))
  THEN RAISE EXCEPTION 'opd_offer_overlap'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER opd_offer_safe BEFORE INSERT OR UPDATE ON opd_waitlist_entry FOR EACH ROW EXECUTE FUNCTION opd_offer_guard();
RESET ROLE;
