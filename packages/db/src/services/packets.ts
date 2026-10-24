import {
  assemblePacket,
  hashPacketSnapshot,
  exportToAbdmDocumentBundle,
  exportToMCodeBundle,
  type AssembledPacket,
  type PacketConflictSnapshot,
  type PacketFactSnapshot,
  type PacketGapSnapshot,
  type PacketInput,
  type PacketTaskSnapshot,
  type FactWithProvenance,
  type PacketSnapshot,
} from '@oncobrief/domain';
import type { Querier } from '../client';
import { appendAuditEvent } from './audit';

/**
 * Consultation packet (architecture §11).
 *
 * Approval freezes; it does not transform. On approval the server serialises
 * the fully resolved packet, hashes it, and records the ledger position. Later
 * ledger activity cannot alter an approved packet.
 */

async function gatherPacketInput(q: Querier, orgId: string, patientId: string): Promise<PacketInput> {
  const factsRes = await q.query<{
    id: string; fact_type: string; value_normalized: string; verbatim_quote: string;
    document_id: string; original_filename: string; page_number: number | null;
    state: string; confidence_band: string; extractor_kind: string;
    reviewer_name: string | null; last_changed_at: Date | null;
  }>(
    `SELECT ef.id, ef.fact_type, ef.value_normalized, ef.verbatim_quote, ef.document_id,
            d.original_filename,
            (SELECT dp.page_number
               FROM evidence_span_link esl
               JOIN text_span ts ON ts.id = esl.text_span_id
               JOIN document_page dp ON dp.id = ts.page_id
              WHERE esl.evidence_fact_id = ef.id
              ORDER BY esl.ordinal LIMIT 1) AS page_number,
            coalesce(es.state,'extracted') AS state,
            ef.confidence_band, ef.extractor_kind,
            u.display_name AS reviewer_name, es.last_changed_at
       FROM evidence_fact ef
       JOIN document d ON d.id = ef.document_id
       LEFT JOIN evidence_state es ON es.evidence_fact_id = ef.id
       LEFT JOIN app_user u ON u.id = es.last_actor_id
      WHERE ef.org_id = $1 AND ef.patient_id = $2
        AND coalesce(es.state,'extracted') NOT IN ('rejected','superseded')
      ORDER BY ef.fact_type, ef.created_at`,
    [orgId, patientId],
  );

  const facts: PacketFactSnapshot[] = factsRes.rows.map((r) => ({
    evidenceFactId: r.id,
    factType: r.fact_type as PacketFactSnapshot['factType'],
    valueText: r.value_normalized,
    verbatimQuote: r.verbatim_quote,
    documentId: r.document_id,
    documentName: r.original_filename,
    pageNumber: r.page_number ?? 1,
    state: r.state as PacketFactSnapshot['state'],
    confidenceBand: r.confidence_band,
    extractorKind: r.extractor_kind,
    reviewerName: r.reviewer_name,
    reviewedAt: r.last_changed_at ? r.last_changed_at.toISOString() : null,
  }));

  const gapsRes = await q.query<{
    id: string; label: string; requirement_kind: string; status: string;
  }>(
    `SELECT rg.id, ci.label, ci.requirement_kind, rg.status
       FROM record_gap rg JOIN checklist_item ci ON ci.id = rg.checklist_item_id
      WHERE rg.org_id = $1 AND rg.patient_id = $2
      ORDER BY ci.ordinal`,
    [orgId, patientId],
  );
  const gaps: PacketGapSnapshot[] = gapsRes.rows.map((r) => ({
    recordGapId: r.id,
    checklistItemLabel: r.label,
    requirementKind: r.requirement_kind,
    status: r.status as PacketGapSnapshot['status'],
  }));

  const conflictsRes = await q.query<{
    id: string; fact_type: string; slot_key: string; detection_reason: string;
  }>(
    `SELECT id, fact_type, slot_key, detection_reason FROM conflict_set
      WHERE org_id = $1 AND patient_id = $2 AND status = 'open'
      ORDER BY detected_at`,
    [orgId, patientId],
  );
  const conflicts: PacketConflictSnapshot[] = [];
  for (const c of conflictsRes.rows) {
    const values = await q.query<{ value_normalized: string }>(
      `SELECT ef.value_normalized
         FROM conflict_member cm JOIN evidence_fact ef ON ef.id = cm.evidence_fact_id
        WHERE cm.conflict_set_id = $1`,
      [c.id],
    );
    conflicts.push({
      conflictSetId: c.id,
      factType: c.fact_type,
      slotKey: c.slot_key,
      reason: c.detection_reason,
      memberValueTexts: values.rows.map((v) => v.value_normalized),
    });
  }

  const tasksRes = await q.query<{
    id: string; title: string; task_kind: string; status: string; due_on: string | null; origin_kind: string;
  }>(
    `SELECT id, title, task_kind, status, due_on, origin_kind FROM admin_task
      WHERE org_id = $1 AND patient_id = $2 AND status NOT IN ('done','cancelled')
      ORDER BY created_at`,
    [orgId, patientId],
  );
  const tasks: PacketTaskSnapshot[] = tasksRes.rows.map((r) => ({
    taskId: r.id,
    title: r.title,
    taskKind: r.task_kind,
    status: r.status,
    dueOn: r.due_on,
    originKind: r.origin_kind,
  }));

  return { facts, gaps, conflicts, tasks };
}

export interface CreatePacketInput {
  orgId: string;
  patientId: string;
  encounterLabel: string;
  userId: string;
}

export async function createPacket(
  q: Querier,
  input: CreatePacketInput,
): Promise<{ packetId: string; assembled: AssembledPacket }> {
  const readiness = await q.query<{ id: string }>(
    `SELECT id FROM record_readiness_snapshot WHERE org_id = $1 AND patient_id = $2
      ORDER BY computed_at DESC LIMIT 1`,
    [input.orgId, input.patientId],
  );

  const packetRes = await q.query<{ id: string }>(
    `INSERT INTO consultation_packet (org_id, patient_id, encounter_label, status, readiness_snapshot_id, created_by)
     VALUES ($1,$2,$3,'draft',$4,$5) RETURNING id`,
    [input.orgId, input.patientId, input.encounterLabel, readiness.rows[0]?.id ?? null, input.userId],
  );
  const packetId = packetRes.rows[0]!.id;

  const assembled = await refreshPacketItems(q, input.orgId, input.patientId, packetId);

  await appendAuditEvent(q, {
    orgId: input.orgId,
    actor: { userId: input.userId, role: null },
    action: 'packet.created',
    entityKind: 'consultation_packet',
    entityId: packetId,
    outcome: 'success',
    metadata: {
      open_conflicts: assembled.counts.openConflicts,
      missing_documents: assembled.counts.missingDocuments,
    },
  });

  return { packetId, assembled };
}

export async function refreshPacketItems(
  q: Querier,
  orgId: string,
  patientId: string,
  packetId: string,
): Promise<AssembledPacket> {
  const input = await gatherPacketInput(q, orgId, patientId);
  const assembled = assemblePacket(input);

  await q.query(`DELETE FROM packet_item WHERE packet_id = $1`, [packetId]);
  for (const section of assembled.sections) {
    for (const item of section.items) {
      await q.query(
        `INSERT INTO packet_item
           (org_id, packet_id, section, ordinal, evidence_fact_id, record_gap_id, conflict_set_id, task_id, state_at_snapshot, inclusion_reason)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [
          orgId, packetId, section.section, item.ordinal,
          item.evidenceFactId ?? null, item.recordGapId ?? null, item.conflictSetId ?? null,
          item.taskId ?? null, item.stateAtSnapshot ?? null, item.inclusionReason,
        ],
      );
    }
  }
  return assembled;
}

export async function submitPacket(
  q: Querier,
  input: { packetId: string; userId: string },
): Promise<void> {
  const res = await q.query<{ org_id: string }>(
    `UPDATE consultation_packet SET status = 'pending_approval', submitted_by = $2, submitted_at = now()
      WHERE id = $1 AND status = 'draft' RETURNING org_id`,
    [input.packetId, input.userId],
  );
  const orgId = res.rows[0]?.org_id;
  if (!orgId) throw new Error('packet_not_draft');
  await appendAuditEvent(q, {
    orgId,
    actor: { userId: input.userId, role: null },
    action: 'packet.submitted',
    entityKind: 'consultation_packet',
    entityId: input.packetId,
    outcome: 'success',
  });
}

export async function approvePacket(
  q: Querier,
  input: { packetId: string; userId: string; approvalNote?: string | null },
): Promise<{ snapshotSha256: string }> {
  const cur = await q.query<{ org_id: string; patient_id: string; status: string }>(
    'SELECT org_id, patient_id, status FROM consultation_packet WHERE id = $1',
    [input.packetId],
  );
  const row = cur.rows[0];
  if (!row) throw new Error('packet_not_found');
  if (row.status !== 'pending_approval' && row.status !== 'draft') {
    throw new Error('packet_not_approvable');
  }

  // Re-assemble at approval time so the frozen snapshot reflects the ledger
  // as it stands now, and capture that ledger position.
  const assembled = await refreshPacketItems(q, row.org_id, row.patient_id, input.packetId);

  const seqRes = await q.query<{ seq: string | null }>(
    'SELECT max(seq)::text AS seq FROM ledger_entry WHERE org_id = $1',
    [row.org_id],
  );
  const ledgerSeq = Number(seqRes.rows[0]?.seq ?? 0);

  const approvedAt = new Date().toISOString();
  const snapshot = {
    assembled,
    ledgerSeqAtApproval: ledgerSeq,
    approvedBy: input.userId,
    approvedAt,
    approvalNote: input.approvalNote ?? null,
  };
  const hash = hashPacketSnapshot(snapshot);

  await q.query(
    `UPDATE consultation_packet
        SET status = 'approved', snapshot_json = $2, snapshot_sha256 = decode($3,'hex'),
            ledger_seq_at_approval = $4, approved_by = $5, approved_at = $6, approval_note = $7
      WHERE id = $1`,
    [
      input.packetId, JSON.stringify(snapshot), hash, ledgerSeq, input.userId, approvedAt,
      input.approvalNote ?? null,
    ],
  );

  await appendAuditEvent(q, {
    orgId: row.org_id,
    actor: { userId: input.userId, role: null },
    action: 'packet.approved',
    entityKind: 'consultation_packet',
    entityId: input.packetId,
    outcome: 'success',
    metadata: { snapshot_sha256: hash, ledger_seq_at_approval: ledgerSeq },
  });

  return { snapshotSha256: hash };
}

export async function withdrawPacket(
  q: Querier,
  input: { packetId: string; userId: string; reason: string },
): Promise<void> {
  const res = await q.query<{ org_id: string }>(
    `UPDATE consultation_packet SET status = 'withdrawn', approval_note = $2
      WHERE id = $1 AND status IN ('draft','pending_approval') RETURNING org_id`,
    [input.packetId, input.reason],
  );
  const orgId = res.rows[0]?.org_id;
  if (!orgId) throw new Error('packet_not_withdrawable');
}

export interface PacketDetail {
  id: string;
  status: string;
  encounterLabel: string;
  ledgerSeqAtApproval: number | null;
  snapshotSha256: string | null;
  assembled: AssembledPacket | null;
  ledgerAdvanced: boolean;
  sourcesUnavailable?: boolean;
}

export async function getPacket(
  q: Querier,
  orgId: string,
  packetId: string,
): Promise<PacketDetail | null> {
  const res = await q.query<{
    id: string; status: string; encounter_label: string; snapshot_json: unknown;
    snapshot_sha256: Buffer | null; ledger_seq_at_approval: string | null; org_id: string;
    patient_id: string;
  }>(
    `SELECT id, status, encounter_label, snapshot_json, snapshot_sha256, ledger_seq_at_approval, org_id, patient_id
       FROM consultation_packet WHERE id = $1 AND org_id = $2`,
    [packetId, orgId],
  );
  const row = res.rows[0];
  if (!row) return null;

  const maxSeq = await q.query<{ seq: string | null }>(
    'SELECT max(seq)::text AS seq FROM ledger_entry WHERE org_id = $1',
    [orgId],
  );
  const currentSeq = Number(maxSeq.rows[0]?.seq ?? 0);
  const approvedSeq = row.ledger_seq_at_approval ? Number(row.ledger_seq_at_approval) : null;

  const snapshot = row.snapshot_json as { assembled?: AssembledPacket } | null;

  // An approved packet is read from its frozen snapshot. A draft has no
  // snapshot yet, so it is rendered live from the ledger as it stands now —
  // read-only, and clearly labelled in the UI as not yet frozen.
  let assembled: AssembledPacket | null = snapshot?.assembled ?? null;
  if (!assembled) {
    assembled = assemblePacket(await gatherPacketInput(q, orgId, row.patient_id));
  }

  let sourcesUnavailable = false;
  if (snapshot?.assembled) {
    try {
      await assertPacketSourcesAccessible(q, orgId, packetId);
    } catch {
      sourcesUnavailable = true;
      assembled = null;
    }
  }

  return {
    id: row.id,
    status: row.status,
    sourcesUnavailable,
    encounterLabel: row.encounter_label,
    ledgerSeqAtApproval: approvedSeq,
    snapshotSha256: row.snapshot_sha256 ? row.snapshot_sha256.toString('hex') : null,
    assembled,
    ledgerAdvanced: approvedSeq !== null && currentSeq > approvedSeq,
  };
}

export function packetExportJson(detail: PacketDetail): string {
  return JSON.stringify(
    {
      packet_id: detail.id,
      encounter_label: detail.encounterLabel,
      status: detail.status,
      snapshot_sha256: detail.snapshotSha256,
      ledger_seq_at_approval: detail.ledgerSeqAtApproval,
      sections: detail.assembled?.sections ?? [],
      counts: detail.assembled?.counts ?? null,
    },
    null,
    2,
  );
}

export async function assertPacketSourcesAccessible(
  q: Querier,
  orgId: string,
  packetId: string,
): Promise<void> {
  // The approved snapshot is authoritative. packet_item is a mutable draft projection.
  const packet = await q.query<{ patient_id: string; snapshot_json: PacketSnapshot | null }>(
    'SELECT patient_id, snapshot_json FROM consultation_packet WHERE org_id=$1 AND id=$2',
    [orgId, packetId],
  );
  const row = packet.rows[0];
  if (!row) throw new Error('packet_not_found');
  const factIds: string[] = [];
  const conflictIds: string[] = [];
  for (const section of row.snapshot_json?.assembled?.sections ?? []) {
    for (const item of section.items) {
      if (item.fact) factIds.push(item.fact.evidenceFactId);
      if (item.conflict) conflictIds.push(item.conflict.conflictSetId);
    }
  }
  const res = await q.query<{ withdrawn_count: number }>(
    `WITH referenced AS (
       SELECT unnest($3::uuid[]) AS fact_id
       UNION SELECT evidence_fact_id FROM conflict_member
         WHERE org_id=$1 AND conflict_set_id=ANY($4::uuid[])
       UNION SELECT evidence_fact_id FROM packet_item
         WHERE org_id=$1 AND packet_id=$2 AND evidence_fact_id IS NOT NULL
     )
     SELECT count(*)::int AS withdrawn_count FROM referenced r
     WHERE NOT EXISTS (
       SELECT 1 FROM evidence_fact ef JOIN document d ON d.id=ef.document_id
       WHERE ef.id=r.fact_id AND ef.org_id=$1 AND ef.patient_id=$5
         AND d.ingest_error IS DISTINCT FROM 'consent_revoked_or_expired'
     )`,
    [orgId, packetId, factIds, conflictIds, row.patient_id],
  );
  if (!res.rows[0] || res.rows[0].withdrawn_count > 0) {
    throw new Error('packet_source_withdrawn');
  }
}

export async function getPacketExportBundle(
  q: Querier,
  orgId: string,
  packetId: string,
  format: 'abdm' | 'mcode',
): Promise<unknown> {
  const rowRes = await q.query<{
    id: string;
    patient_id: string;
    status: string;
    encounter_label: string;
    snapshot_json: { assembled?: AssembledPacket } | null;
    approved_by: string;
  }>(
    `SELECT id, patient_id, status, encounter_label, snapshot_json, approved_by
       FROM consultation_packet
      WHERE id = $1 AND org_id = $2`,
    [packetId, orgId],
  );
  const row = rowRes.rows[0];
  if (!row) throw new Error('packet_not_found');
  if (row.status !== 'approved') throw new Error('packet_not_approved');

  await assertPacketSourcesAccessible(q, orgId, packetId);

  const pRes = await q.query<{ display_name: string }>(
    `SELECT display_name FROM patient WHERE org_id = $1 AND id = $2`,
    [orgId, row.patient_id],
  );
  const patient = pRes.rows[0];

  const linkRes = await q.query<{ abha_number: string | null; abha_address: string }>(
    `SELECT abha_number, abha_address FROM abdm_patient_link WHERE org_id = $1 AND patient_id = $2`,
    [orgId, row.patient_id],
  );
  const link = linkRes.rows[0];

  const orgRes = await q.query<{ name: string; hfr_facility_id: string | null }>(
    `SELECT name, hfr_facility_id FROM organization WHERE id = $1`,
    [orgId],
  );
  const org = orgRes.rows[0];

  const userRes = await q.query<{ display_name: string; hpr_id: string | null }>(
    `SELECT display_name, hpr_id FROM app_user WHERE id = $1`,
    [row.approved_by],
  );
  const user = userRes.rows[0];

  const snapshot = row.snapshot_json;
  const facts: FactWithProvenance[] = [];

  if (snapshot?.assembled?.sections) {
    for (const sec of snapshot.assembled.sections) {
      for (const item of sec.items) {
        if (item.fact && item.fact.evidenceFactId && item.fact.valueText && item.fact.factType) {
          facts.push({
            id: item.fact.evidenceFactId,
            patientId: row.patient_id,
            documentId: row.id,
            factType: item.fact.factType,
            value: { kind: 'text', text: item.fact.valueText },
            verbatimQuote: item.fact.verbatimQuote,
            pageNumber: item.fact.pageNumber ?? 1,
            state: item.stateAtSnapshot ?? 'verified',
          });
        }
      }
    }
  }

  if (format === 'abdm') {
    return exportToAbdmDocumentBundle(facts, {
      profileType: 'OPConsultRecord',
      patientId: row.patient_id,
      patientName: patient?.display_name || 'Patient',
      abhaNumber: link?.abha_number ?? undefined,
      abhaAddress: link?.abha_address ?? undefined,
      facilityId: org?.hfr_facility_id ?? undefined,
      facilityName: org?.name || 'OncoBrief Medical Centre',
      practitionerId: user?.hpr_id ?? row.approved_by,
      practitionerName: user?.display_name,
    });
  }

  return exportToMCodeBundle(facts, {
    patientId: row.patient_id,
    patientName: patient?.display_name || 'Patient',
    facilityName: org?.name || 'OncoBrief Medical Centre',
    practitionerName: user?.display_name,
  });
}
