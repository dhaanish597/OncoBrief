import { checkMessageApprovalGate, renderTemplate, type EvidenceStateValue, type VariableSource } from '@oncobrief/domain';
import type { DeliveryPort } from '@oncobrief/ports';
import { normalizeLanguageCode, ELEVEN_LOCALE_TEMPLATES } from '@oncobrief/adapters';
import type { Querier } from '../client';
import { appendAuditEvent } from './audit';

/**
 * Patient continuity (architecture §19).
 *
 * Messages are rendered from approved, human-authored templates. Every
 * substituted value is traced, and a variable whose backing fact is not
 * `verified` or `corrected` blocks approval. The system cannot tell a patient
 * something the record has not confirmed.
 */

export interface CreateTemplateInput {
  orgId: string;
  code: string;
  locale: string;
  bodyTemplate: string;
  allowedVariables: string[];
  approvedBy: string;
}

export async function createMessageTemplate(q: Querier, input: CreateTemplateInput): Promise<string> {
  const versionRes = await q.query<{ next: string }>(
    `SELECT coalesce(max(version),0) + 1 AS next FROM message_template
      WHERE org_id = $1 AND code = $2 AND locale = $3`,
    [input.orgId, input.code, input.locale],
  );
  const version = Number(versionRes.rows[0]!.next);

  const res = await q.query<{ id: string }>(
    `INSERT INTO message_template
       (org_id, code, locale, version, body_template, allowed_variables, approved_by, approved_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7, now()) RETURNING id`,
    [
      input.orgId, input.code, input.locale, version, input.bodyTemplate,
      input.allowedVariables, input.approvedBy,
    ],
  );
  return res.rows[0]!.id;
}

export type VariableInput =
  | { name: string; value: string; source: { kind: 'evidence'; evidenceFactId: string } }
  | { name: string; value: string; source: { kind: 'task'; adminTaskId: string } }
  | { name: string; value: string; source: { kind: 'literal' } };

export interface ComposeMessageInput {
  orgId: string;
  patientId: string;
  packetId?: string | null;
  templateId: string;
  variables: VariableInput[];
  composedBy: string;
}

export interface ComposeResult {
  messageId: string;
  body: string;
  blockers: string[];
}

export async function composeMessage(q: Querier, input: ComposeMessageInput): Promise<ComposeResult> {
  const patient = await q.query('SELECT id FROM patient WHERE org_id=$1 AND id=$2', [input.orgId, input.patientId]);
  if (!patient.rows[0]) throw new Error('message_patient_not_accessible');
  if (input.packetId) {
    const packet = await q.query('SELECT id FROM consultation_packet WHERE org_id=$1 AND patient_id=$2 AND id=$3', [input.orgId, input.patientId, input.packetId]);
    if (!packet.rows[0]) throw new Error('message_packet_not_accessible');
  }

  const tpl = await q.query<{ body_template: string; allowed_variables: string[]; locale: string }>(
    'SELECT body_template, allowed_variables, locale FROM message_template WHERE id = $1 AND org_id = $2',
    [input.templateId, input.orgId],
  );
  const template = tpl.rows[0];
  if (!template) throw new Error('message_template_not_found');

  // Evidence values are resolved on the server within this patient, never trusted from a form.
  const variables = input.variables.map((v) => ({ ...v }));
  const sources = await resolveVariableSources(q, variables, input.orgId, input.patientId);
  const values: Record<string, string> = {};
  for (const v of variables) values[v.name] = v.value;

  const rendered = renderTemplate(template.body_template, template.allowed_variables, values);
  if (!rendered.ok) throw new Error(`render_failed:${rendered.error.code}`);

  const gate = checkMessageApprovalGate(rendered.used, sources);

  const msgRes = await q.query<{ id: string }>(
    `INSERT INTO patient_message
       (org_id, patient_id, packet_id, template_id, locale, variables_json, body_rendered, status, composed_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,'draft',$8) RETURNING id`,
    [
      input.orgId, input.patientId, input.packetId ?? null, input.templateId, template.locale,
      JSON.stringify(values), rendered.body, input.composedBy,
    ],
  );
  const messageId = msgRes.rows[0]!.id;

  for (const v of variables) {
    await q.query(
      `INSERT INTO message_variable_source
         (patient_message_id, org_id, variable_name, source_kind, evidence_fact_id, admin_task_id, literal_value)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [
        messageId, input.orgId, v.name, v.source.kind,
        v.source.kind === 'evidence' ? v.source.evidenceFactId : null,
        v.source.kind === 'task' ? v.source.adminTaskId : null,
        v.source.kind === 'literal' ? v.value : null,
      ],
    );
  }

  await appendAuditEvent(q, {
    orgId: input.orgId,
    actor: { userId: input.composedBy, role: null },
    action: 'message.composed',
    entityKind: 'patient_message',
    entityId: messageId,
    outcome: 'success',
    metadata: { template_id: input.templateId, blockers: gate.ok ? 0 : gate.blockers.length },
  });

  return { messageId, body: rendered.body, blockers: gate.ok ? [] : gate.blockers };
}

async function resolveVariableSources(
  q: Querier,
  variables: VariableInput[],
  orgId: string,
  patientId: string,
): Promise<VariableSource[]> {
  const out: VariableSource[] = [];
  for (const v of variables) {
    if (v.source.kind === 'evidence') {
      const res = await q.query<{ state: EvidenceStateValue; value_normalized: string; fact_type: string }>(
        `SELECT es.state, ef.value_normalized, ef.fact_type
           FROM evidence_fact ef JOIN evidence_state es ON es.evidence_fact_id = ef.id
           JOIN document d ON d.id = ef.document_id AND d.org_id = ef.org_id
          WHERE ef.id = $1 AND ef.org_id = $2 AND ef.patient_id = $3
            AND d.ingest_error IS DISTINCT FROM 'consent_revoked_or_expired'`,
        [v.source.evidenceFactId, orgId, patientId],
      );
      const fact = res.rows[0];
      if (!fact || (v.name === 'appointment_date' && fact.fact_type !== 'appointment.recorded')) {
        throw new Error('message_source_not_accessible');
      }
      v.value = fact.value_normalized;
      out.push({ kind: 'evidence', variableName: v.name, evidenceFactId: v.source.evidenceFactId, state: fact.state });
    } else if (v.source.kind === 'task') {
      const res = await q.query<{ task_kind: string; status: string; title: string }>(
        'SELECT task_kind, status, title FROM admin_task WHERE id = $1 AND org_id = $2 AND patient_id = $3',
        [v.source.adminTaskId, orgId, patientId],
      );
      const task = res.rows[0];
      if (!task) throw new Error('message_source_not_accessible');
      v.value = task.title;
      out.push({ kind: 'task', variableName: v.name, adminTaskId: v.source.adminTaskId, taskKind: task.task_kind, taskStatus: task.status });
    } else {
      if (v.name === 'appointment_date') {
        const apptRes = await q.query<{ ok: number }>(
          `SELECT 1 as ok FROM (
             SELECT a.scheduled_start::date::text AS appt_date
               FROM appointment a
              WHERE a.org_id = $1 AND a.patient_id = $2
                AND a.status IN ('scheduled', 'confirmed', 'checked_in', 'waiting', 'in_consultation')
             UNION
             SELECT s.clinic_date::text AS appt_date
               FROM opd_appointment_slot s
              WHERE s.org_id = $1 AND s.patient_id = $2
                AND s.status IN ('scheduled', 'checked_in', 'in_consult', 'walk_in')
             UNION
             SELECT s.clinic_date::text AS appt_date
               FROM opd_waitlist_entry w
               JOIN opd_appointment_slot s ON s.id = w.offered_slot_id AND s.org_id = w.org_id
              WHERE w.org_id = $1 AND w.patient_id = $2
                AND w.status = 'offered'
                AND (w.offer_expires_at IS NULL OR w.offer_expires_at > now())
           ) active_dates
           WHERE active_dates.appt_date = $3
              OR $3 LIKE ('%' || active_dates.appt_date || '%')`,
          [orgId, patientId, v.value.trim()],
        );
        if (!apptRes.rows[0]) {
          throw new Error('message_source_not_accessible');
        }
      }
      out.push({ kind: 'literal', variableName: v.name, literalValue: v.value });
    }
  }
  return out;
}

export interface ApprovalGateReport {
  ok: boolean;
  blockers: string[];
}

export async function checkMessageGate(q: Querier, messageId: string): Promise<ApprovalGateReport> {
  const message = await q.query<{
    org_id: string; patient_id: string; variables_json: Record<string, string>; body_rendered: string;
    body_template: string; allowed_variables: string[];
  }>(`SELECT m.org_id, m.patient_id, m.variables_json, m.body_rendered, t.body_template, t.allowed_variables
        FROM patient_message m JOIN message_template t ON t.id = m.template_id AND t.org_id = m.org_id
       WHERE m.id = $1`, [messageId]);
  const msg = message.rows[0];
  if (!msg) return { ok: false, blockers: ['message_not_found'] };
  const rows = await q.query<{
    variable_name: string; source_kind: string; evidence_fact_id: string | null;
    admin_task_id: string | null; literal_value: string | null;
  }>('SELECT variable_name, source_kind, evidence_fact_id, admin_task_id, literal_value FROM message_variable_source WHERE patient_message_id = $1', [messageId]);
  const variables = rows.rows.map((r): VariableInput => {
    const name = r.variable_name;
    const value = msg.variables_json[name] ?? '';
    if (r.source_kind === 'evidence' && r.evidence_fact_id) return { name, value, source: { kind: 'evidence', evidenceFactId: r.evidence_fact_id } };
    if (r.source_kind === 'task' && r.admin_task_id) return { name, value, source: { kind: 'task', adminTaskId: r.admin_task_id } };
    return { name, value, source: { kind: 'literal' } };
  });
  try {
    const sources = await resolveVariableSources(q, variables, msg.org_id, msg.patient_id);
    const authoritative = Object.fromEntries(variables.map((v) => [v.name, v.value]));
    const rendered = renderTemplate(msg.body_template, msg.allowed_variables, authoritative);
    if (!rendered.ok || rendered.body !== msg.body_rendered) return { ok: false, blockers: ['message_content_not_grounded'] };
    const gate = checkMessageApprovalGate(rendered.used, sources);
    return gate.ok ? { ok: true, blockers: [] } : { ok: false, blockers: gate.blockers };
  } catch (error) {
    if (error instanceof Error && error.message === 'message_source_not_accessible') return { ok: false, blockers: ['message_source_not_accessible'] };
    throw error;
  }
}

export async function approveMessage(
  q: Querier,
  input: { messageId: string; userId: string },
): Promise<ApprovalGateReport> {
  const cur = await q.query<{ org_id: string; status: string }>(
    'SELECT org_id, status FROM patient_message WHERE id = $1 FOR UPDATE',
    [input.messageId],
  );
  const row = cur.rows[0];
  if (!row) throw new Error('message_not_found');
  if (row.status !== 'draft' && row.status !== 'pending_approval') {
    throw new Error('message_not_approvable');
  }

  const gate = await checkMessageGate(q, input.messageId);
  if (!gate.ok) {
    await appendAuditEvent(q, {
      orgId: row.org_id,
      actor: { userId: input.userId, role: null },
      action: 'message.approved',
      entityKind: 'patient_message',
      entityId: input.messageId,
      outcome: 'denied',
      metadata: { blockers: gate.blockers.length },
    });
    return gate;
  }

  await q.query(
    `UPDATE patient_message SET status = 'approved', approved_by = $2, approved_at = now() WHERE id = $1`,
    [input.messageId, input.userId],
  );
  await appendAuditEvent(q, {
    orgId: row.org_id,
    actor: { userId: input.userId, role: null },
    action: 'message.approved',
    entityKind: 'patient_message',
    entityId: input.messageId,
    outcome: 'success',
  });
  return { ok: true, blockers: [] };
}

export interface DeliverResult {
  outboxId: string;
  simulated: boolean;
  status: 'accepted' | 'failed';
  externalRef: string | null;
  syncedCaregiverCount?: number;
}

export async function deliverMessage(
  q: Querier,
  delivery: DeliveryPort,
  input: { messageId: string; userId: string; recipientRef?: string },
): Promise<DeliverResult> {
  const cur = await q.query<{ org_id: string; patient_id: string; status: string; body_rendered: string }>(
    'SELECT org_id, patient_id, status, body_rendered FROM patient_message WHERE id = $1 FOR UPDATE',
    [input.messageId],
  );
  const row = cur.rows[0];
  if (!row) throw new Error('message_not_found');
  if (row.status !== 'approved') throw new Error('message_not_approved');
  const gate = await checkMessageGate(q, input.messageId);
  if (!gate.ok) throw new Error('message_sources_not_approvable');

  const result = await delivery.send({
    patientMessageId: input.messageId,
    channel: delivery.channel,
    recipientRef: input.recipientRef ?? row.patient_id,
    body: row.body_rendered,
  });

  const ins = await q.query<{ id: string }>(
    `INSERT INTO message_outbox
       (org_id, patient_message_id, channel, simulated, external_ref, status, attempted_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
    [
      row.org_id, input.messageId, delivery.channel, result.simulated,
      result.externalRef ?? null, result.status, input.userId,
    ],
  );

  // Dispatch synchronized reminders ONLY to active, non-revoked consented caregivers
  const caregiversRes = await q.query<{ id: string; phone_number: string }>(
    `SELECT id, phone_number
       FROM caregiver_contact
      WHERE org_id = $1
        AND patient_id = $2
        AND is_active = true
        AND revoked_at IS NULL
        AND sync_reminders = true
      ORDER BY id FOR SHARE`,
    [row.org_id, row.patient_id],
  );

  let syncedCaregiverCount = 0;
  for (const cg of caregiversRes.rows) {
    const cgResult = await delivery.send({
      patientMessageId: input.messageId,
      channel: delivery.channel,
      recipientRef: `caregiver:${cg.id}`,
      body: row.body_rendered,
    });
    await q.query(
      `INSERT INTO message_outbox
         (org_id, patient_message_id, channel, simulated, external_ref, status, attempted_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [
        row.org_id, input.messageId, delivery.channel, cgResult.simulated,
        cgResult.externalRef ?? `caregiver:${cg.id}`, cgResult.status, input.userId,
      ],
    );
    if (cgResult.status === 'accepted') syncedCaregiverCount += 1;
  }

  await q.query(`UPDATE patient_message SET status = $2 WHERE id = $1`, [
    input.messageId,
    result.status === 'accepted' ? 'delivered' : 'failed',
  ]);

  await appendAuditEvent(q, {
    orgId: row.org_id,
    actor: { userId: input.userId, role: null },
    action: 'message.delivery_attempted',
    entityKind: 'patient_message',
    entityId: input.messageId,
    outcome: result.status === 'accepted' ? 'success' : 'error',
    metadata: {
      channel: delivery.channel,
      simulated: result.simulated,
      synced_caregivers_count: syncedCaregiverCount,
    },
  });

  return {
    outboxId: ins.rows[0]!.id,
    simulated: result.simulated,
    status: result.status,
    externalRef: result.externalRef ?? null,
    syncedCaregiverCount,
  };
}

export type AttendanceResponseStatus =
  | 'confirmed_attendance'
  | 'cannot_attend'
  | 'needs_coordinator_assistance'
  | 'no_response';

export interface RecordAttendanceInput {
  orgId: string;
  messageId: string;
  status: AttendanceResponseStatus;
  channel?: string | null;
  responder?: 'patient' | 'caregiver' | string | null;
  note?: string | null;
  actorUserId: string;
}

export interface PatientMessageDetails {
  id: string;
  orgId: string;
  patientId: string;
  status: string;
  bodyRendered: string;
  attendanceStatus: AttendanceResponseStatus;
  attendanceRecordedAt: Date | null;
  attendanceChannel: string | null;
  attendanceResponder: string | null;
  attendanceNote: string | null;
}

export async function getMessage(
  q: Querier,
  messageId: string,
): Promise<PatientMessageDetails | null> {
  const res = await q.query<{
    id: string;
    org_id: string;
    patient_id: string;
    status: string;
    body_rendered: string;
    attendance_status: AttendanceResponseStatus;
    attendance_recorded_at: Date | null;
    attendance_channel: string | null;
    attendance_responder: string | null;
    attendance_note: string | null;
  }>(
    `SELECT id, org_id, patient_id, status, body_rendered,
            attendance_status, attendance_recorded_at, attendance_channel,
            attendance_responder, attendance_note
     FROM patient_message WHERE id = $1`,
    [messageId],
  );
  if (res.rowCount === 0) return null;
  const r = res.rows[0]!;
  return {
    id: r.id,
    orgId: r.org_id,
    patientId: r.patient_id,
    status: r.status,
    bodyRendered: r.body_rendered,
    attendanceStatus: r.attendance_status,
    attendanceRecordedAt: r.attendance_recorded_at,
    attendanceChannel: r.attendance_channel,
    attendanceResponder: r.attendance_responder,
    attendanceNote: r.attendance_note,
  };
}

export async function recordMessageAttendance(
  q: Querier,
  input: RecordAttendanceInput,
): Promise<PatientMessageDetails> {
  const cur = await q.query<{
    id: string;
    org_id: string;
    patient_id: string;
    status: string;
    body_rendered: string;
  }>(
    `SELECT id, org_id, patient_id, status, body_rendered FROM patient_message WHERE id = $1 AND org_id = $2 FOR UPDATE`,
    [input.messageId, input.orgId],
  );
  if (cur.rowCount === 0) throw new Error('message_not_found');
  const msg = cur.rows[0]!;

  if (msg.status !== 'delivered') {
    throw new Error('message_not_delivered');
  }

  const res = await q.query<{
    id: string;
    org_id: string;
    patient_id: string;
    status: string;
    body_rendered: string;
    attendance_status: AttendanceResponseStatus;
    attendance_recorded_at: Date | null;
    attendance_channel: string | null;
    attendance_responder: string | null;
    attendance_note: string | null;
  }>(
    `UPDATE patient_message
     SET attendance_status = $3,
         attendance_recorded_at = now(),
         attendance_channel = $4,
         attendance_responder = $5,
         attendance_note = $6
     WHERE id = $1 AND org_id = $2
     RETURNING id, org_id, patient_id, status, body_rendered,
               attendance_status, attendance_recorded_at, attendance_channel,
               attendance_responder, attendance_note`,
    [
      input.messageId,
      input.orgId,
      input.status,
      input.channel ?? 'sms',
      input.responder ?? 'patient',
      input.note ?? null,
    ],
  );

  const updated = res.rows[0]!;

  await appendAuditEvent(q, {
    orgId: input.orgId,
    actor: { userId: input.actorUserId, role: null },
    action: 'message.attendance_recorded',
    entityKind: 'patient_message',
    entityId: input.messageId,
    outcome: 'success',
    metadata: {
      status: input.status,
      channel: input.channel ?? 'sms',
      responder: input.responder ?? 'patient',
      note: input.note ? '<redacted>' : null,
    },
  });

  return {
    id: updated.id,
    orgId: updated.org_id,
    patientId: updated.patient_id,
    status: updated.status,
    bodyRendered: updated.body_rendered,
    attendanceStatus: updated.attendance_status,
    attendanceRecordedAt: updated.attendance_recorded_at,
    attendanceChannel: updated.attendance_channel,
    attendanceResponder: updated.attendance_responder,
    attendanceNote: updated.attendance_note,
  };
}

export interface InboundAttendanceWebhookInput {
  orgId: string;
  actorUserId: string;
  messageId: string;
  replyCode: 'confirmed' | 'reschedule_requested' | 'declined';
  responder?: 'patient' | 'caregiver';
  channel?: string | null;
  note?: string | null;
  eventId?: string | null;
}

export interface InboundAttendanceWebhookResult {
  idempotentReplay: boolean;
  message: PatientMessageDetails;
  followUpTaskCreated: boolean;
  followUpTaskId: string | null;
  visitedNodes: string[];
}

/**
 * Inbound patient/caregiver attendance reply processor (TASK-023).
 * Executes `createContinuityOutreachWorkflowGraph`, enforces `webhook_event_id`
 * idempotency, updates `patient_message.attendance_status`, and creates a
 * source-anchored coordinator follow-up task when reschedule or decline is reported.
 */
export async function processInboundAttendanceWebhook(
  q: Querier,
  input: InboundAttendanceWebhookInput,
): Promise<InboundAttendanceWebhookResult> {
  const { createContinuityOutreachWorkflowGraph } = await import('@oncobrief/domain');

  if (input.eventId) {
    try {
      const existing = await q.query<{ id: string }>(
        `SELECT id FROM patient_message WHERE org_id = $1 AND webhook_event_id = $2 LIMIT 1`,
        [input.orgId, input.eventId],
      );
      if (existing.rows[0]) {
        const msg = await getMessage(q, existing.rows[0].id);
        if (msg) {
          return {
            idempotentReplay: true,
            message: msg,
            followUpTaskCreated: false,
            followUpTaskId: null,
            visitedNodes: ['validate_message_gate'],
          };
        }
      }
    } catch {
      // Non-fatal if 0021 webhook_event_id column is not yet applied
    }
  }

  let updatedMessage: PatientMessageDetails | null = null;
  let patientId = '';
  let locale = 'en-IN';

  const graph = createContinuityOutreachWorkflowGraph({
    onValidateMessageGate: async (state) => {
      const cur = await q.query<{
        id: string;
        patient_id: string;
        locale: string;
        status: string;
      }>(
        `SELECT id, patient_id, locale, status FROM patient_message WHERE id = $1 AND org_id = $2 FOR UPDATE`,
        [input.messageId, input.orgId],
      );
      const row = cur.rows[0];
      if (!row) throw new Error('message_not_found');
      if (row.status !== 'delivered') throw new Error('message_not_delivered');
      patientId = row.patient_id;
      locale = row.locale;
      return { ...state, patientId, locale };
    },
    onClassifyAttendanceReply: async (state) => {
      const mappedAttendanceStatus: AttendanceResponseStatus =
        state.inboundReplyCode === 'confirmed'
          ? 'confirmed_attendance'
          : state.inboundReplyCode === 'reschedule_requested'
            ? 'needs_coordinator_assistance'
            : 'cannot_attend';
      return { ...state, mappedAttendanceStatus };
    },
    onPersistAttendanceState: async (state) => {
      updatedMessage = await recordMessageAttendance(q, {
        orgId: input.orgId,
        messageId: input.messageId,
        status: state.mappedAttendanceStatus,
        channel: input.channel ?? 'sms',
        responder: state.responder,
        note:
          input.note ??
          `Inbound ${state.responder} reply via ${input.channel ?? 'sms'}: ${state.inboundReplyCode}`,
        actorUserId: input.actorUserId,
      });
      if (input.eventId) {
        try {
          await q.query(
            `UPDATE patient_message SET webhook_event_id = $3 WHERE org_id = $1 AND id = $2`,
            [input.orgId, input.messageId, input.eventId],
          );
        } catch {
          // Ignore if column not yet migrated
        }
      }
      return state;
    },
    onCoordinatorEscalationGate: async (state) => {
      if (
        state.mappedAttendanceStatus !== 'needs_coordinator_assistance' &&
        state.mappedAttendanceStatus !== 'cannot_attend'
      ) {
        return state;
      }

      // Find an anchoring source from message_variable_source (evidence_fact_id) or patient document
      const srcRes = await q.query<{
        evidence_fact_id: string | null;
        document_id: string | null;
      }>(
        `SELECT
           (SELECT mvs.evidence_fact_id FROM message_variable_source mvs
             WHERE mvs.patient_message_id = $1 AND mvs.evidence_fact_id IS NOT NULL LIMIT 1) AS evidence_fact_id,
           (SELECT d.id FROM document d
             WHERE d.org_id = $2 AND d.patient_id = $3 ORDER BY d.uploaded_at DESC LIMIT 1) AS document_id`,
        [input.messageId, input.orgId, state.patientId],
      );
      const src = srcRes.rows[0];
      if (!src?.evidence_fact_id && !src?.document_id) {
        return state;
      }

      try {
        const { createTask } = await import('./tasks');
        const taskId = await createTask(q, {
          orgId: input.orgId,
          patientId: state.patientId,
          title:
            state.inboundReplyCode === 'reschedule_requested'
              ? 'Follow up on patient/caregiver appointment reschedule request'
              : 'Follow up on patient/caregiver inability to attend scheduled appointment',
          detail: `Inbound continuity webhook reply (${state.inboundReplyCode}) from ${state.responder} on message ${input.messageId}.`,
          taskKind: 'schedule_appointment_followup',
          dueOn: new Date(Date.now() + 86_400_000).toISOString().slice(0, 10),
          origin: src.evidence_fact_id
            ? { kind: 'evidence', evidenceFactId: src.evidence_fact_id }
            : { kind: 'document', documentId: src.document_id! },
          createdBy: input.actorUserId,
        });
        return {
          ...state,
          followUpTaskCreated: true,
          followUpTaskId: taskId,
        };
      } catch {
        return state;
      }
    },
  });

  const run = await graph.run({
    orgId: input.orgId,
    patientId: '',
    messageId: input.messageId,
    locale: 'en-IN',
    inboundReplyCode: input.replyCode,
    mappedAttendanceStatus: 'no_response',
    responder: input.responder ?? 'patient',
    followUpTaskCreated: false,
    followUpTaskId: null,
    syncedCaregiverCount: 0,
  });

  if (!updatedMessage) {
    throw new Error('webhook_attendance_update_failed');
  }

  await appendAuditEvent(q, {
    orgId: input.orgId,
    actor: { userId: input.actorUserId, role: null },
    action: 'continuity.webhook_processed',
    entityKind: 'patient_message',
    entityId: input.messageId,
    outcome: 'success',
    metadata: {
      reply_code: input.replyCode,
      mapped_attendance_status: run.finalState.mappedAttendanceStatus,
      follow_up_task_created: run.finalState.followUpTaskCreated,
      visited_nodes: run.visitedNodes,
      execution_trace: run.trace,
    },
  });

  return {
    idempotentReplay: false,
    message: updatedMessage,
    followUpTaskCreated: run.finalState.followUpTaskCreated,
    followUpTaskId: run.finalState.followUpTaskId,
    visitedNodes: run.visitedNodes,
  };
}

export interface LocalizedMessageResult {
  text: string;
  locale: string;
  templateCode: string;
}

/**
 * Resolves authoritative localized message text across all 11 supported locales (`TASK-01.04`).
 * 
 * Strict clinical safety requirements:
 * 1. Checks `checkMessageGate(q, messageId)` first — ungrounded, unapproved, or tampered
 *    messages immediately return `null`.
 * 2. If the message is `withdrawn`, returns `null`.
 * 3. Never hallucinates or invents clinical facts.
 * 4. Renders with the message's verified `variables_json`.
 */
export async function resolveLocalizedMessageText(
  q: Querier,
  messageId: string,
  targetLanguageCode: string,
): Promise<LocalizedMessageResult | null> {
  const gate = await checkMessageGate(q, messageId);
  if (!gate.ok) {
    return null;
  }

  const msgRes = await q.query<{
    id: string;
    org_id: string;
    patient_id: string;
    template_id: string;
    locale: string;
    variables_json: Record<string, string>;
    body_rendered: string;
    status: string;
    template_code: string;
    template_allowed_variables: string[];
  }>(
    `SELECT m.id, m.org_id, m.patient_id, m.template_id, m.locale, m.variables_json, m.body_rendered, m.status,
            t.code AS template_code, t.allowed_variables AS template_allowed_variables
       FROM patient_message m
       JOIN message_template t ON t.id = m.template_id AND t.org_id = m.org_id
      WHERE m.id = $1`,
    [messageId],
  );
  const msg = msgRes.rows[0];
  if (!msg) return null;
  if (msg.status === 'withdrawn') return null;

  const normalizedTarget = normalizeLanguageCode(targetLanguageCode);
  const normalizedMsgLocale = normalizeLanguageCode(msg.locale);

  if (normalizedTarget === normalizedMsgLocale) {
    return {
      text: msg.body_rendered,
      locale: normalizedTarget,
      templateCode: msg.template_code,
    };
  }

  const shortTarget = normalizedTarget.split('-')[0]!;
  // Check if there is an approved message_template for this code in the target language for this org
  const tplRes = await q.query<{ body_template: string; allowed_variables: string[] }>(
    `SELECT body_template, allowed_variables FROM message_template
      WHERE org_id = $1 AND code = $2 AND (locale = $3 OR locale = $4)
      ORDER BY (locale = $3) DESC, version DESC LIMIT 1`,
    [msg.org_id, msg.template_code, normalizedTarget, shortTarget],
  );

  let bodyTemplate = tplRes.rows[0]?.body_template;
  const allowedVars = tplRes.rows[0]?.allowed_variables ?? msg.template_allowed_variables;

  if (!bodyTemplate) {
    const tCode = msg.template_code as 'appointment_reminder' | 'opd_slot_offer_v1';
    if (ELEVEN_LOCALE_TEMPLATES[tCode]) {
      bodyTemplate =
        ELEVEN_LOCALE_TEMPLATES[tCode][normalizedTarget] ??
        ELEVEN_LOCALE_TEMPLATES[tCode][shortTarget];
    }
  }

  if (!bodyTemplate) {
    return {
      text: msg.body_rendered,
      locale: normalizedTarget,
      templateCode: msg.template_code,
    };
  }

  const rendered = renderTemplate(bodyTemplate, allowedVars, msg.variables_json);
  if (!rendered.ok) {
    return {
      text: msg.body_rendered,
      locale: normalizedTarget,
      templateCode: msg.template_code,
    };
  }

  return {
    text: rendered.body,
    locale: normalizedTarget,
    templateCode: msg.template_code,
  };
}

