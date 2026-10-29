import type { Querier } from '../client';
import { appendAuditEvent } from './audit';
import { changeAppointmentStatus } from './appointments';

export type EncounterStatus = 'in_progress' | 'completed' | 'amended' | 'cancelled';

export type EncounterType =
  | 'outpatient'
  | 'inpatient'
  | 'emergency'
  | 'tumor_board'
  | 'teleconsult';

export interface EncounterParticipantRow {
  id: string;
  encounter_id: string;
  user_id: string;
  user_name: string;
  role: string;
  joined_at: string;
}

export interface EncounterNoteVersionRow {
  id: string;
  encounter_id: string;
  version: number;
  status: 'draft' | 'finalized' | 'amended';
  title: string;
  chief_complaint: string | null;
  history_present_illness: string | null;
  clinical_assessment: string | null;
  plan_and_instructions: string | null;
  follow_up_instructions: string | null;
  authored_by: string;
  author_name: string;
  finalized_by: string | null;
  finalizer_name: string | null;
  finalized_at: string | null;
  amendment_reason: string | null;
  created_at: string;
}

export interface EncounterRow {
  id: string;
  org_id: string;
  patient_id: string;
  patient_name: string;
  appointment_id: string | null;
  facility_id: string | null;
  facility_name: string | null;
  department_id: string | null;
  department_name: string | null;
  clinician_id: string;
  clinician_name: string;
  encounter_type: EncounterType;
  status: EncounterStatus;
  started_at: string;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
  participants: EncounterParticipantRow[];
  latest_note?: EncounterNoteVersionRow | null;
}

export interface StartEncounterInput {
  orgId: string;
  patientId: string;
  appointmentId?: string | null;
  clinicianId: string;
  encounterType?: EncounterType;
  facilityId?: string | null;
  departmentId?: string | null;
  actorId: string;
}

export interface SaveNoteDraftInput {
  orgId: string;
  encounterId: string;
  title?: string;
  chiefComplaint?: string | null;
  historyPresentIllness?: string | null;
  clinicalAssessment?: string | null;
  planAndInstructions?: string | null;
  followUpInstructions?: string | null;
  actorId: string;
}

export interface FinalizeNoteInput {
  orgId: string;
  encounterId: string;
  noteId: string;
  actorId: string;
}

export interface AmendNoteInput {
  orgId: string;
  encounterId: string;
  noteId: string;
  amendmentReason: string;
  title?: string;
  chiefComplaint?: string | null;
  historyPresentIllness?: string | null;
  clinicalAssessment?: string | null;
  planAndInstructions?: string | null;
  followUpInstructions?: string | null;
  actorId: string;
}

export async function listEncounters(
  q: Querier,
  orgId: string,
  patientId: string,
): Promise<EncounterRow[]> {
  const sql = `
    SELECT
      e.id,
      e.org_id,
      e.patient_id,
      p.display_name AS patient_name,
      e.appointment_id,
      e.facility_id,
      f.name AS facility_name,
      e.department_id,
      d.name AS department_name,
      e.clinician_id,
      u.display_name AS clinician_name,
      e.encounter_type,
      e.status,
      e.started_at::text,
      e.completed_at::text,
      e.created_at::text,
      e.updated_at::text
    FROM encounter e
    JOIN patient p ON p.id = e.patient_id AND p.org_id = e.org_id
    JOIN app_user u ON u.id = e.clinician_id
    LEFT JOIN facility f ON f.id = e.facility_id AND f.org_id = e.org_id
    LEFT JOIN department d ON d.id = e.department_id AND d.org_id = e.org_id
    WHERE e.org_id = $1 AND e.patient_id = $2
    ORDER BY e.started_at DESC
  `;
  const res = await q.query<Omit<EncounterRow, 'participants' | 'latest_note'>>(sql, [orgId, patientId]);

  const encounters: EncounterRow[] = [];
  for (const row of res.rows) {
    const participants = await listEncounterParticipants(q, orgId, row.id);
    const notes = await listEncounterNotes(q, orgId, row.id);
    encounters.push({
      ...row,
      participants,
      latest_note: notes[0] ?? null,
    });
  }
  return encounters;
}

export async function getEncounter(
  q: Querier,
  orgId: string,
  encounterId: string,
): Promise<EncounterRow | null> {
  const sql = `
    SELECT
      e.id,
      e.org_id,
      e.patient_id,
      p.display_name AS patient_name,
      e.appointment_id,
      e.facility_id,
      f.name AS facility_name,
      e.department_id,
      d.name AS department_name,
      e.clinician_id,
      u.display_name AS clinician_name,
      e.encounter_type,
      e.status,
      e.started_at::text,
      e.completed_at::text,
      e.created_at::text,
      e.updated_at::text
    FROM encounter e
    JOIN patient p ON p.id = e.patient_id AND p.org_id = e.org_id
    JOIN app_user u ON u.id = e.clinician_id
    LEFT JOIN facility f ON f.id = e.facility_id AND f.org_id = e.org_id
    LEFT JOIN department d ON d.id = e.department_id AND d.org_id = e.org_id
    WHERE e.org_id = $1 AND e.id = $2
    LIMIT 1
  `;
  const res = await q.query<Omit<EncounterRow, 'participants' | 'latest_note'>>(sql, [orgId, encounterId]);
  if (!res.rows[0]) return null;

  const participants = await listEncounterParticipants(q, orgId, encounterId);
  const notes = await listEncounterNotes(q, orgId, encounterId);

  return {
    ...res.rows[0],
    participants,
    latest_note: notes[0] ?? null,
  };
}

export async function startEncounter(
  q: Querier,
  input: StartEncounterInput,
): Promise<string> {
  const encounterType = input.encounterType || 'outpatient';

  const insertSql = `
    INSERT INTO encounter (
      org_id,
      patient_id,
      appointment_id,
      clinician_id,
      facility_id,
      department_id,
      encounter_type,
      status,
      started_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'in_progress', now())
    RETURNING id
  `;

  const res = await q.query<{ id: string }>(insertSql, [
    input.orgId,
    input.patientId,
    input.appointmentId ?? null,
    input.clinicianId,
    input.facilityId ?? null,
    input.departmentId ?? null,
    encounterType,
  ]);

  if (!res.rows[0]) throw new Error('failed_to_start_encounter');
  const encounterId = res.rows[0].id;

  // Add primary clinician as first participant
  await q.query(
    `INSERT INTO encounter_participant (org_id, encounter_id, user_id, role)
     VALUES ($1, $2, $3, 'attending_oncologist')
     ON CONFLICT (org_id, encounter_id, user_id) DO NOTHING`,
    [input.orgId, encounterId, input.clinicianId],
  );

  // If tied to an appointment, transition appointment to in_consultation
  if (input.appointmentId) {
    try {
      await changeAppointmentStatus(q, {
        orgId: input.orgId,
        appointmentId: input.appointmentId,
        toStatus: 'in_consultation',
        reason: 'Consultation encounter started',
        actorId: input.actorId,
      });
    } catch {
      // Ignore transition error if appointment status transition isn't strictly sequential
    }
  }

  await appendAuditEvent(q, {
    orgId: input.orgId,
    actor: { userId: input.actorId, role: null },
    action: 'encounter.started',
    entityKind: 'encounter',
    entityId: encounterId,
    outcome: 'success',
    metadata: {
      patientId: input.patientId,
      appointmentId: input.appointmentId,
      clinicianId: input.clinicianId,
      encounterType,
    },
  });

  return encounterId;
}

export async function addEncounterParticipant(
  q: Querier,
  input: {
    orgId: string;
    encounterId: string;
    userId: string;
    role: string;
    actorId: string;
  },
): Promise<void> {
  await q.query(
    `INSERT INTO encounter_participant (org_id, encounter_id, user_id, role)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (org_id, encounter_id, user_id)
     DO UPDATE SET role = EXCLUDED.role`,
    [input.orgId, input.encounterId, input.userId, input.role.trim()],
  );

  await appendAuditEvent(q, {
    orgId: input.orgId,
    actor: { userId: input.actorId, role: null },
    action: 'encounter.participant_added',
    entityKind: 'encounter',
    entityId: input.encounterId,
    outcome: 'success',
    metadata: { userId: input.userId, role: input.role },
  });
}

export async function listEncounterParticipants(
  q: Querier,
  orgId: string,
  encounterId: string,
): Promise<EncounterParticipantRow[]> {
  const sql = `
    SELECT
      ep.id,
      ep.encounter_id,
      ep.user_id,
      u.display_name AS user_name,
      ep.role,
      ep.joined_at::text
    FROM encounter_participant ep
    JOIN app_user u ON u.id = ep.user_id
    WHERE ep.org_id = $1 AND ep.encounter_id = $2
    ORDER BY ep.joined_at ASC
  `;
  const res = await q.query<EncounterParticipantRow>(sql, [orgId, encounterId]);
  return res.rows;
}

export async function listEncounterNotes(
  q: Querier,
  orgId: string,
  encounterId: string,
): Promise<EncounterNoteVersionRow[]> {
  const sql = `
    SELECT
      env.id,
      env.encounter_id,
      env.version,
      env.status,
      env.title,
      env.chief_complaint,
      env.history_present_illness,
      env.clinical_assessment,
      env.plan_and_instructions,
      env.follow_up_instructions,
      env.authored_by,
      u.display_name AS author_name,
      env.finalized_by,
      fu.display_name AS finalizer_name,
      env.finalized_at::text,
      env.amendment_reason,
      env.created_at::text
    FROM encounter_note_version env
    JOIN app_user u ON u.id = env.authored_by
    LEFT JOIN app_user fu ON fu.id = env.finalized_by
    WHERE env.org_id = $1 AND env.encounter_id = $2
    ORDER BY env.version DESC
  `;
  const res = await q.query<EncounterNoteVersionRow>(sql, [orgId, encounterId]);
  return res.rows;
}

export async function saveEncounterNoteDraft(
  q: Querier,
  input: SaveNoteDraftInput,
): Promise<string> {
  // Check if an existing draft exists for this encounter
  const existingDraftRes = await q.query<{ id: string; version: number }>(
    `SELECT id, version FROM encounter_note_version
     WHERE org_id = $1 AND encounter_id = $2 AND status = 'draft'
     ORDER BY version DESC LIMIT 1`,
    [input.orgId, input.encounterId],
  );

  const title = input.title?.trim() || 'Consultation Note';

  if (existingDraftRes.rows[0]) {
    const draftId = existingDraftRes.rows[0].id;
    await q.query(
      `UPDATE encounter_note_version
       SET title = $3,
           chief_complaint = $4,
           history_present_illness = $5,
           clinical_assessment = $6,
           plan_and_instructions = $7,
           follow_up_instructions = $8
       WHERE org_id = $1 AND id = $2`,
      [
        input.orgId,
        draftId,
        title,
        input.chiefComplaint ?? null,
        input.historyPresentIllness ?? null,
        input.clinicalAssessment ?? null,
        input.planAndInstructions ?? null,
        input.followUpInstructions ?? null,
      ],
    );
    return draftId;
  }

  // Get max version number
  const maxVersionRes = await q.query<{ max_v: number | null }>(
    `SELECT max(version) AS max_v FROM encounter_note_version
     WHERE org_id = $1 AND encounter_id = $2`,
    [input.orgId, input.encounterId],
  );
  const nextVersion = (maxVersionRes.rows[0]?.max_v ?? 0) + 1;

  const insertSql = `
    INSERT INTO encounter_note_version (
      org_id,
      encounter_id,
      version,
      status,
      title,
      chief_complaint,
      history_present_illness,
      clinical_assessment,
      plan_and_instructions,
      follow_up_instructions,
      authored_by
    ) VALUES ($1, $2, $3, 'draft', $4, $5, $6, $7, $8, $9, $10)
    RETURNING id
  `;

  const res = await q.query<{ id: string }>(insertSql, [
    input.orgId,
    input.encounterId,
    nextVersion,
    title,
    input.chiefComplaint ?? null,
    input.historyPresentIllness ?? null,
    input.clinicalAssessment ?? null,
    input.planAndInstructions ?? null,
    input.followUpInstructions ?? null,
    input.actorId,
  ]);

  if (!res.rows[0]) throw new Error('failed_to_save_draft');
  return res.rows[0].id;
}

export async function finalizeEncounterNote(
  q: Querier,
  input: FinalizeNoteInput,
): Promise<void> {
  const noteRes = await q.query<EncounterNoteVersionRow>(
    `SELECT * FROM encounter_note_version WHERE org_id = $1 AND id = $2 AND encounter_id = $3`,
    [input.orgId, input.noteId, input.encounterId],
  );
  const note = noteRes.rows[0];
  if (!note) throw new Error('note_not_found');
  if (note.status !== 'draft') throw new Error(`cannot_finalize_non_draft: status is ${note.status}`);

  await q.query(
    `UPDATE encounter_note_version
     SET status = 'finalized',
         finalized_by = $4,
         finalized_at = now()
     WHERE org_id = $1 AND id = $2 AND encounter_id = $3`,
    [input.orgId, input.noteId, input.encounterId, input.actorId],
  );

  await appendAuditEvent(q, {
    orgId: input.orgId,
    actor: { userId: input.actorId, role: null },
    action: 'encounter.note_finalized',
    entityKind: 'encounter_note_version',
    entityId: input.noteId,
    outcome: 'success',
    metadata: {
      encounterId: input.encounterId,
      version: note.version,
    },
  });
}

export async function amendEncounterNote(
  q: Querier,
  input: AmendNoteInput,
): Promise<string> {
  if (!input.amendmentReason?.trim()) {
    throw new Error('amendment_reason_required: A documented reason is required to amend a signed clinical note.');
  }

  const noteRes = await q.query<EncounterNoteVersionRow>(
    `SELECT * FROM encounter_note_version WHERE org_id = $1 AND id = $2 AND encounter_id = $3`,
    [input.orgId, input.noteId, input.encounterId],
  );
  const prevNote = noteRes.rows[0];
  if (!prevNote) throw new Error('note_not_found');

  // Mark previous note as amended
  await q.query(
    `UPDATE encounter_note_version
     SET status = 'amended'
     WHERE org_id = $1 AND id = $2`,
    [input.orgId, input.noteId],
  );

  // Get next version number
  const maxVersionRes = await q.query<{ max_v: number | null }>(
    `SELECT max(version) AS max_v FROM encounter_note_version
     WHERE org_id = $1 AND encounter_id = $2`,
    [input.orgId, input.encounterId],
  );
  const nextVersion = (maxVersionRes.rows[0]?.max_v ?? prevNote.version) + 1;

  const title = input.title?.trim() || prevNote.title;
  const chiefComplaint = input.chiefComplaint !== undefined ? input.chiefComplaint : prevNote.chief_complaint;
  const historyPresentIllness = input.historyPresentIllness !== undefined ? input.historyPresentIllness : prevNote.history_present_illness;
  const clinicalAssessment = input.clinicalAssessment !== undefined ? input.clinicalAssessment : prevNote.clinical_assessment;
  const planAndInstructions = input.planAndInstructions !== undefined ? input.planAndInstructions : prevNote.plan_and_instructions;
  const followUpInstructions = input.followUpInstructions !== undefined ? input.followUpInstructions : prevNote.follow_up_instructions;

  const insertSql = `
    INSERT INTO encounter_note_version (
      org_id,
      encounter_id,
      version,
      status,
      title,
      chief_complaint,
      history_present_illness,
      clinical_assessment,
      plan_and_instructions,
      follow_up_instructions,
      authored_by,
      finalized_by,
      finalized_at,
      amendment_reason
    ) VALUES ($1, $2, $3, 'finalized', $4, $5, $6, $7, $8, $9, $10, $10, now(), $11)
    RETURNING id
  `;

  const res = await q.query<{ id: string }>(insertSql, [
    input.orgId,
    input.encounterId,
    nextVersion,
    title,
    chiefComplaint,
    historyPresentIllness,
    clinicalAssessment,
    planAndInstructions,
    followUpInstructions,
    input.actorId,
    input.amendmentReason.trim(),
  ]);

  if (!res.rows[0]) throw new Error('failed_to_amend_note');
  const newNoteId = res.rows[0].id;

  // Also update encounter status to amended
  await q.query(
    `UPDATE encounter SET status = 'amended', updated_at = now() WHERE org_id = $1 AND id = $2`,
    [input.orgId, input.encounterId],
  );

  await appendAuditEvent(q, {
    orgId: input.orgId,
    actor: { userId: input.actorId, role: null },
    action: 'encounter.note_amended',
    entityKind: 'encounter_note_version',
    entityId: newNoteId,
    outcome: 'success',
    metadata: {
      encounterId: input.encounterId,
      previousVersion: prevNote.version,
      newVersion: nextVersion,
      amendmentReason: input.amendmentReason,
    },
  });

  return newNoteId;
}

export async function completeEncounter(
  q: Querier,
  input: {
    orgId: string;
    encounterId: string;
    actorId: string;
  },
): Promise<void> {
  const enc = await getEncounter(q, input.orgId, input.encounterId);
  if (!enc) throw new Error('encounter_not_found');

  await q.query(
    `UPDATE encounter
     SET status = 'completed',
         completed_at = now(),
         updated_at = now()
     WHERE org_id = $1 AND id = $2`,
    [input.orgId, input.encounterId],
  );

  // If tied to an appointment, complete appointment
  if (enc.appointment_id) {
    try {
      await changeAppointmentStatus(q, {
        orgId: input.orgId,
        appointmentId: enc.appointment_id,
        toStatus: 'completed',
        reason: 'Consultation encounter completed',
        actorId: input.actorId,
      });
    } catch {
      // Ignore transition error
    }
  }

  await appendAuditEvent(q, {
    orgId: input.orgId,
    actor: { userId: input.actorId, role: null },
    action: 'encounter.completed',
    entityKind: 'encounter',
    entityId: input.encounterId,
    outcome: 'success',
    metadata: {
      patientId: enc.patient_id,
      startedAt: enc.started_at,
    },
  });
}
