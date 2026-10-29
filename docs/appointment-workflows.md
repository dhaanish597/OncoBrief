# OncoBrief — Appointment Scheduling & Calendar Architecture

## 1. Architectural Overview

OncoBrief provides a high-integrity oncology appointment scheduling and calendar management system engineered for high-volume outpatient departments (OPDs), multi-specialty tumor boards, and multidisciplinary treatment planning sessions.

The system enforces strict operational integrity:
- **No Double-Booking**: Transactional concurrency triggers (`appointment_conflict_safe`) prevent double-booking the same clinician, same room, or same patient within overlapping time intervals.
- **Clinician Leave & Unavailability**: Clinician leave intervals (`clinician_unavailability`) block appointment creation and display clear scheduling conflicts.
- **OPD Queue Integration**: Appointments generate a day-specific token (`token_number`, e.g., `TK-001`) and seamlessly link to the OPD status board (`Scheduled -> Confirmed -> Checked In / Waiting -> In Consultation -> Completed / Cancelled / No-show`).
- **Auditability**: Every appointment state change (booking, rescheduling, status change, cancellation) is immutably appended to `appointment_status_history` and `audit_event`.

---

## 2. Data Models & Database Schema

Defined in `packages/db/migrations/0019_oncology_operations_milestone_b.sql`:

### `appointment`
- `id` (UUID, PK)
- `org_id` (UUID, tenant boundary, forced RLS)
- `patient_id` (UUID, FK -> `patient`)
- `clinician_id` (UUID, FK -> `app_user`)
- `facility_id` (UUID, optional, FK -> `facility`)
- `department_id` (UUID, optional, FK -> `department`)
- `scheduled_start`, `scheduled_end` (TIMESTAMPTZ)
- `actual_start`, `actual_end` (TIMESTAMPTZ, nullable)
- `room_label` (VARCHAR(64), consulting room assignment)
- `appointment_type` (`new_consult`, `follow_up`, `chemo_review`, `radiation_review`, `post_op`, `multidisciplinary`, `teleconsult`)
- `arrival_category` (`scheduled`, `walk_in`, `urgent_add_on`, `waitlist_backfill`)
- `status` (`scheduled`, `confirmed`, `checked_in`, `waiting`, `in_consultation`, `completed`, `cancelled`, `no_show`, `delayed`)
- `token_number` (VARCHAR(32), e.g., `TK-042`)
- `notes` (TEXT)
- `cancellation_reason` (TEXT, required if cancelled)
- `rescheduled_from_id` (UUID, self-referential FK tracking rescheduling lineage)

### `clinician_unavailability`
- `id`, `org_id`, `clinician_id`, `start_time`, `end_time`, `reason`, `created_at`
- Validated prior to scheduling to prevent booking clinicians during medical leave, surgery hours, or conferences.

### `appointment_status_history`
- `id`, `org_id`, `appointment_id`, `from_status`, `to_status`, `changed_by`, `reason`, `created_at`

---

## 3. Concurrency & Conflict Prevention Trigger

```sql
CREATE OR REPLACE FUNCTION check_appointment_conflict()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status IN ('cancelled', 'no_show') THEN
    RETURN NEW;
  END IF;

  -- 1. Check clinician overlap
  IF EXISTS (
    SELECT 1 FROM appointment
    WHERE org_id = NEW.org_id
      AND clinician_id = NEW.clinician_id
      AND id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
      AND status NOT IN ('cancelled', 'no_show')
      AND tstzrange(scheduled_start, scheduled_end) && tstzrange(NEW.scheduled_start, NEW.scheduled_end)
  ) THEN
    RAISE EXCEPTION 'appointment_conflict_clinician_busy'
      USING DETAIL = 'Clinician is already booked for another appointment during this interval.';
  END IF;

  -- 2. Check room overlap
  IF NEW.room_label IS NOT NULL AND TRIM(NEW.room_label) <> '' THEN
    IF EXISTS (
      SELECT 1 FROM appointment
      WHERE org_id = NEW.org_id
        AND room_label = NEW.room_label
        AND id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
        AND status NOT IN ('cancelled', 'no_show')
        AND tstzrange(scheduled_start, scheduled_end) && tstzrange(NEW.scheduled_start, NEW.scheduled_end)
    ) THEN
      RAISE EXCEPTION 'appointment_conflict_room_occupied'
        USING DETAIL = 'Room is already occupied by another consultation during this interval.';
    END IF;
  END IF;

  -- 3. Check patient overlap
  IF EXISTS (
    SELECT 1 FROM appointment
    WHERE org_id = NEW.org_id
      AND patient_id = NEW.patient_id
      AND id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
      AND status NOT IN ('cancelled', 'no_show')
      AND tstzrange(scheduled_start, scheduled_end) && tstzrange(NEW.scheduled_start, NEW.scheduled_end)
  ) THEN
    RAISE EXCEPTION 'appointment_conflict_patient_busy'
      USING DETAIL = 'Patient already has an active appointment booked during this time interval.';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
```

---

## 4. User Interfaces & Workflows

1. **Appointment Directory** (`/appointments`):
   - Filter by Status (`All`, `Scheduled`, `Confirmed`, `Waiting`, `Completed`, `Cancelled`).
   - Filter by Clinician (Medical Oncology, Surgical Oncology, Radiation Oncology).
   - Real-time search by patient name or MRN.
   - Quick status transition action buttons with staff confirmation dialogs.
2. **New Appointment Booking Form** (`/appointments/new`):
   - Dynamic patient selection with MRN display.
   - Clinician and department selection.
   - Start and end time selection.
   - Room allocation and appointment type configuration.
   - Instant validation against conflicting bookings or clinician leave.
3. **Calendar View** (`/appointments/calendar`):
   - Day and Week interactive views.
   - Time grid with visual tokens, patient names, and consulting room chips.
   - Quick "Book Slot" shortcut pre-filling selected time and clinician.
4. **Patient Overview Integration** (`/patients/[id]/overview`):
   - Dedicated "Scheduled Appointments" card with upcoming dates, clinician, and token.
   - Direct link to book a follow-up consultation.
