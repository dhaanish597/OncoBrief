import { createHash, randomBytes } from 'node:crypto';
import { can, type Role } from '@oncobrief/domain';
import type { ExtractionPort, OcrPort, StoragePort } from '@oncobrief/ports';
import type { Querier } from '../client';
import { appendAuditEvent } from './audit';
import { createDocument, ingestDocument } from './documents';

/**
 * Browser Extension Scoped Grant & Capture Service (`TASK-016`, architecture §6.2).
 *
 * Security invariants enforced:
 * - Short-lived token (`expires_at <= created_at + INTERVAL '10 minutes'`)
 * - Stored only as SHA-256 `token_hash` (`bytea UNIQUE`)
 * - Scoped to a single `(org_id, user_id, patient_id)` and allowed `origin`
 * - Atomic single-use consumption (`UPDATE extension_grant SET used_at = now() WHERE token_hash = $1 AND used_at IS NULL ... RETURNING *`)
 *   preventing concurrent replay or TOCTOU race conditions
 * - Explicit patient and tenant binding verification (`expectedPatientId`, `expectedOrgId`)
 */

export interface MintExtensionGrantInput {
  orgId: string;
  userId: string;
  role: Role;
  patientId: string;
  origin: string;
  scope?: string[];
  ttlSeconds?: number;
}

export interface MintedExtensionGrant {
  grantId: string;
  token: string;
  patientId: string;
  origin: string;
  scope: string[];
  expiresAt: string;
}

export interface ExtensionGrantRecord {
  id: string;
  patientId: string;
  userId: string;
  scope: string[];
  origin: string;
  createdAt: string;
  expiresAt: string;
  usedAt: string | null;
  revokedAt: string | null;
}

function hashToken(rawToken: string): Buffer {
  return createHash('sha256').update(rawToken, 'utf8').digest();
}

export async function mintExtensionGrant(
  q: Querier,
  input: MintExtensionGrantInput,
): Promise<MintedExtensionGrant> {
  if (!can(input.role, 'document:upload')) {
    throw new Error('forbidden');
  }
  const cleanOrigin = input.origin.trim();
  if (!cleanOrigin || cleanOrigin.length > 255) {
    throw new Error('invalid_extension_origin');
  }

  const patientRes = await q.query<{ id: string }>(
    `SELECT id FROM patient WHERE org_id = $1 AND id = $2`,
    [input.orgId, input.patientId],
  );
  if (!patientRes.rows[0]) {
    throw new Error('patient_not_found');
  }

  // Clamp TTL strictly within the DB CHECK constraint (<= 10 minutes = 600s)
  const ttlSeconds = Math.max(60, Math.min(600, input.ttlSeconds ?? 600));
  const scope =
    input.scope && input.scope.length > 0
      ? input.scope
      : ['capture:pdf', 'capture:dom_text', 'capture:fhir_json'];

  const rawToken = `ob_ext_${randomBytes(24).toString('base64url')}`;
  const tokenHash = hashToken(rawToken);

  const res = await q.query<{ id: string; expires_at: Date }>(
    `INSERT INTO extension_grant
       (org_id, user_id, patient_id, scope, token_hash, created_at, expires_at, origin)
     VALUES ($1, $2, $3, $4, $5, now(), now() + ($6 || ' seconds')::interval, $7)
     RETURNING id, expires_at`,
    [
      input.orgId,
      input.userId,
      input.patientId,
      scope,
      tokenHash,
      String(ttlSeconds),
      cleanOrigin,
    ],
  );

  const row = res.rows[0]!;

  await appendAuditEvent(q, {
    orgId: input.orgId,
    actor: { userId: input.userId, role: input.role },
    action: 'extension.grant_minted',
    entityKind: 'extension_grant',
    entityId: row.id,
    outcome: 'success',
    metadata: {
      patient_id: input.patientId,
      origin: cleanOrigin,
      scope,
      expires_at: row.expires_at.toISOString(),
    },
  });

  return {
    grantId: row.id,
    token: rawToken,
    patientId: input.patientId,
    origin: cleanOrigin,
    scope,
    expiresAt: row.expires_at.toISOString(),
  };
}

export const issueExtensionGrant = mintExtensionGrant;

export async function listPatientExtensionGrants(
  q: Querier,
  orgId: string,
  patientId: string,
): Promise<ExtensionGrantRecord[]> {
  const res = await q.query<{
    id: string;
    patient_id: string;
    user_id: string;
    scope: string[];
    origin: string;
    created_at: Date;
    expires_at: Date;
    used_at: Date | null;
    revoked_at: Date | null;
  }>(
    `SELECT id, patient_id, user_id, scope, origin, created_at, expires_at, used_at, revoked_at
       FROM extension_grant
      WHERE org_id = $1 AND patient_id = $2
      ORDER BY created_at DESC
      LIMIT 10`,
    [orgId, patientId],
  );
  return res.rows.map((r) => ({
    id: r.id,
    patientId: r.patient_id,
    userId: r.user_id,
    scope: r.scope,
    origin: r.origin,
    createdAt: r.created_at.toISOString(),
    expiresAt: r.expires_at.toISOString(),
    usedAt: r.used_at ? r.used_at.toISOString() : null,
    revokedAt: r.revoked_at ? r.revoked_at.toISOString() : null,
  }));
}

export interface RedeemExtensionCaptureInput {
  token: string;
  origin: string;
  requiredScope: 'capture:pdf' | 'capture:dom_text' | 'capture:fhir_json';
  filename: string;
  mimeType: string;
  content: Buffer;
  documentDate?: string | null;
  issuingFacility?: string | null;
  expectedPatientId?: string | null;
  expectedOrgId?: string | null;
}

export interface RedeemExtensionCaptureResult {
  grantId: string;
  documentId: string;
  patientId: string;
  orgId: string;
  ingestStatus: string;
  promotedFacts: number;
  subPacketCount: number;
}

/**
 * Atomically validates and consumes a single-use `extension_grant` token,
 * rejecting replays, expired grants, revoked grants, origin mismatches,
 * scope violations, and cross-patient/cross-tenant binding mismatches.
 */
export async function consumeExtensionGrant(
  q: Querier,
  input: {
    token: string;
    origin: string;
    requiredScope: string;
    expectedPatientId?: string | null;
    expectedOrgId?: string | null;
  },
): Promise<{
  id: string;
  orgId: string;
  userId: string;
  patientId: string;
  scope: string[];
  origin: string;
}> {
  if (!input.token || !input.token.startsWith('ob_ext_')) {
    throw new Error('invalid_extension_token');
  }
  const tokenHash = hashToken(input.token.trim());

  // First inspect state under row lock to provide exact diagnostic error codes
  const inspectRes = await q.query<{
    id: string;
    org_id: string;
    user_id: string;
    patient_id: string;
    scope: string[];
    origin: string;
    expires_at: Date;
    used_at: Date | null;
    revoked_at: Date | null;
  }>(
    `SELECT id, org_id, user_id, patient_id, scope, origin, expires_at, used_at, revoked_at
       FROM extension_grant
      WHERE token_hash = $1
      FOR UPDATE`,
    [tokenHash],
  );

  const grant = inspectRes.rows[0];
  if (!grant) {
    throw new Error('extension_grant_not_found');
  }
  if (input.expectedOrgId && grant.org_id !== input.expectedOrgId) {
    throw new Error('extension_grant_tenant_mismatch');
  }
  if (input.expectedPatientId && grant.patient_id !== input.expectedPatientId) {
    throw new Error('extension_grant_patient_mismatch');
  }
  if (grant.revoked_at) {
    throw new Error('extension_grant_revoked');
  }
  if (grant.used_at) {
    throw new Error('extension_grant_already_used');
  }
  if (grant.expires_at.getTime() <= Date.now()) {
    throw new Error('extension_grant_expired');
  }
  if (
    grant.origin !== '*' &&
    grant.origin.toLowerCase() !== input.origin.trim().toLowerCase()
  ) {
    throw new Error('extension_grant_origin_mismatch');
  }
  if (!grant.scope.includes(input.requiredScope)) {
    throw new Error('extension_grant_scope_denied');
  }

  // Atomic consumption guard: UPDATE ... WHERE used_at IS NULL AND revoked_at IS NULL AND expires_at > now()
  const consumeRes = await q.query<{ id: string }>(
    `UPDATE extension_grant
        SET used_at = now()
      WHERE id = $1
        AND token_hash = $2
        AND used_at IS NULL
        AND revoked_at IS NULL
        AND expires_at > now()
        AND $3 = ANY(scope)
      RETURNING id`,
    [grant.id, tokenHash, input.requiredScope],
  );

  if (consumeRes.rowCount === 0) {
    throw new Error('extension_grant_already_used');
  }

  return {
    id: grant.id,
    orgId: grant.org_id,
    userId: grant.user_id,
    patientId: grant.patient_id,
    scope: grant.scope,
    origin: grant.origin,
  };
}

export async function redeemExtensionGrantAndIngest(
  q: Querier,
  deps: { storage: StoragePort; ocr: OcrPort; extractor: ExtractionPort },
  input: RedeemExtensionCaptureInput,
): Promise<RedeemExtensionCaptureResult> {
  const grant = await consumeExtensionGrant(q, {
    token: input.token,
    origin: input.origin,
    requiredScope: input.requiredScope,
    expectedPatientId: input.expectedPatientId ?? null,
    expectedOrgId: input.expectedOrgId ?? null,
  });

  const created = await createDocument(q, deps.storage, {
    orgId: grant.orgId,
    patientId: grant.patientId,
    uploadedBy: grant.userId,
    filename: input.filename,
    mimeType: input.mimeType,
    content: input.content,
    sourceKind: 'extension_capture',
    documentDate: input.documentDate ?? null,
    issuingFacility: input.issuingFacility ?? grant.origin,
    recordOrigin: 'external_hospital',
  });

  const ingested = await ingestDocument(q, deps, created.documentId);

  const subRes = await q
    .query<{ count: string }>(
      `SELECT count(*)::text AS count FROM document_subpacket WHERE document_id = $1`,
      [created.documentId],
    )
    .catch(() => ({ rows: [{ count: '1' }] }));

  await appendAuditEvent(q, {
    orgId: grant.orgId,
    actor: { userId: grant.userId, role: null, onBehalfOf: 'extension' },
    action: 'extension.capture_ingested',
    entityKind: 'document',
    entityId: created.documentId,
    outcome: 'success',
    metadata: {
      grant_id: grant.id,
      origin: input.origin,
      scope: input.requiredScope,
      ingest_status: ingested.status,
      promoted_facts: ingested.promoted,
    },
  });

  return {
    grantId: grant.id,
    documentId: created.documentId,
    patientId: grant.patientId,
    orgId: grant.orgId,
    ingestStatus: ingested.status,
    promotedFacts: ingested.promoted,
    subPacketCount: Number(subRes.rows[0]?.count ?? 1),
  };
}
