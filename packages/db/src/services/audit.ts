import { computeAuditEntryHash, GENESIS_PREV_HASH } from '@oncobrief/domain';
import type { Querier } from '../client';

/**
 * The audit stream (architecture §12).
 *
 * Two append-only streams, deliberately separate: `ledger_entry` answers "what
 * does the record believe, and why?"; `audit_event` answers "who did what in
 * this system?". This module owns the second.
 *
 * `outcome = 'denied'` events are as important as successes: an RBAC or RLS
 * refusal is exactly what a security reviewer needs to see.
 */

export const AUDIT_ACTIONS = [
  'auth.login',
  'auth.login_denied',
  'auth.logout',
  'document.uploaded',
  'document.upload_url_issued',
  'document.finalized',
  'document.duplicate_candidate',
  'document.downloaded',
  'document.page_viewed',
  'document.ingested',
  'document.type_confirmed',
  'ocr.started',
  'ocr.completed',
  'ocr.failed',
  'ingestion.retry',
  'extraction.completed',
  'evidence.verified',
  'evidence.corrected',
  'evidence.rejected',
  'evidence.reinstated',
  'conflict.detected',
  'conflict.resolved',
  'task.created',
  'task.assigned',
  'task.status_changed',
  'checklist.assigned',
  'gap.waived',
  'readiness.computed',
  'packet.created',
  'packet.submitted',
  'packet.approved',
  'packet.exported',
  'message.composed',
  'message.approved',
  'message.delivery_attempted',
  'checklist.template_edited',
  'extension.session_granted',
  'authz.denied',
  'ledger.verification_run',
] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export type AuditOutcome = 'success' | 'denied' | 'error';

export interface AuditActor {
  userId: string | null;
  role: string | null;
  onBehalfOf?: 'extension' | 'worker' | null;
}

export interface AuditRequestMeta {
  requestId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
}

/**
 * PHI must not enter the security log. `metadata_json` records *that* page 3 of
 * document X was viewed, never what it said. Anything that looks like document
 * text, a verbatim quote or a patient name is dropped or hashed.
 */
const REDACT_KEYS = new Set([
  'verbatim_quote',
  'verbatimQuote',
  'quote',
  'body',
  'body_rendered',
  'pageText',
  'plainText',
  'patientName',
  'display_name',
  'displayName',
  'email',
]);

export function redactMetadata(input: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(input)) {
    if (REDACT_KEYS.has(k)) {
      out[k] = '<redacted>';
      continue;
    }
    if (typeof v === 'string' && v.length > 200) {
      out[k] = `<${v.length} chars>`;
      continue;
    }
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      out[k] = redactMetadata(v as Record<string, unknown>);
      continue;
    }
    out[k] = v;
  }
  return out;
}

export interface AppendAuditInput {
  orgId: string;
  actor: AuditActor;
  action: AuditAction;
  entityKind: string;
  entityId?: string | null;
  outcome: AuditOutcome;
  metadata?: Record<string, unknown>;
  request?: AuditRequestMeta;
  /** Traces one upload across S3 → SQS → Textract → Bedrock (Phase 22). */
  correlationId?: string | null;
  occurredAt?: Date;
}

/** Must be called inside a tenant transaction (it reads the org's last hash). */
export async function appendAuditEvent(q: Querier, input: AppendAuditInput): Promise<string> {
  const occurredAt = input.occurredAt ?? new Date();

  const seqRes = await q.query<{ seq: string }>(
    'SELECT oncobrief_next_audit_seq($1) AS seq',
    [input.orgId],
  );
  const seq = Number(seqRes.rows[0]!.seq);

  const prevRes = await q.query<{ entry_hash: Buffer | null }>(
    'SELECT entry_hash FROM audit_event WHERE org_id = $1 ORDER BY seq DESC LIMIT 1',
    [input.orgId],
  );
  const prevHash = prevRes.rows[0]?.entry_hash ?? GENESIS_PREV_HASH;

  // The correlation id is folded into metadata so it is covered by the hash
  // chain; the dedicated column exists for indexed lookups only.
  const metadata = redactMetadata({
    ...(input.metadata ?? {}),
    ...(input.correlationId ? { correlationId: input.correlationId } : {}),
  });

  const entryHash = computeAuditEntryHash(
    {
      orgId: input.orgId,
      seq,
      actorUserId: input.actor.userId,
      actorRole: input.actor.role,
      onBehalfOf: input.actor.onBehalfOf ?? null,
      action: input.action,
      entityKind: input.entityKind,
      entityId: input.entityId ?? null,
      outcome: input.outcome,
      requestId: input.request?.requestId ?? null,
      ipAddress: input.request?.ipAddress ?? null,
      userAgent: input.request?.userAgent ?? null,
      metadataJson: metadata,
      occurredAt,
    },
    prevHash,
  );

  const res = await q.query<{ id: string }>(
    `INSERT INTO audit_event
       (org_id, seq, actor_user_id, actor_role, on_behalf_of, action, entity_kind, entity_id,
        outcome, request_id, ip_address, user_agent, metadata_json, correlation_id, occurred_at, prev_hash, entry_hash)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
     RETURNING id`,
    [
      input.orgId,
      seq,
      input.actor.userId,
      input.actor.role,
      input.actor.onBehalfOf ?? null,
      input.action,
      input.entityKind,
      input.entityId ?? null,
      input.outcome,
      input.request?.requestId ?? null,
      input.request?.ipAddress ?? null,
      input.request?.userAgent ?? null,
      JSON.stringify(metadata),
      input.correlationId ?? null,
      occurredAt,
      prevHash,
      entryHash,
    ],
  );
  return res.rows[0]!.id;
}
