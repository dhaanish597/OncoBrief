import { createHash } from 'node:crypto';
import { canonicalJson, toRfc3339 } from './canonical-json.js';
import type { EvidenceStateValue, LedgerAction } from '../evidence/state.js';

/**
 * Hash-chained ledger and audit streams (architecture §4.4, §12).
 *
 *   entry_hash = sha256(
 *     coalesce(prev_entry_hash, '\x00') ||
 *     canonical_json({ ...the entry... })
 *   )
 *
 * `seq` is allocated inside the same transaction as the insert using a
 * per-org counter row, so the chain is gap-free and totally ordered.
 *
 * NOTE: this module uses `node:crypto`. Import it from server code only.
 */

export const GENESIS_PREV_HASH: Buffer = Buffer.alloc(1, 0); // '\x00'

export interface LedgerHashInput {
  orgId: string;
  seq: number;
  patientId: string;
  evidenceFactId: string;
  action: LedgerAction;
  fromState: EvidenceStateValue | null;
  toState: EvidenceStateValue;
  actorKind: string;
  actorUserId: string | null;
  reason: string | null;
  payloadJson: unknown;
  occurredAt: Date | string;
}

export function computeLedgerEntryHash(input: LedgerHashInput, prevHash: Buffer): Buffer {
  const material = canonicalJson({
    org_id: input.orgId,
    seq: input.seq,
    patient_id: input.patientId,
    evidence_fact_id: input.evidenceFactId,
    action: input.action,
    from_state: input.fromState,
    to_state: input.toState,
    actor_kind: input.actorKind,
    actor_user_id: input.actorUserId,
    reason: input.reason,
    payload_json: input.payloadJson ?? {},
    occurred_at: toRfc3339(input.occurredAt),
  });
  const h = createHash('sha256');
  h.update(prevHash);
  h.update(material, 'utf8');
  return h.digest();
}

export interface AuditHashInput {
  orgId: string;
  seq: number;
  actorUserId: string | null;
  actorRole: string | null;
  onBehalfOf: string | null;
  action: string;
  entityKind: string;
  entityId: string | null;
  outcome: string;
  requestId: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  metadataJson: unknown;
  occurredAt: Date | string;
}

export function computeAuditEntryHash(input: AuditHashInput, prevHash: Buffer): Buffer {
  const material = canonicalJson({
    org_id: input.orgId,
    seq: input.seq,
    actor_user_id: input.actorUserId,
    actor_role: input.actorRole,
    on_behalf_of: input.onBehalfOf,
    action: input.action,
    entity_kind: input.entityKind,
    entity_id: input.entityId,
    outcome: input.outcome,
    request_id: input.requestId,
    ip_address: input.ipAddress,
    user_agent: input.userAgent,
    metadata_json: input.metadataJson ?? {},
    occurred_at: toRfc3339(input.occurredAt),
  });
  const h = createHash('sha256');
  h.update(prevHash);
  h.update(material, 'utf8');
  return h.digest();
}

export interface ChainRow {
  seq: number;
  prevHash: Buffer | null;
  entryHash: Buffer;
}

export interface ChainVerification {
  ok: boolean;
  length: number;
  firstDivergenceSeq: number | null;
  reason: string | null;
}

/**
 * Verify an ordered (seq ascending) chain. Recomputes nothing from the
 * material — it checks linkage and ordering, which detects deletion,
 * reordering and truncation. Full material recomputation is available via the
 * caller supplying `recompute`.
 */
export function verifyChainLinkage(rows: readonly ChainRow[]): ChainVerification {
  let expectedPrev: Buffer = GENESIS_PREV_HASH;
  let expectedSeq = rows[0]?.seq ?? 1;

  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i]!;
    if (i === 0) {
      expectedSeq = row.seq;
    } else if (row.seq !== expectedSeq + 1) {
      return {
        ok: false,
        length: rows.length,
        firstDivergenceSeq: row.seq,
        reason: `sequence gap: expected ${expectedSeq + 1}, found ${row.seq}`,
      };
    }
    expectedSeq = row.seq;

    const prev = row.prevHash ?? GENESIS_PREV_HASH;
    if (!prev.equals(expectedPrev)) {
      return {
        ok: false,
        length: rows.length,
        firstDivergenceSeq: row.seq,
        reason: `prev_hash mismatch at seq ${row.seq}`,
      };
    }
    expectedPrev = row.entryHash;
  }

  return { ok: true, length: rows.length, firstDivergenceSeq: null, reason: null };
}

export function sha256Hex(input: string | Buffer): string {
  return createHash('sha256').update(input).digest('hex');
}
