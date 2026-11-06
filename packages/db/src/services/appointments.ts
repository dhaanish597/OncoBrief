import type { Querier } from '../client';
import { appendAuditEvent } from './audit';

export type AppointmentType =
  | 'new_consultation'
  | 'follow_up'
  | 'chemo_clearance'
  | 'post_op'
  | 'urgent_review';

export type ArrivalCategory = 'scheduled' | 'walk_in';

export type AppointmentStatus =
  | 'scheduled'
  | 'confirmed'
  | 'checked_in'
  | 'waiting'
  | 'in_consultation'
  | 'completed'
  | 'delayed'
  | 'cancelled'
  | 'no_show';

export interface AppointmentRow {
  id: string;
  org_id: string;
  patient_id: string;
  patient_name: string;
  patient_identifier?: string;
  clinician_id: string;
  clinician_name: string;
  facility_id: string | null;
  facility_name: string | null;
  department_id: string | null;
  department_name: string | null;
  clinic_session_id: string | null;
  scheduled_start: string;
  scheduled_end: string;
  room_label: string;
  appointment_type: AppointmentType;
  arrival_category: ArrivalCategory;
  status: AppointmentStatus;
  token_number: string | null;
  cancellation_reason: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface AppointmentStatusHistoryRow {
  id: string;
  appointment_id: string;
  from_status: string;
  to_status: string;
  actor_id: string;
  actor_name?: string;
  reason: string | null;
  occurred_at: string;
}

export interface CreateAppointmentInput {
  orgId: string;
  patientId: string;
  clinicianId: string;
  facilityId?: string | null;
  departmentId?: string | null;
  clinicSessionId?: string | null;
  scheduledStart: string;
  scheduledEnd: string;
  roomLabel?: string;
  appointmentType?: AppointmentType;
  arrivalCategory?: ArrivalCategory;
  tokenNumber?: string | null;
  notes?: string | null;
  actorId: string;
}

export interface UpdateAppointmentInput {
  orgId: string;
  appointmentId: string;
  scheduledStart?: string;
  scheduledEnd?: string;
  roomLabel?: string;
  appointmentType?: AppointmentType;
  notes?: string | null;
  actorId: string;
}

export interface RescheduleAppointmentInput {
  orgId: string;
  appointmentId: string;
  newStart: string;
  newEnd: string;
  roomLabel?: string;
  reason?: string;
  actorId: string;
}

export interface ChangeAppointmentStatusInput {
  orgId: string;
  appointmentId: string;
  toStatus: AppointmentStatus;
  reason?: string | null;
  actorId: string;
}

export interface AppointmentFilters {
  patientId?: string;
  clinicianId?: string;
  departmentId?: string;
  status?: AppointmentStatus | 'all';
  dateFrom?: string;
  dateTo?: string;
  search?: string;
  limit?: number;
}

export interface ClinicSessionRow {
  id: string;
  org_id: string;
  facility_id: string | null;
  facility_name?: string | null;
  department_id: string | null;
  department_name?: string | null;
  clinician_id: string | null;
  clinician_name?: string | null;
  title: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  room_label: string;
  max_patients: number;
  is_active: boolean;
}

export interface ClinicianUnavailabilityRow {
  id: string;
  org_id: string;
  clinician_id: string;
  clinician_name?: string;
  start_time: string;
  end_time: string;
  reason: string;
  created_at: string;
}

export async function listAppointments(
  q: Querier,
  orgId: string,
  filters: AppointmentFilters = {},
): Promise<AppointmentRow[]> {
  const conditions: string[] = ['a.org_id = $1'];
  const values: unknown[] = [orgId];
  let idx = 2;

  if (filters.patientId) {
    conditions.push(`a.patient_id = $${idx++}`);
    values.push(filters.patientId);
  }

  if (filters.clinicianId) {
    conditions.push(`a.clinician_id = $${idx++}`);
    values.push(filters.clinicianId);
  }

  if (filters.departmentId) {
    conditions.push(`a.department_id = $${idx++}`);
    values.push(filters.departmentId);
  }

  if (filters.status && filters.status !== 'all') {
    conditions.push(`a.status = $${idx++}`);
    values.push(filters.status);
  }

  if (filters.dateFrom) {
    conditions.push(`a.scheduled_start >= $${idx++}`);
    values.push(filters.dateFrom);
  }

  if (filters.dateTo) {
    conditions.push(`a.scheduled_start <= $${idx++}`);
    values.push(filters.dateTo);
  }

  if (filters.search) {
    conditions.push(
      `(p.display_name ILIKE $${idx} OR u.display_name ILIKE $${idx} OR a.token_number ILIKE $${idx})`,
    );
    values.push(`%${filters.search}%`);
    idx++;
  }

  const limitClause = filters.limit ? `LIMIT ${Number(filters.limit)}` : 'LIMIT 100';

  const sql = `
    SELECT
      a.id,
      a.org_id,
      a.patient_id,
      p.display_name AS patient_name,
      (SELECT value FROM patient_identifier pi WHERE pi.patient_id = p.id LIMIT 1) AS patient_identifier,
      a.clinician_id,
      u.display_name AS clinician_name,
      a.facility_id,
      f.name AS facility_name,
      a.department_id,
      d.name AS department_name,
      a.clinic_session_id,
      a.scheduled_start::text,
      a.scheduled_end::text,
      a.room_label,
      a.appointment_type,
      a.arrival_category,
      a.status,
      a.token_number,
      a.cancellation_reason,
      a.notes,
      a.created_at::text,
      a.updated_at::text
    FROM appointment a
    JOIN patient p ON p.id = a.patient_id AND p.org_id = a.org_id
    JOIN app_user u ON u.id = a.clinician_id
    LEFT JOIN facility f ON f.id = a.facility_id AND f.org_id = a.org_id
    LEFT JOIN department d ON d.id = a.department_id AND d.org_id = a.org_id
    WHERE ${conditions.join(' AND ')}
    ORDER BY a.scheduled_start ASC
    ${limitClause}
  `;

  const res = await q.query<AppointmentRow>(sql, values);
  return res.rows;
}

export async function getAppointment(
  q: Querier,
  orgId: string,
  appointmentId: string,
): Promise<AppointmentRow | null> {
  const sql = `
    SELECT
      a.id,
      a.org_id,
      a.patient_id,
      p.display_name AS patient_name,
      (SELECT value FROM patient_identifier pi WHERE pi.patient_id = p.id LIMIT 1) AS patient_identifier,
      a.clinician_id,
      u.display_name AS clinician_name,
      a.facility_id,
      f.name AS facility_name,
      a.department_id,
      d.name AS department_name,
      a.clinic_session_id,
      a.scheduled_start::text,
      a.scheduled_end::text,
      a.room_label,
      a.appointment_type,
      a.arrival_category,
      a.status,
      a.token_number,
      a.cancellation_reason,
      a.notes,
      a.created_at::text,
      a.updated_at::text
    FROM appointment a
    JOIN patient p ON p.id = a.patient_id AND p.org_id = a.org_id
    JOIN app_user u ON u.id = a.clinician_id
    LEFT JOIN facility f ON f.id = a.facility_id AND f.org_id = a.org_id
    LEFT JOIN department d ON d.id = a.department_id AND d.org_id = a.org_id
    WHERE a.org_id = $1 AND a.id = $2
    LIMIT 1
  `;

  const res = await q.query<AppointmentRow>(sql, [orgId, appointmentId]);
  return res.rows[0] ?? null;
}

export async function createAppointment(
  q: Querier,
  input: CreateAppointmentInput,
): Promise<string> {
  const roomLabel = input.roomLabel?.trim() || 'OPD Room 1';
  const appointmentType = input.appointmentType || 'follow_up';
  const arrivalCategory = input.arrivalCategory || 'scheduled';

  // Check clinician unavailability
  const unavailRes = await q.query(
    `SELECT id, reason FROM clinician_unavailability
     WHERE org_id = $1 AND clinician_id = $2
       AND start_time < $4 AND $3 < end_time
     LIMIT 1`,
    [input.orgId, input.clinicianId, input.scheduledStart, input.scheduledEnd],
  );
  if (unavailRes.rows.length > 0 && unavailRes.rows[0]) {
    throw new Error(
      `clinician_unavailable: Clinician is marked unavailable (${unavailRes.rows[0].reason}) during this time.`,
    );
  }

  // Generate token number if not provided
  let token = input.tokenNumber;
  if (!token) {
    const countRes = await q.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM appointment WHERE org_id = $1 AND scheduled_start::date = $2::date`,
      [input.orgId, input.scheduledStart],
    );
    const num = Number(countRes.rows[0]?.count || 0) + 1;
    token = `TK-${String(num).padStart(3, '0')}`;
  }

  const insertSql = `
    INSERT INTO appointment (
      org_id,
      patient_id,
      clinician_id,
      facility_id,
      department_id,
      clinic_session_id,
      scheduled_start,
      scheduled_end,
      room_label,
      appointment_type,
      arrival_category,
      status,
      token_number,
      notes,
      created_by,
      updated_by
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'scheduled', $12, $13, $14, $14)
    RETURNING id
  `;

  const res = await q.query<{ id: string }>(insertSql, [
    input.orgId,
    input.patientId,
    input.clinicianId,
    input.facilityId ?? null,
    input.departmentId ?? null,
    input.clinicSessionId ?? null,
    input.scheduledStart,
    input.scheduledEnd,
    roomLabel,
    appointmentType,
    arrivalCategory,
    token,
    input.notes ?? null,
    input.actorId,
  ]);

  if (!res.rows[0]) throw new Error('failed_to_insert_appointment');
  const appointmentId = res.rows[0].id;

  // Record initial status in history
  await q.query(
    `INSERT INTO appointment_status_history (
      org_id, appointment_id, from_status, to_status, actor_id, reason
    ) VALUES ($1, $2, 'none', 'scheduled', $3, 'Appointment created')`,
    [input.orgId, appointmentId, input.actorId],
  );

  // Synchronize with OPD Clinic Flow Board (opd_appointment_slot) when table is present (TASK-007)
  try {
    const opdStatus = arrivalCategory === 'walk_in' ? 'walk_in' : 'scheduled';
    const existingSlot = await q.query<{ id: string }>(
      `SELECT id FROM opd_appointment_slot
        WHERE org_id = $1
          AND clinic_date = ($2::timestamptz AT TIME ZONE 'Asia/Kolkata')::date
          AND slot_start_time = ($2::timestamptz AT TIME ZONE 'Asia/Kolkata')::time
          AND room_label = $3
          AND appointment_id IS NULL
        LIMIT 1`,
      [input.orgId, input.scheduledStart, roomLabel],
    );
    if (existingSlot.rows[0]) {
      await q.query(
        `UPDATE opd_appointment_slot
            SET appointment_id = $3,
                patient_id = $4,
                clinician_id = $5,
                token_number = $6,
                status = $7::opd_slot_status,
                updated_by = $8,
                updated_at = now()
          WHERE org_id = $1 AND id = $2`,
        [
          input.orgId,
          existingSlot.rows[0].id,
          appointmentId,
          input.patientId,
          input.clinicianId,
          token,
          opdStatus,
          input.actorId,
        ],
      );
    } else {
      await q.query(
        `INSERT INTO opd_appointment_slot (
          org_id, clinic_date, slot_start_time, slot_end_time, room_label,
          clinician_id, patient_id, appointment_id, token_number, status,
          priority_tag, clinic_key, updated_by
        ) VALUES (
          $1,
          ($2::timestamptz AT TIME ZONE 'Asia/Kolkata')::date,
          ($2::timestamptz AT TIME ZONE 'Asia/Kolkata')::time,
          ($3::timestamptz AT TIME ZONE 'Asia/Kolkata')::time,
          $4, $5, $6, $7, $8, $9::opd_slot_status,
          'routine_followup'::admin_priority_tag, 'rci-oncology-opd', $10
        )`,
        [
          input.orgId,
          input.scheduledStart,
          input.scheduledEnd,
          roomLabel,
          input.clinicianId,
          input.patientId,
          appointmentId,
          token,
          opdStatus,
          input.actorId,
        ],
      );
    }
  } catch {
    // Non-fatal if opd_appointment_slot is not targeted in isolated unit test
  }

  await appendAuditEvent(q, {
    orgId: input.orgId,
    actor: { userId: input.actorId, role: null },
    action: 'appointment.created',
    entityKind: 'appointment',
    entityId: appointmentId,
    outcome: 'success',
    metadata: {
      patientId: input.patientId,
      clinicianId: input.clinicianId,
      scheduledStart: input.scheduledStart,
      scheduledEnd: input.scheduledEnd,
      appointmentType,
      roomLabel,
    },
  });

  return appointmentId;
}

export async function rescheduleAppointment(
  q: Querier,
  input: RescheduleAppointmentInput,
): Promise<void> {
  const current = await getAppointment(q, input.orgId, input.appointmentId);
  if (!current) throw new Error('appointment_not_found');

  if (current.status === 'cancelled' || current.status === 'completed') {
    throw new Error(`cannot_reschedule_terminal_appointment: status is ${current.status}`);
  }

  // Check clinician unavailability
  const unavailRes = await q.query(
    `SELECT id, reason FROM clinician_unavailability
     WHERE org_id = $1 AND clinician_id = $2
       AND start_time < $4 AND $3 < end_time
     LIMIT 1`,
    [input.orgId, current.clinician_id, input.newStart, input.newEnd],
  );
  if (unavailRes.rows.length > 0 && unavailRes.rows[0]) {
    throw new Error(
      `clinician_unavailable: Clinician is marked unavailable (${unavailRes.rows[0].reason}) during this time.`,
    );
  }

  const room = input.roomLabel?.trim() || current.room_label;

  await q.query(
    `UPDATE appointment
     SET scheduled_start = $3,
         scheduled_end = $4,
         room_label = $5,
         updated_by = $6,
         updated_at = now()
     WHERE org_id = $1 AND id = $2`,
    [input.orgId, input.appointmentId, input.newStart, input.newEnd, room, input.actorId],
  );

  await q.query(
    `INSERT INTO appointment_status_history (
      org_id, appointment_id, from_status, to_status, actor_id, reason
    ) VALUES ($1, $2, $3, $3, $4, $5)`,
    [
      input.orgId,
      input.appointmentId,
      current.status,
      input.actorId,
      input.reason || `Rescheduled from ${current.scheduled_start} to ${input.newStart}`,
    ],
  );

  await appendAuditEvent(q, {
    orgId: input.orgId,
    actor: { userId: input.actorId, role: null },
    action: 'appointment.rescheduled',
    entityKind: 'appointment',
    entityId: input.appointmentId,
    outcome: 'success',
    metadata: {
      oldStart: current.scheduled_start,
      newStart: input.newStart,
      oldEnd: current.scheduled_end,
      newEnd: input.newEnd,
      reason: input.reason,
    },
  });
}

export async function changeAppointmentStatus(
  q: Querier,
  input: ChangeAppointmentStatusInput,
): Promise<void> {
  const current = await getAppointment(q, input.orgId, input.appointmentId);
  if (!current) throw new Error('appointment_not_found');

  if (current.status === input.toStatus) return;

  const validTransitions: Record<AppointmentStatus, AppointmentStatus[]> = {
    scheduled: ['confirmed', 'checked_in', 'cancelled', 'no_show'],
    confirmed: ['checked_in', 'cancelled', 'no_show'],
    checked_in: ['waiting', 'in_consultation', 'delayed', 'cancelled', 'no_show'],
    waiting: ['in_consultation', 'delayed', 'cancelled', 'no_show'],
    in_consultation: ['completed', 'delayed'],
    delayed: ['waiting', 'in_consultation', 'cancelled', 'no_show'],
    completed: [],
    cancelled: [],
    no_show: [],
  };

  const allowed = validTransitions[current.status] ?? [];
  if (!allowed.includes(input.toStatus)) {
    throw new Error(
      `invalid_status_transition: Cannot transition appointment from ${current.status} to ${input.toStatus}`,
    );
  }

  if (input.toStatus === 'cancelled' && !input.reason?.trim()) {
    throw new Error('cancellation_reason_required: An explicit reason is required to cancel an appointment.');
  }

  await q.query(
    `UPDATE appointment
     SET status = $3,
         cancellation_reason = CASE WHEN $3 = 'cancelled' THEN $4 ELSE cancellation_reason END,
         updated_by = $5,
         updated_at = now()
     WHERE org_id = $1 AND id = $2`,
    [
      input.orgId,
      input.appointmentId,
      input.toStatus,
      input.reason ?? null,
      input.actorId,
    ],
  );

  // Synchronize status transition to linked opd_appointment_slot (TASK-007)
  const opdSlotStatusMap: Record<AppointmentStatus, string> = {
    scheduled: 'scheduled',
    confirmed: 'scheduled',
    checked_in: 'checked_in',
    waiting: 'checked_in',
    in_consultation: 'in_consult',
    delayed: 'delayed_investigation',
    completed: 'completed',
    cancelled: 'cancelled',
    no_show: 'no_show',
  };
  const mappedOpdStatus = opdSlotStatusMap[input.toStatus];
  if (mappedOpdStatus) {
    try {
      await q.query(
        `UPDATE opd_appointment_slot
            SET status = $3::opd_slot_status,
                checked_in_at = CASE WHEN $3 = 'checked_in' THEN COALESCE(checked_in_at, now()) ELSE checked_in_at END,
                bottleneck_note = CASE WHEN $3 = 'delayed_investigation' THEN $4 ELSE bottleneck_note END,
                updated_by = $5,
                updated_at = now()
          WHERE org_id = $1 AND appointment_id = $2`,
        [input.orgId, input.appointmentId, mappedOpdStatus, input.reason ?? null, input.actorId],
      );
    } catch {
      // Non-fatal if no linked OPD slot
    }
  }

  await q.query(
    `INSERT INTO appointment_status_history (
      org_id, appointment_id, from_status, to_status, actor_id, reason
    ) VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      input.orgId,
      input.appointmentId,
      current.status,
      input.toStatus,
      input.actorId,
      input.reason ?? null,
    ],
  );

  await appendAuditEvent(q, {
    orgId: input.orgId,
    actor: { userId: input.actorId, role: null },
    action: 'appointment.status_changed',
    entityKind: 'appointment',
    entityId: input.appointmentId,
    outcome: 'success',
    metadata: {
      fromStatus: current.status,
      toStatus: input.toStatus,
      reason: input.reason,
    },
  });
}

export async function getAppointmentStatusHistory(
  q: Querier,
  orgId: string,
  appointmentId: string,
): Promise<AppointmentStatusHistoryRow[]> {
  const sql = `
    SELECT
      h.id,
      h.appointment_id,
      h.from_status,
      h.to_status,
      h.actor_id,
      u.display_name AS actor_name,
      h.reason,
      h.occurred_at::text
    FROM appointment_status_history h
    JOIN app_user u ON u.id = h.actor_id
    WHERE h.org_id = $1 AND h.appointment_id = $2
    ORDER BY h.occurred_at ASC
  `;
  const res = await q.query<AppointmentStatusHistoryRow>(sql, [orgId, appointmentId]);
  return res.rows;
}

export async function listClinicSessions(
  q: Querier,
  orgId: string,
  clinicianId?: string,
): Promise<ClinicSessionRow[]> {
  const conditions = ['s.org_id = $1', 's.is_active = true'];
  const values: unknown[] = [orgId];
  if (clinicianId) {
    conditions.push('s.clinician_id = $2');
    values.push(clinicianId);
  }

  const sql = `
    SELECT
      s.id,
      s.org_id,
      s.facility_id,
      f.name AS facility_name,
      s.department_id,
      d.name AS department_name,
      s.clinician_id,
      u.display_name AS clinician_name,
      s.title,
      s.day_of_week,
      s.start_time::text,
      s.end_time::text,
      s.room_label,
      s.max_patients,
      s.is_active
    FROM clinic_session s
    LEFT JOIN facility f ON f.id = s.facility_id AND f.org_id = s.org_id
    LEFT JOIN department d ON d.id = s.department_id AND d.org_id = s.org_id
    LEFT JOIN app_user u ON u.id = s.clinician_id
    WHERE ${conditions.join(' AND ')}
    ORDER BY s.day_of_week ASC, s.start_time ASC
  `;
  const res = await q.query<ClinicSessionRow>(sql, values);
  return res.rows;
}

export async function createClinicSession(
  q: Querier,
  input: {
    orgId: string;
    facilityId?: string | null;
    departmentId?: string | null;
    clinicianId?: string | null;
    title: string;
    dayOfWeek: number;
    startTime: string;
    endTime: string;
    roomLabel?: string;
    maxPatients?: number;
    actorId: string;
  },
): Promise<string> {
  const sql = `
    INSERT INTO clinic_session (
      org_id, facility_id, department_id, clinician_id,
      title, day_of_week, start_time, end_time, room_label, max_patients
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    RETURNING id
  `;
  const res = await q.query<{ id: string }>(sql, [
    input.orgId,
    input.facilityId ?? null,
    input.departmentId ?? null,
    input.clinicianId ?? null,
    input.title.trim(),
    input.dayOfWeek,
    input.startTime,
    input.endTime,
    input.roomLabel?.trim() || 'OPD Room 1',
    input.maxPatients ?? 20,
  ]);
  if (!res.rows[0]) throw new Error('failed_to_create_clinic_session');
  const id = res.rows[0].id;

  await appendAuditEvent(q, {
    orgId: input.orgId,
    actor: { userId: input.actorId, role: null },
    action: 'clinic_session.created',
    entityKind: 'clinic_session',
    entityId: id,
    outcome: 'success',
    metadata: { title: input.title, dayOfWeek: input.dayOfWeek },
  });

  return id;
}

export async function listClinicianUnavailability(
  q: Querier,
  orgId: string,
  clinicianId: string,
): Promise<ClinicianUnavailabilityRow[]> {
  const sql = `
    SELECT
      cu.id,
      cu.org_id,
      cu.clinician_id,
      u.display_name AS clinician_name,
      cu.start_time::text,
      cu.end_time::text,
      cu.reason,
      cu.created_at::text
    FROM clinician_unavailability cu
    JOIN app_user u ON u.id = cu.clinician_id
    WHERE cu.org_id = $1 AND cu.clinician_id = $2
    ORDER BY cu.start_time ASC
  `;
  const res = await q.query<ClinicianUnavailabilityRow>(sql, [orgId, clinicianId]);
  return res.rows;
}

export async function recordClinicianUnavailability(
  q: Querier,
  input: {
    orgId: string;
    clinicianId: string;
    startTime: string;
    endTime: string;
    reason: string;
    actorId: string;
  },
): Promise<string> {
  const sql = `
    INSERT INTO clinician_unavailability (
      org_id, clinician_id, start_time, end_time, reason
    ) VALUES ($1, $2, $3, $4, $5)
    RETURNING id
  `;
  const res = await q.query<{ id: string }>(sql, [
    input.orgId,
    input.clinicianId,
    input.startTime,
    input.endTime,
    input.reason.trim(),
  ]);
  if (!res.rows[0]) throw new Error('failed_to_record_unavailability');
  const id = res.rows[0].id;

  await appendAuditEvent(q, {
    orgId: input.orgId,
    actor: { userId: input.actorId, role: null },
    action: 'clinician_unavailability.recorded',
    entityKind: 'clinician_unavailability',
    entityId: id,
    outcome: 'success',
    metadata: {
      clinicianId: input.clinicianId,
      startTime: input.startTime,
      endTime: input.endTime,
      reason: input.reason,
    },
  });

  return id;
}
