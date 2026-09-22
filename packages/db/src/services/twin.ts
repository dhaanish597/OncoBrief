import {
  computeReadiness,
  evaluateGaps,
  type ChecklistItemDef,
  type DocumentForGap,
  type GapStatus,
  type ReadinessBand,
} from '@oncobrief/domain';
import type { Querier } from '../client.js';
import { appendAuditEvent } from './audit.js';

/**
 * The administrative digital twin (architecture §9).
 *
 * Requirements are declared by humans and version-pinned; gaps are rows, not a
 * rendered count, which is what lets a missing document be the source link on
 * a task. Readiness is a band computed from explicit rules, never a score.
 */

export async function assignChecklist(
  q: Querier,
  input: { orgId: string; patientId: string; templateId: string; userId: string },
): Promise<string> {
  const tpl = await q.query<{ version: number }>(
    'SELECT version FROM checklist_template WHERE id = $1',
    [input.templateId],
  );
  const version = tpl.rows[0]?.version;
  if (!version) throw new Error('checklist_template_not_found');

  const res = await q.query<{ id: string }>(
    `INSERT INTO patient_checklist (org_id, patient_id, template_id, template_version)
     VALUES ($1,$2,$3,$4)
     ON CONFLICT (patient_id, template_id) DO UPDATE SET template_version = EXCLUDED.template_version
     RETURNING id`,
    [input.orgId, input.patientId, input.templateId, version],
  );
  const id = res.rows[0]!.id;

  await appendAuditEvent(q, {
    orgId: input.orgId,
    actor: { userId: input.userId, role: null },
    action: 'checklist.assigned',
    entityKind: 'patient_checklist',
    entityId: id,
    outcome: 'success',
    metadata: { template_id: input.templateId, template_version: version },
  });

  return id;
}

export interface GapRow {
  id: string;
  checklist_item_id: string;
  status: GapStatus;
  label: string;
  requirement_kind: string;
  required_document_type: string;
  satisfied_by_document_id: string | null;
  candidate_document_id: string | null;
  waived_reason: string | null;
  rationale: string;
}

/** Deterministic gap evaluation. No LLM. */
export async function evaluateAndPersistGaps(
  q: Querier,
  orgId: string,
  patientId: string,
): Promise<GapRow[]> {
  const pc = await q.query<{ id: string }>(
    'SELECT id FROM patient_checklist WHERE org_id = $1 AND patient_id = $2 LIMIT 1',
    [orgId, patientId],
  );
  const patientChecklistId = pc.rows[0]?.id;
  if (!patientChecklistId) return [];

  const itemsRes = await q.query<{
    id: string;
    code: string;
    label: string;
    required_document_type: string;
    requirement_kind: ChecklistItemDef['requirementKind'];
    ordinal: number;
    rationale: string;
  }>(
    `SELECT ci.id, ci.code, ci.label, ci.required_document_type, ci.requirement_kind, ci.ordinal, ci.rationale
       FROM patient_checklist pcv
       JOIN checklist_item ci ON ci.template_id = pcv.template_id
      WHERE pcv.id = $1
      ORDER BY ci.ordinal`,
    [patientChecklistId],
  );

  const docsRes = await q.query<{
    id: string;
    document_type: string | null;
    document_date: string | null;
    type_confirmed_by: string | null;
  }>(
    `SELECT id, document_type, document_date::text AS document_date, type_confirmed_by
       FROM document
      WHERE org_id = $1 AND patient_id = $2 AND duplicate_of_document_id IS NULL`,
    [orgId, patientId],
  );

  const existingRes = await q.query<{
    checklist_item_id: string;
    status: GapStatus;
    waived_by: string | null;
    waived_reason: string | null;
  }>(
    `SELECT checklist_item_id, status, waived_by, waived_reason FROM record_gap WHERE patient_checklist_id = $1`,
    [patientChecklistId],
  );

  const items: ChecklistItemDef[] = itemsRes.rows.map((r) => ({
    id: r.id,
    code: r.code,
    label: r.label,
    requiredDocumentType: r.required_document_type as ChecklistItemDef['requiredDocumentType'],
    requirementKind: r.requirement_kind,
    ordinal: r.ordinal,
    rationale: r.rationale,
  }));

  const documents: DocumentForGap[] = docsRes.rows.map((r) => ({
    id: r.id,
    documentType: r.document_type as DocumentForGap['documentType'],
    documentDate: r.document_date,
    typeConfirmed: r.type_confirmed_by !== null,
  }));

  const existing = existingRes.rows.map((r) => ({
    checklistItemId: r.checklist_item_id,
    status: r.status,
    waivedBy: r.waived_by,
    waivedReason: r.waived_reason,
  }));

  const evaluated = evaluateGaps(items, documents, existing);

  const byId = new Map(items.map((i) => [i.id, i]));
  for (const gap of evaluated) {
    await q.query(
      `INSERT INTO record_gap
         (org_id, patient_id, patient_checklist_id, checklist_item_id, status,
          satisfied_by_document_id, candidate_document_id, last_evaluated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7, now())
       ON CONFLICT (patient_checklist_id, checklist_item_id) DO UPDATE SET
         status = EXCLUDED.status,
         satisfied_by_document_id = EXCLUDED.satisfied_by_document_id,
         candidate_document_id = EXCLUDED.candidate_document_id,
         last_evaluated_at = now()`,
      [
        orgId,
        patientId,
        patientChecklistId,
        gap.checklistItemId,
        gap.status,
        gap.satisfiedByDocumentId,
        gap.candidateDocumentId,
      ],
    );
  }

  const rows = await q.query<GapRow>(
    `SELECT rg.id, rg.checklist_item_id, rg.status, ci.label, ci.requirement_kind,
            ci.required_document_type, rg.satisfied_by_document_id, rg.candidate_document_id,
            rg.waived_reason, ci.rationale
       FROM record_gap rg
       JOIN checklist_item ci ON ci.id = rg.checklist_item_id
      WHERE rg.patient_checklist_id = $1
      ORDER BY ci.ordinal`,
    [patientChecklistId],
  );
  void byId;
  return rows.rows;
}

export async function waiveGap(
  q: Querier,
  input: { gapId: string; userId: string; reason: string },
): Promise<void> {
  const res = await q.query<{ org_id: string }>(
    `UPDATE record_gap
        SET status = 'waived', waived_by = $2, waived_reason = $3, last_evaluated_at = now()
      WHERE id = $1 RETURNING org_id`,
    [input.gapId, input.userId, input.reason],
  );
  const orgId = res.rows[0]?.org_id;
  if (!orgId) throw new Error('gap_not_found');
  await appendAuditEvent(q, {
    orgId,
    actor: { userId: input.userId, role: null },
    action: 'gap.waived',
    entityKind: 'record_gap',
    entityId: input.gapId,
    outcome: 'success',
    metadata: { reason: input.reason },
  });
}

export interface ReadinessSnapshotInput {
  orgId: string;
  patientId: string;
  computedBy: string | null;
}

export async function computeAndPersistReadiness(
  q: Querier,
  input: ReadinessSnapshotInput,
): Promise<{ band: ReadinessBand; reasons: string[]; snapshotId: string }> {
  const gaps = await evaluateAndPersistGaps(q, input.orgId, input.patientId);

  const required = gaps.filter((g) => g.requirement_kind === 'required');
  const missingRequired = required.filter((g) => g.status === 'missing').length;
  const missingExpected = gaps.filter(
    (g) => g.requirement_kind === 'expected' && g.status === 'missing',
  ).length;
  const partialItems = gaps.filter((g) => g.status === 'partial').length;
  const satisfiedItems = gaps.filter((g) => g.status === 'satisfied' || g.status === 'waived').length;

  const conflicts = await q.query<{ n: string }>(
    `SELECT count(*)::text AS n FROM conflict_set WHERE org_id = $1 AND patient_id = $2 AND status = 'open'`,
    [input.orgId, input.patientId],
  );
  const unverified = await q.query<{ n: string }>(
    `SELECT count(*)::text AS n
       FROM evidence_state es JOIN evidence_fact ef ON ef.id = es.evidence_fact_id
      WHERE es.org_id = $1 AND es.patient_id = $2 AND es.state = 'extracted'`,
    [input.orgId, input.patientId],
  );
  const tasks = await q.query<{ open: string; overdue: string }>(
    `SELECT
       count(*) FILTER (WHERE status IN ('open','assigned','in_progress','blocked'))::text AS open,
       count(*) FILTER (WHERE status IN ('open','assigned','in_progress','blocked') AND due_on < current_date)::text AS overdue
     FROM admin_task WHERE org_id = $1 AND patient_id = $2`,
    [input.orgId, input.patientId],
  );
  const dups = await q.query<{ n: string }>(
    `SELECT count(*)::text AS n FROM document
      WHERE org_id = $1 AND patient_id = $2 AND duplicate_of_document_id IS NOT NULL`,
    [input.orgId, input.patientId],
  );
  const stale = await q.query<{ n: string }>(
    `SELECT count(DISTINCT es.evidence_fact_id)::text AS n
       FROM evidence_state es
      WHERE es.org_id = $1 AND es.patient_id = $2 AND es.state = 'conflicting'
        AND EXISTS (
          SELECT 1 FROM ledger_entry le
           WHERE le.evidence_fact_id = es.evidence_fact_id AND le.to_state = 'verified')`,
    [input.orgId, input.patientId],
  );

  const counts = {
    requiredItems: required.length,
    satisfiedItems,
    missingRequired,
    missingExpected,
    partialItems,
    unresolvedConflicts: Number(conflicts.rows[0]!.n),
    unverifiedFacts: Number(unverified.rows[0]!.n),
    openTasks: Number(tasks.rows[0]!.open),
    overdueTasks: Number(tasks.rows[0]!.overdue),
    duplicateDocuments: Number(dups.rows[0]!.n),
    staleVerifiedFacts: Number(stale.rows[0]!.n),
  };

  const readiness = computeReadiness(counts);

  const inputsJson = {
    counts,
    gap_ids: gaps.map((g) => g.id),
    reasons: readiness.reasons,
  };

  const ins = await q.query<{ id: string }>(
    `INSERT INTO record_readiness_snapshot
       (org_id, patient_id, required_items, satisfied_items, missing_required, missing_expected,
        partial_items, unresolved_conflicts, unverified_facts, open_tasks, overdue_tasks,
        duplicate_documents, stale_verified_facts, readiness_band, inputs_json)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
     RETURNING id`,
    [
      input.orgId, input.patientId, counts.requiredItems, counts.satisfiedItems, counts.missingRequired,
      counts.missingExpected, counts.partialItems, counts.unresolvedConflicts, counts.unverifiedFacts,
      counts.openTasks, counts.overdueTasks, counts.duplicateDocuments, counts.staleVerifiedFacts,
      readiness.band, JSON.stringify(inputsJson),
    ],
  );

  await appendAuditEvent(q, {
    orgId: input.orgId,
    actor: { userId: input.computedBy, role: null, onBehalfOf: input.computedBy ? null : 'worker' },
    action: 'readiness.computed',
    entityKind: 'patient',
    entityId: input.patientId,
    outcome: 'success',
    metadata: { readiness_band: readiness.band },
  });

  return { band: readiness.band, reasons: readiness.reasons, snapshotId: ins.rows[0]!.id };
}
