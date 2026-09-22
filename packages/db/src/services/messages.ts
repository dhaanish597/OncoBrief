import { checkMessageApprovalGate, renderTemplate, type EvidenceStateValue, type VariableSource } from '@oncobrief/domain';
import type { DeliveryPort } from '@oncobrief/ports';
import type { Querier } from '../client.js';
import { appendAuditEvent } from './audit.js';

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
  const tpl = await q.query<{ body_template: string; allowed_variables: string[]; locale: string }>(
    'SELECT body_template, allowed_variables, locale FROM message_template WHERE id = $1 AND org_id = $2',
    [input.templateId, input.orgId],
  );
  const template = tpl.rows[0];
  if (!template) throw new Error('message_template_not_found');

  const values: Record<string, string> = {};
  for (const v of input.variables) values[v.name] = v.value;

  const rendered = renderTemplate(template.body_template, template.allowed_variables, values);
  if (!rendered.ok) throw new Error(`render_failed:${rendered.error.code}`);

  const sources = await resolveVariableSources(q, input.variables);
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

  for (const v of input.variables) {
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
): Promise<VariableSource[]> {
  const out: VariableSource[] = [];
  for (const v of variables) {
    if (v.source.kind === 'evidence') {
      const res = await q.query<{ state: EvidenceStateValue | null }>(
        'SELECT state FROM evidence_state WHERE evidence_fact_id = $1',
        [v.source.evidenceFactId],
      );
      out.push({
        kind: 'evidence',
        variableName: v.name,
        evidenceFactId: v.source.evidenceFactId,
        state: res.rows[0]?.state ?? 'extracted',
      });
    } else if (v.source.kind === 'task') {
      const res = await q.query<{ task_kind: string; status: string }>(
        'SELECT task_kind, status FROM admin_task WHERE id = $1',
        [v.source.adminTaskId],
      );
      out.push({
        kind: 'task',
        variableName: v.name,
        adminTaskId: v.source.adminTaskId,
        taskKind: res.rows[0]?.task_kind ?? 'unknown',
        taskStatus: res.rows[0]?.status ?? 'open',
      });
    } else {
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
  const rows = await q.query<{
    variable_name: string; source_kind: string; evidence_fact_id: string | null;
    admin_task_id: string | null; literal_value: string | null;
  }>(
    'SELECT variable_name, source_kind, evidence_fact_id, admin_task_id, literal_value FROM message_variable_source WHERE patient_message_id = $1',
    [messageId],
  );

  const sources: VariableSource[] = [];
  for (const r of rows.rows) {
    if (r.source_kind === 'evidence' && r.evidence_fact_id) {
      const st = await q.query<{ state: EvidenceStateValue | null }>(
        'SELECT state FROM evidence_state WHERE evidence_fact_id = $1',
        [r.evidence_fact_id],
      );
      sources.push({
        kind: 'evidence',
        variableName: r.variable_name,
        evidenceFactId: r.evidence_fact_id,
        state: st.rows[0]?.state ?? 'extracted',
      });
    } else if (r.source_kind === 'task' && r.admin_task_id) {
      const t = await q.query<{ task_kind: string; status: string }>(
        'SELECT task_kind, status FROM admin_task WHERE id = $1',
        [r.admin_task_id],
      );
      sources.push({
        kind: 'task',
        variableName: r.variable_name,
        adminTaskId: r.admin_task_id,
        taskKind: t.rows[0]?.task_kind ?? 'unknown',
        taskStatus: t.rows[0]?.status ?? 'open',
      });
    } else {
      sources.push({
        kind: 'literal',
        variableName: r.variable_name,
        literalValue: r.literal_value ?? '',
      });
    }
  }

  const gate = checkMessageApprovalGate(
    sources.map((s) => s.variableName),
    sources,
  );
  return gate.ok ? { ok: true, blockers: [] } : { ok: false, blockers: gate.blockers };
}

export async function approveMessage(
  q: Querier,
  input: { messageId: string; userId: string },
): Promise<ApprovalGateReport> {
  const cur = await q.query<{ org_id: string; status: string }>(
    'SELECT org_id, status FROM patient_message WHERE id = $1',
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
}

export async function deliverMessage(
  q: Querier,
  delivery: DeliveryPort,
  input: { messageId: string; userId: string; recipientRef?: string },
): Promise<DeliverResult> {
  const cur = await q.query<{ org_id: string; patient_id: string; status: string; body_rendered: string }>(
    'SELECT org_id, patient_id, status, body_rendered FROM patient_message WHERE id = $1',
    [input.messageId],
  );
  const row = cur.rows[0];
  if (!row) throw new Error('message_not_found');
  if (row.status !== 'approved') throw new Error('message_not_approved');

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
    metadata: { channel: delivery.channel, simulated: result.simulated },
  });

  return {
    outboxId: ins.rows[0]!.id,
    simulated: result.simulated,
    status: result.status,
    externalRef: result.externalRef ?? null,
  };
}
