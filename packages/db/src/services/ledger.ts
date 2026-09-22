import {
  confidenceBandFor,
  detectConflicts,
  makeSlotKey,
  normalizeForComparison,
  transition,
  validateSpans,
  verifyChainLinkage,
  type EvidenceStateValue,
  type ExtractorKind,
  type FactType,
  type FactValue,
  type LedgerAction,
  type ResolutionKind,
  type Role,
} from '@oncobrief/domain';
import type { Querier } from '../client';
import { appendAuditEvent, type AuditActor } from './audit';
import { computeLedgerEntryHash, GENESIS_PREV_HASH } from '@oncobrief/domain';

/**
 * The Evidence Ledger service (architecture §4, §7).
 *
 * The ledger separates three things most systems conflate: the claim
 * (immutable), the event (append-only), and the current state (derived).
 * There is no other way for evidence state to change.
 */

export interface EvidenceActor {
  kind: 'human' | 'system';
  userId: string | null;
  role: Role | null;
}

export const SYSTEM_ACTOR: EvidenceActor = { kind: 'system', userId: null, role: null };

function toAuditActor(actor: EvidenceActor): AuditActor {
  return { userId: actor.userId, role: actor.role };
}

export function normalizeValue(value: FactValue): string {
  switch (value.kind) {
    case 'date':
      return value.date;
    case 'text':
      return normalizeForComparison(value.text).toLowerCase();
    case 'facility':
      return normalizeForComparison(value.name).toLowerCase();
    case 'identifier':
      return `${value.system}:${value.value.toLowerCase()}`;
    case 'medication':
      return normalizeForComparison(value.name).toLowerCase();
    case 'procedure':
      return (value.code ?? normalizeForComparison(value.name)).toLowerCase();
    case 'appointment':
      return value.date;
    case 'lab':
      return `${normalizeForComparison(value.name).toLowerCase()}=${value.valueText}${
        value.unitText ? ` ${normalizeForComparison(value.unitText).toLowerCase()}` : ''
      }`;
    case 'cycle':
      return normalizeForComparison(value.label).toLowerCase();
  }
}

// ---------------------------------------------------------------------------
// Core append
// ---------------------------------------------------------------------------

export interface AppendLedgerInput {
  orgId: string;
  patientId: string;
  evidenceFactId: string;
  action: LedgerAction;
  fromState: EvidenceStateValue | null;
  toState: EvidenceStateValue;
  actor: EvidenceActor;
  reason?: string | null;
  conflictSetId?: string | null;
  resolutionKind?: ResolutionKind;
  payload?: Record<string, unknown>;
  occurredAt?: Date;
}

/**
 * Append one ledger entry and advance the derived state in the same
 * transaction. The caller must have already obtained the guard's approval
 * through `transitionEvidence`; this function re-checks it defensively.
 */
async function appendLedgerEntry(q: Querier, input: AppendLedgerInput): Promise<{ id: string; seq: number }> {
  const guard = transition({
    from: input.fromState,
    action: input.action,
    actorKind: input.actor.kind,
    ...(input.actor.role ? { actorRole: input.actor.role } : {}),
    ...(input.reason ? { reason: input.reason } : {}),
    ...(input.resolutionKind ? { resolutionKind: input.resolutionKind } : {}),
  });
  if (!guard.ok) {
    throw new LedgerGuardError(guard.code, guard.message);
  }
  if (guard.to !== input.toState) {
    throw new LedgerGuardError('no_such_transition', `guard says ${guard.to}, caller said ${input.toState}`);
  }

  const occurredAt = input.occurredAt ?? new Date();
  const seqRes = await q.query<{ seq: string }>('SELECT oncobrief_next_ledger_seq($1) AS seq', [
    input.orgId,
  ]);
  const seq = Number(seqRes.rows[0]!.seq);

  const prevRes = await q.query<{ entry_hash: Buffer | null }>(
    'SELECT entry_hash FROM ledger_entry WHERE org_id = $1 ORDER BY seq DESC LIMIT 1',
    [input.orgId],
  );
  const prevHash = prevRes.rows[0]?.entry_hash ?? GENESIS_PREV_HASH;

  const payload = input.payload ?? {};
  const entryHash = computeLedgerEntryHash(
    {
      orgId: input.orgId,
      seq,
      patientId: input.patientId,
      evidenceFactId: input.evidenceFactId,
      action: input.action,
      fromState: input.fromState,
      toState: input.toState,
      actorKind: input.actor.kind,
      actorUserId: input.actor.userId,
      reason: input.reason ?? null,
      payloadJson: payload,
      occurredAt,
    },
    prevHash,
  );

  const ins = await q.query<{ id: string }>(
    `INSERT INTO ledger_entry
       (org_id, seq, patient_id, evidence_fact_id, conflict_set_id, action, from_state, to_state,
        actor_kind, actor_user_id, actor_role, reason, payload_json, occurred_at, prev_entry_hash, entry_hash)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
     RETURNING id`,
    [
      input.orgId, seq, input.patientId, input.evidenceFactId, input.conflictSetId ?? null,
      input.action, input.fromState, input.toState, input.actor.kind, input.actor.userId,
      input.actor.role, input.reason ?? null, JSON.stringify(payload), occurredAt, prevHash, entryHash,
    ],
  );
  const id = ins.rows[0]!.id;

  await q.query(
    `INSERT INTO evidence_state (evidence_fact_id, org_id, patient_id, state, last_entry_id, last_actor_id, last_changed_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7)
     ON CONFLICT (evidence_fact_id) DO UPDATE SET
       state = EXCLUDED.state,
       last_entry_id = EXCLUDED.last_entry_id,
       last_actor_id = EXCLUDED.last_actor_id,
       last_changed_at = EXCLUDED.last_changed_at`,
    [input.evidenceFactId, input.orgId, input.patientId, input.toState, id, input.actor.userId, occurredAt],
  );

  await q.query(
    `UPDATE timeline_event SET state = $1, updated_at = $2 WHERE evidence_fact_id = $3`,
    [input.toState, occurredAt, input.evidenceFactId],
  );

  return { id, seq };
}

export class LedgerGuardError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'LedgerGuardError';
  }
}

// ---------------------------------------------------------------------------
// Insert a fact (span-validated) then append its first ledger entry
// ---------------------------------------------------------------------------

export interface InsertFactInput {
  orgId: string;
  patientId: string;
  factType: FactType;
  value: FactValue;
  verbatimQuote: string;
  spanIds: string[];
  documentId: string;
  extractorKind: ExtractorKind;
  extractorName: string;
  extractorVersion: string;
  confidenceRaw: number | null;
  observedOn?: string | null;
  createdBy: string | null;
  correctsFactId?: string | null;
  occurredAt?: Date;
}

export type InsertFactResult =
  | { ok: true; factId: string; ledgerEntryId: string }
  | { ok: false; reason: 'span_mismatch' | 'no_spans' | 'cross_page' | 'cross_document' | 'empty_quote'; detail: unknown };

/**
 * The agent that may write to the ledger. Applies §5.2 span validation, checks
 * the fact type against the closed vocabulary (by typing), computes slot_key
 * and the confidence band, and only then opens the transaction that inserts
 * fact + span links + a `fact_extracted` entry.
 */
export async function insertFact(q: Querier, input: InsertFactInput): Promise<InsertFactResult> {
  const spansRes = await q.query<{
    id: string;
    document_id: string;
    page_id: string;
    text: string;
  }>('SELECT id, document_id, page_id, text FROM text_span WHERE id = ANY($1::uuid[])', [
    input.spanIds,
  ]);
  const spans = spansRes.rows.map((r) => ({
    id: r.id,
    documentId: r.document_id,
    pageId: r.page_id,
    text: r.text,
  }));

  if (spans.length !== input.spanIds.length) {
    return { ok: false, reason: 'no_spans', detail: 'some span ids not found' };
  }

  const validation = validateSpans(input.verbatimQuote, spans);
  if (!validation.ok) {
    return { ok: false, reason: validation.error.code as 'span_mismatch', detail: validation.error };
  }

  const slotKey = makeSlotKey(input.factType, input.value);
  const band = confidenceBandFor(input.confidenceRaw);

  const factRes = await q.query<{ id: string }>(
    `INSERT INTO evidence_fact
       (org_id, patient_id, fact_type, slot_key, value_json, value_normalized, observed_on,
        verbatim_quote, document_id, extractor_kind, extractor_name, extractor_version,
        confidence_band, confidence_raw, corrects_fact_id, created_by, created_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
     RETURNING id`,
    [
      input.orgId, input.patientId, input.factType, slotKey, JSON.stringify(input.value),
      normalizeValue(input.value), input.observedOn ?? null, input.verbatimQuote, input.documentId,
      input.extractorKind, input.extractorName, input.extractorVersion, band, input.confidenceRaw,
      input.correctsFactId ?? null, input.createdBy, input.occurredAt ?? new Date(),
    ],
  );
  const factId = factRes.rows[0]!.id;

  let ordinal = 0;
  for (const span of spans) {
    await q.query(
      `INSERT INTO evidence_span_link (evidence_fact_id, text_span_id, org_id, ordinal)
       VALUES ($1,$2,$3,$4)`,
      [factId, span.id, input.orgId, ordinal],
    );
    ordinal += 1;
  }

  const entry = await appendLedgerEntry(q, {
    orgId: input.orgId,
    patientId: input.patientId,
    evidenceFactId: factId,
    action: 'fact_extracted',
    fromState: null,
    toState: 'extracted',
    actor: SYSTEM_ACTOR,
    reason: null,
    payload: { extractor: input.extractorName, version: input.extractorVersion },
    ...(input.occurredAt ? { occurredAt: input.occurredAt } : {}),
  });

  await refreshTimelineRow(q, input.orgId, factId);

  return { ok: true, factId, ledgerEntryId: entry.id };
}

export async function refreshTimelineRow(q: Querier, orgId: string, factId: string): Promise<void> {
  await q.query(
    `INSERT INTO timeline_event
       (org_id, patient_id, evidence_fact_id, fact_type, value_text, observed_on, document_id, display_date, state)
     SELECT ef.org_id, ef.patient_id, ef.id, ef.fact_type, ef.value_normalized, ef.observed_on,
            ef.document_id,
            coalesce(ef.observed_on, d.document_date, ef.created_at::date),
            coalesce(es.state, 'extracted')
     FROM evidence_fact ef
     JOIN document d ON d.id = ef.document_id
     LEFT JOIN evidence_state es ON es.evidence_fact_id = ef.id
     WHERE ef.id = $1 AND ef.org_id = $2
     ON CONFLICT (evidence_fact_id) DO UPDATE SET
       value_text = EXCLUDED.value_text,
       state = EXCLUDED.state,
       display_date = EXCLUDED.display_date,
       updated_at = now()`,
    [factId, orgId],
  );
}

// ---------------------------------------------------------------------------
// State transitions
// ---------------------------------------------------------------------------

export async function getFactState(q: Querier, factId: string): Promise<EvidenceStateValue | null> {
  const res = await q.query<{ state: EvidenceStateValue }>(
    'SELECT state FROM evidence_state WHERE evidence_fact_id = $1',
    [factId],
  );
  return res.rows[0]?.state ?? null;
}

async function getFact(q: Querier, factId: string): Promise<{ id: string; org_id: string; patient_id: string } | null> {
  const res = await q.query<{ id: string; org_id: string; patient_id: string }>(
    'SELECT id, org_id, patient_id FROM evidence_fact WHERE id = $1',
    [factId],
  );
  return res.rows[0] ?? null;
}

async function requireFact(q: Querier, factId: string) {
  const fact = await getFact(q, factId);
  if (!fact) throw new LedgerGuardError('no_such_transition', `evidence fact ${factId} not found`);
  return fact;
}

export interface HumanActionInput {
  factId: string;
  actor: EvidenceActor;
  reason?: string;
}

export async function verifyEvidence(q: Querier, input: HumanActionInput): Promise<void> {
  const fact = await requireFact(q, input.factId);
  const from = await getFactState(q, input.factId);
  await appendLedgerEntry(q, {
    orgId: fact.org_id,
    patientId: fact.patient_id,
    evidenceFactId: input.factId,
    action: 'fact_verified',
    fromState: from,
    toState: 'verified',
    actor: input.actor,
    reason: input.reason ?? null,
  });
  await appendAuditEvent(q, {
    orgId: fact.org_id,
    actor: toAuditActor(input.actor),
    action: 'evidence.verified',
    entityKind: 'evidence_fact',
    entityId: input.factId,
    outcome: 'success',
  });
}

export async function rejectEvidence(q: Querier, input: HumanActionInput & { reason: string }): Promise<void> {
  const fact = await requireFact(q, input.factId);
  const from = await getFactState(q, input.factId);
  await appendLedgerEntry(q, {
    orgId: fact.org_id,
    patientId: fact.patient_id,
    evidenceFactId: input.factId,
    action: 'fact_rejected',
    fromState: from,
    toState: 'rejected',
    actor: input.actor,
    reason: input.reason,
  });
  await appendAuditEvent(q, {
    orgId: fact.org_id,
    actor: toAuditActor(input.actor),
    action: 'evidence.rejected',
    entityKind: 'evidence_fact',
    entityId: input.factId,
    outcome: 'success',
    metadata: { reason: input.reason },
  });
}

export async function reinstateEvidence(q: Querier, input: HumanActionInput & { reason: string }): Promise<void> {
  const fact = await requireFact(q, input.factId);
  const from = await getFactState(q, input.factId);
  await appendLedgerEntry(q, {
    orgId: fact.org_id,
    patientId: fact.patient_id,
    evidenceFactId: input.factId,
    action: 'fact_reinstated',
    fromState: from,
    toState: 'extracted',
    actor: input.actor,
    reason: input.reason,
  });
  await appendAuditEvent(q, {
    orgId: fact.org_id,
    actor: toAuditActor(input.actor),
    action: 'evidence.reinstated',
    entityKind: 'evidence_fact',
    entityId: input.factId,
    outcome: 'success',
    metadata: { reason: input.reason },
  });
}

export interface CorrectEvidenceInput extends HumanActionInput {
  /** The new value. The original fact is never touched. */
  value: FactValue;
  verbatimQuote: string;
}

/**
 * A correction is one transaction, two ledger entries, two facts (§7.1):
 *  1. Insert fact B with `corrects_fact_id = A.id`, the same span links as A,
 *     and a quote that still validates against them.
 *  2. Append `fact_corrected` for A -> corrected.
 *  3. Append `fact_verified` for B -> verified.
 * Fact A still exists with its original value_json.
 */
export async function correctEvidence(
  q: Querier,
  input: CorrectEvidenceInput & { reason: string },
): Promise<{ replacementFactId: string }> {
  const fact = await requireFact(q, input.factId);

  const original = await q.query<{
    document_id: string;
    fact_type: FactType;
    observed_on: string | null;
    extractor_name: string;
    extractor_version: string;
  }>(
    `SELECT document_id, fact_type, observed_on, extractor_name, extractor_version
       FROM evidence_fact WHERE id = $1`,
    [input.factId],
  );
  const o = original.rows[0]!;

  const spansRes = await q.query<{ text_span_id: string }>(
    'SELECT text_span_id FROM evidence_span_link WHERE evidence_fact_id = $1 ORDER BY ordinal',
    [input.factId],
  );
  const spanIds = spansRes.rows.map((r) => r.text_span_id);

  const inserted = await insertFact(q, {
    orgId: fact.org_id,
    patientId: fact.patient_id,
    factType: o.fact_type,
    value: input.value,
    verbatimQuote: input.verbatimQuote,
    spanIds,
    documentId: o.document_id,
    extractorKind: 'human',
    extractorName: 'human.correction',
    extractorVersion: 'v1',
    confidenceRaw: null,
    observedOn: o.observed_on,
    createdBy: input.actor.userId,
    correctsFactId: input.factId,
  });
  if (!inserted.ok) {
    throw new LedgerGuardError('span_validation_failed', `replacement quote invalid: ${inserted.reason}`);
  }

  const from = await getFactState(q, input.factId);
  await appendLedgerEntry(q, {
    orgId: fact.org_id,
    patientId: fact.patient_id,
    evidenceFactId: input.factId,
    action: 'fact_corrected',
    fromState: from,
    toState: 'corrected',
    actor: input.actor,
    reason: input.reason,
    payload: { replacement_fact_id: inserted.factId },
  });

  // The replacement was inserted as `extracted`; a human authored it
  // deliberately, so it advances to `verified` in the same transaction.
  await appendLedgerEntry(q, {
    orgId: fact.org_id,
    patientId: fact.patient_id,
    evidenceFactId: inserted.factId,
    action: 'fact_verified',
    fromState: 'extracted',
    toState: 'verified',
    actor: input.actor,
    reason: null,
    payload: { origin: `correction_of:${input.factId}` },
  });

  await appendAuditEvent(q, {
    orgId: fact.org_id,
    actor: toAuditActor(input.actor),
    action: 'evidence.corrected',
    entityKind: 'evidence_fact',
    entityId: input.factId,
    outcome: 'success',
    metadata: { replacement_fact_id: inserted.factId, reason: input.reason },
  });

  return { replacementFactId: inserted.factId };
}

// ---------------------------------------------------------------------------
// Conflict detection and resolution
// ---------------------------------------------------------------------------

export interface DetectedConflictRow {
  id: string;
  fact_type: string;
  slot_key: string;
  member_fingerprint: string;
  detection_reason: string;
  status: string;
  detected_at: Date;
  member_ids: string[];
}

/** Idempotent: re-running never creates a second conflict set (§8.2). */
export async function detectAndRecordConflicts(
  q: Querier,
  orgId: string,
  patientId: string,
): Promise<{ created: number; flagged: number }> {
  const factsRes = await q.query<{ id: string; fact_type: string; slot_key: string; value_json: FactValue; observed_on: string | null; state: EvidenceStateValue }>(
    `SELECT ef.id, ef.fact_type, ef.slot_key, ef.value_json, ef.observed_on::text AS observed_on, coalesce(es.state,'extracted') AS state
       FROM evidence_fact ef
       LEFT JOIN evidence_state es ON es.evidence_fact_id = ef.id
      WHERE ef.org_id = $1 AND ef.patient_id = $2`,
    [orgId, patientId],
  );
  const facts = factsRes.rows.map((r) => ({
    id: r.id,
    factType: r.fact_type as FactType,
    slotKey: r.slot_key,
    value: r.value_json,
    observedOn: r.observed_on,
  }));
  const stateById = new Map(factsRes.rows.map((r) => [r.id, r.state]));

  const detected = detectConflicts(facts);

  let created = 0;
  let flagged = 0;

  for (const c of detected) {
    const existing = await q.query<{ id: string }>(
      'SELECT id FROM conflict_set WHERE org_id = $1 AND member_fingerprint = $2',
      [orgId, c.memberFingerprint],
    );

    let conflictSetId: string;
    if (existing.rows[0]) {
      conflictSetId = existing.rows[0].id;
    } else {
      const ins = await q.query<{ id: string }>(
        `INSERT INTO conflict_set
           (org_id, patient_id, fact_type, slot_key, member_fingerprint, detector_name, detector_version, detection_reason)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
         ON CONFLICT (org_id, member_fingerprint) DO NOTHING
         RETURNING id`,
        [orgId, patientId, c.factType, c.slotKey, c.memberFingerprint, c.detectorName, c.detectorVersion, c.reason],
      );
      if (ins.rows[0]) {
        conflictSetId = ins.rows[0].id;
        created += 1;
        await appendAuditEvent(q, {
          orgId,
          actor: { userId: null, role: null, onBehalfOf: 'worker' },
          action: 'conflict.detected',
          entityKind: 'conflict_set',
          entityId: conflictSetId,
          outcome: 'success',
          metadata: { fact_type: c.factType, members: c.memberIds.length, reason: c.reason },
        });
      } else {
        const again = await q.query<{ id: string }>(
          'SELECT id FROM conflict_set WHERE org_id = $1 AND member_fingerprint = $2',
          [orgId, c.memberFingerprint],
        );
        conflictSetId = again.rows[0]!.id;
      }
    }

    for (const memberId of c.memberIds) {
      await q.query(
        `INSERT INTO conflict_member (conflict_set_id, evidence_fact_id, org_id)
         VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`,
        [conflictSetId, memberId, orgId],
      );

      const state = stateById.get(memberId) ?? 'extracted';
      if (state === 'extracted' || state === 'verified') {
        await appendLedgerEntry(q, {
          orgId,
          patientId,
          evidenceFactId: memberId,
          action: 'fact_flagged_conflicting',
          fromState: state,
          toState: 'conflicting',
          actor: SYSTEM_ACTOR,
          reason: null,
          conflictSetId,
          payload: { conflict_set_id: conflictSetId, detector: c.detectorName },
        });
        flagged += 1;
      }
    }
  }

  return { created, flagged };
}

export interface ResolveConflictInput {
  conflictSetId: string;
  resolutionKind: ResolutionKind;
  reason: string;
  actor: EvidenceActor;
  /** `mark_superseded`: the fact that wins. */
  winnerFactId?: string;
  /** `corrected`: the replacement value and its quote. */
  replacement?: { value: FactValue; verbatimQuote: string };
}

export async function resolveConflict(q: Querier, input: ResolveConflictInput): Promise<void> {
  const cs = await q.query<{ id: string; org_id: string; patient_id: string; status: string }>(
    'SELECT id, org_id, patient_id, status FROM conflict_set WHERE id = $1',
    [input.conflictSetId],
  );
  const set = cs.rows[0];
  if (!set) throw new LedgerGuardError('no_such_transition', 'conflict set not found');
  if (set.status === 'resolved') throw new LedgerGuardError('no_such_transition', 'already resolved');

  const membersRes = await q.query<{ evidence_fact_id: string }>(
    'SELECT evidence_fact_id FROM conflict_member WHERE conflict_set_id = $1',
    [input.conflictSetId],
  );
  const members = membersRes.rows.map((r) => r.evidence_fact_id);

  const { org_id: orgId, patient_id: patientId } = set;

  if (input.resolutionKind === 'retain_both') {
    for (const factId of members) {
      const from = await getFactState(q, factId);
      await appendLedgerEntry(q, {
        orgId, patientId, evidenceFactId: factId, action: 'conflict_resolved',
        fromState: from, toState: 'verified', actor: input.actor, reason: input.reason,
        conflictSetId: input.conflictSetId, resolutionKind: 'retain_both',
        payload: { outcome: 'retain_both' },
      });
    }
    await q.query(
      `UPDATE conflict_member SET member_role = 'retained' WHERE conflict_set_id = $1`,
      [input.conflictSetId],
    );
  } else if (input.resolutionKind === 'mark_superseded') {
    if (!input.winnerFactId) throw new LedgerGuardError('reason_required', 'mark_superseded needs a winner');
    for (const factId of members) {
      const from = await getFactState(q, factId);
      if (factId === input.winnerFactId) {
        await appendLedgerEntry(q, {
          orgId, patientId, evidenceFactId: factId, action: 'conflict_resolved',
          fromState: from, toState: 'verified', actor: input.actor, reason: input.reason,
          conflictSetId: input.conflictSetId, resolutionKind: 'mark_superseded',
          payload: { outcome: 'mark_superseded', winner: true },
        });
      } else {
        await appendLedgerEntry(q, {
          orgId, patientId, evidenceFactId: factId, action: 'fact_superseded',
          fromState: from, toState: 'superseded', actor: input.actor, reason: input.reason,
          conflictSetId: input.conflictSetId, payload: { outcome: 'mark_superseded', winner: false },
        });
      }
    }
    await q.query(
      `UPDATE conflict_member SET member_role = CASE WHEN evidence_fact_id = $2 THEN 'retained' ELSE 'superseded' END
         WHERE conflict_set_id = $1`,
      [input.conflictSetId, input.winnerFactId],
    );
  } else {
    // corrected: every member is superseded, and one human-authored replacement
    // takes their place.
    for (const factId of members) {
      const from = await getFactState(q, factId);
      await appendLedgerEntry(q, {
        orgId, patientId, evidenceFactId: factId, action: 'fact_superseded',
        fromState: from, toState: 'superseded', actor: input.actor, reason: input.reason,
        conflictSetId: input.conflictSetId, payload: { outcome: 'corrected', role: 'superseded' },
      });
    }
    await q.query(
      `UPDATE conflict_member SET member_role = 'superseded' WHERE conflict_set_id = $1`,
      [input.conflictSetId],
    );
    if (input.replacement && members[0]) {
      const baseFact = await q.query<{ document_id: string; fact_type: FactType; observed_on: string | null }>(
        'SELECT document_id, fact_type, observed_on FROM evidence_fact WHERE id = $1',
        [members[0]],
      );
      const spans = await q.query<{ text_span_id: string }>(
        'SELECT text_span_id FROM evidence_span_link WHERE evidence_fact_id = $1 ORDER BY ordinal',
        [members[0]],
      );
      const bf = baseFact.rows[0]!;
      const inserted = await insertFact(q, {
        orgId, patientId, factType: bf.fact_type, value: input.replacement.value,
        verbatimQuote: input.replacement.verbatimQuote,
        spanIds: spans.rows.map((r) => r.text_span_id),
        documentId: bf.document_id, extractorKind: 'human', extractorName: 'human.conflict_resolution',
        extractorVersion: 'v1', confidenceRaw: null, observedOn: bf.observed_on,
        createdBy: input.actor.userId, correctsFactId: members[0],
      });
      if (!inserted.ok) throw new LedgerGuardError('span_validation_failed', inserted.reason);
      await appendLedgerEntry(q, {
        orgId, patientId, evidenceFactId: inserted.factId, action: 'fact_verified',
        fromState: 'extracted', toState: 'verified', actor: input.actor, reason: null,
        payload: { origin: 'conflict_resolution', conflict_set_id: input.conflictSetId },
      });
    }
  }

  await q.query(
    `UPDATE conflict_set
        SET status = 'resolved', resolution_kind = $2, resolution_reason = $3,
            resolved_by = $4, resolved_at = now()
      WHERE id = $1`,
    [input.conflictSetId, input.resolutionKind, input.reason, input.actor.userId],
  );

  await appendAuditEvent(q, {
    orgId,
    actor: toAuditActor(input.actor),
    action: 'conflict.resolved',
    entityKind: 'conflict_set',
    entityId: input.conflictSetId,
    outcome: 'success',
    metadata: { resolution_kind: input.resolutionKind, reason: input.reason },
  });
}

// ---------------------------------------------------------------------------
// Hash-chain verification
// ---------------------------------------------------------------------------

export async function verifyLedgerChain(
  q: Querier,
  orgId: string,
): Promise<{ ok: boolean; length: number; firstDivergenceSeq: number | null; reason: string | null }> {
  const res = await q.query<{ seq: string; prev_entry_hash: Buffer | null; entry_hash: Buffer }>(
    'SELECT seq, prev_entry_hash, entry_hash FROM ledger_entry WHERE org_id = $1 ORDER BY seq',
    [orgId],
  );
  const rows = res.rows.map((r) => ({
    seq: Number(r.seq),
    prevHash: r.prev_entry_hash,
    entryHash: r.entry_hash,
  }));
  return verifyChainLinkage(rows);
}
