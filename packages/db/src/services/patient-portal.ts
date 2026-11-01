import { createHash, randomBytes } from 'node:crypto';
import type { Querier } from '../client';
import { getAppPool } from '../client';

export interface ValidatedPatientPortalSession {
  sessionId: string;
  orgId: string;
  patientId: string;
  actorRole: 'patient' | 'caregiver';
  caregiverContactId: string | null;
  grantedScopes: string[];
  expiresAt: Date;
  tokenHash: string;
}

export function hashTokenSha256(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function newPatientPortalToken(): { token: string; tokenHash: string } {
  const token = randomBytes(32).toString('base64url');
  return { token, tokenHash: hashTokenSha256(token) };
}

/**
 * Executes a callback within a strictly scoped patient portal transaction.
 * Context parameters are set transaction-locally (is_local = true),
 * ensuring zero leakage across pooled connections.
 */
export async function withPatientPortalContext<T>(
  session: { orgId: string; patientId: string; actorRole: 'patient' | 'caregiver' },
  fn: (q: Querier) => Promise<T>,
): Promise<T> {
  const client = await getAppPool().connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT set_config($1, $2, true)', ['app.org_id', session.orgId]);
    await client.query('SELECT set_config($1, $2, true)', ['app.current_patient_id', session.patientId]);
    await client.query('SELECT set_config($1, $2, true)', ['app.actor_role', session.actorRole]);
    await client.query('SELECT set_config($1, $2, true)', ['app.role', '']);
    await client.query('SELECT set_config($1, $2, true)', ['app.user_id', '']);
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch {
      /* ignore broken connection */
    }
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Creates a new authenticated session in patient_portal_session.
 */
export async function createPatientPortalSession(
  params: {
    orgId: string;
    patientId: string;
    actorRole: 'patient' | 'caregiver';
    caregiverContactId?: string | null;
    grantedScopes?: string[];
    deviceLabel?: string | null;
    expiresInMs?: number;
  },
  querier?: Querier,
): Promise<{ session: ValidatedPatientPortalSession; token: string }> {
  const { token, tokenHash } = newPatientPortalToken();
  const expiresInMs = params.expiresInMs ?? 14 * 24 * 60 * 60 * 1000; // 14 days default
  const expiresAt = new Date(Date.now() + expiresInMs);
  const scopes = params.grantedScopes ?? ['appointments', 'reminders', 'documents', 'preparation'];

  const execute = async (q: Querier) => {
    const res = await q.query<{ id: string }>(
      `INSERT INTO patient_portal_session (
         org_id, patient_id, actor_role, caregiver_contact_id,
         token_sha256, granted_scopes, device_label, expires_at
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id`,
      [
        params.orgId,
        params.patientId,
        params.actorRole,
        params.caregiverContactId ?? null,
        tokenHash,
        scopes,
        params.deviceLabel ?? null,
        expiresAt.toISOString(),
      ],
    );

    const sessionId = res.rows[0]!.id;

    return {
      token,
      session: {
        sessionId,
        orgId: params.orgId,
        patientId: params.patientId,
        actorRole: params.actorRole,
        caregiverContactId: params.caregiverContactId ?? null,
        grantedScopes: scopes,
        expiresAt,
        tokenHash,
      },
    };
  };

  if (querier) return execute(querier);
  return withPatientPortalContext(
    { orgId: params.orgId, patientId: params.patientId, actorRole: params.actorRole },
    execute,
  );
}

/**
 * Validates a bearer session token via portal_lookup_session.
 * Rejects expired, revoked, or non-existent tokens.
 */
export async function validatePatientPortalSessionToken(
  token: string,
): Promise<ValidatedPatientPortalSession | null> {
  const tokenHash = hashTokenSha256(token);
  const pool = getAppPool();
  const res = await pool.query<{
    session_id: string;
    org_id: string;
    patient_id: string;
    actor_role: 'patient' | 'caregiver';
    caregiver_contact_id: string | null;
    granted_scopes: string[];
    expires_at: Date;
    revoked_at: Date | null;
  }>('SELECT * FROM portal_lookup_session($1)', [tokenHash]);

  if (res.rowCount === 0) return null;
  const row = res.rows[0]!;

  if (row.revoked_at !== null) return null;
  if (new Date(row.expires_at).getTime() <= Date.now()) return null;

  return {
    sessionId: row.session_id,
    orgId: row.org_id,
    patientId: row.patient_id,
    actorRole: row.actor_role,
    caregiverContactId: row.caregiver_contact_id,
    grantedScopes: row.granted_scopes,
    expiresAt: new Date(row.expires_at),
    tokenHash,
  };
}

/**
 * Revokes an existing session immediately.
 */
export async function revokePatientPortalSession(
  sessionId: string,
  sessionContext: { orgId: string; patientId: string; actorRole: 'patient' | 'caregiver' },
  querier?: Querier,
): Promise<boolean> {
  const execute = async (q: Querier) => {
    const res = await q.query(
      'UPDATE patient_portal_session SET revoked_at = now() WHERE id = $1 AND revoked_at IS NULL',
      [sessionId],
    );
    return (res.rowCount ?? 0) > 0;
  };
  if (querier) return execute(querier);
  return withPatientPortalContext(sessionContext, execute);
}

/**
 * Records or updates a patient's document review confirmation.
 */
export async function recordPatientDocumentReview(
  q: Querier,
  params: {
    orgId: string;
    patientId: string;
    documentId: string;
    reviewStatus: 'unreviewed' | 'confirmed_by_patient' | 'discrepancy_flagged';
    reviewedByRole: 'patient' | 'caregiver';
    note?: string | null;
  },
): Promise<{ id: string; reviewStatus: string; reviewedAt: string }> {
  const res = await q.query<{ id: string; review_status: string; reviewed_at: string }>(
    `INSERT INTO patient_document_review (
       org_id, patient_id, document_id, review_status, reviewed_by_role, note, reviewed_at, updated_at
     )
     VALUES ($1, $2, $3, $4, $5, $6, now(), now())
     ON CONFLICT (org_id, patient_id, document_id)
     DO UPDATE SET
       review_status = EXCLUDED.review_status,
       reviewed_by_role = EXCLUDED.reviewed_by_role,
       note = EXCLUDED.note,
       updated_at = now()
     RETURNING id, review_status, reviewed_at::text`,
    [
      params.orgId,
      params.patientId,
      params.documentId,
      params.reviewStatus,
      params.reviewedByRole,
      params.note ?? null,
    ],
  );
  const row = res.rows[0]!;
  return { id: row.id, reviewStatus: row.review_status, reviewedAt: row.reviewed_at };
}

/**
 * Submits a patient discrepancy flag on a document record.
 */
export async function createPatientDiscrepancyFlag(
  q: Querier,
  params: {
    orgId: string;
    patientId: string;
    documentId: string;
    fieldName: 'date' | 'facility' | 'summary' | 'lab_value' | 'missing_page' | 'other';
    patientReason: string;
    linkedTaskId?: string | null;
  },
): Promise<{ id: string; status: string; createdAt: string }> {
  const res = await q.query<{ id: string; status: string; created_at: string }>(
    `INSERT INTO patient_discrepancy_flag (
       org_id, patient_id, document_id, field_name, patient_reason, linked_task_id
     )
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, status, created_at::text`,
    [
      params.orgId,
      params.patientId,
      params.documentId,
      params.fieldName,
      params.patientReason,
      params.linkedTaskId ?? null,
    ],
  );
  const row = res.rows[0]!;
  return { id: row.id, status: row.status, createdAt: row.created_at };
}

/**
 * Retrieves preparation state for a patient.
 */
export async function getPatientPreparationState(
  q: Querier,
  patientId: string,
): Promise<{
  checksJson: unknown[];
  questionsJson: unknown[];
  symptomNotes: string;
  companionName: string;
  packSelectedDocumentIds: string[];
  updatedAt: string;
} | null> {
  const res = await q.query<{
    checks_json: unknown[];
    questions_json: unknown[];
    symptom_notes: string;
    companion_name: string;
    pack_selected_document_ids: string[];
    updated_at: string;
  }>(
    `SELECT checks_json, questions_json, symptom_notes, companion_name,
            pack_selected_document_ids, updated_at::text
     FROM patient_preparation_state
     WHERE patient_id = $1`,
    [patientId],
  );
  if (res.rowCount === 0) return null;
  const r = res.rows[0]!;
  return {
    checksJson: r.checks_json ?? [],
    questionsJson: r.questions_json ?? [],
    symptomNotes: r.symptom_notes ?? '',
    companionName: r.companion_name ?? '',
    packSelectedDocumentIds: r.pack_selected_document_ids ?? [],
    updatedAt: r.updated_at,
  };
}

/**
 * Upserts consultation preparation state.
 */
export async function upsertPatientPreparationState(
  q: Querier,
  params: {
    orgId: string;
    patientId: string;
    appointmentId?: string | null;
    checks: unknown[];
    questions: unknown[];
    symptomNotes: string;
    companionName?: string;
    packSelectedDocumentIds?: string[];
  },
): Promise<{ id: string; updatedAt: string }> {
  const res = await q.query<{ id: string; updated_at: string }>(
    `INSERT INTO patient_preparation_state (
       org_id, patient_id, appointment_id, checks_json, questions_json,
       symptom_notes, companion_name, pack_selected_document_ids, updated_at
     )
     VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6, $7, $8, now())
     ON CONFLICT (org_id, patient_id)
     DO UPDATE SET
       appointment_id = EXCLUDED.appointment_id,
       checks_json = EXCLUDED.checks_json,
       questions_json = EXCLUDED.questions_json,
       symptom_notes = EXCLUDED.symptom_notes,
       companion_name = EXCLUDED.companion_name,
       pack_selected_document_ids = EXCLUDED.pack_selected_document_ids,
       updated_at = now()
     RETURNING id, updated_at::text`,
    [
      params.orgId,
      params.patientId,
      params.appointmentId ?? null,
      JSON.stringify(params.checks),
      JSON.stringify(params.questions),
      params.symptomNotes,
      params.companionName ?? '',
      params.packSelectedDocumentIds ?? [],
    ],
  );
  const row = res.rows[0]!;
  return { id: row.id, updatedAt: row.updated_at };
}

/**
 * Creates a time-bounded revocable share grant.
 */
export async function createPatientShareGrant(
  params: {
    orgId: string;
    patientId: string;
    recipientLabel: string;
    recipientRole: 'caregiver' | 'second_opinion_clinician' | 'self_print';
    sharedDocumentIds: string[];
    includeQuestions?: boolean;
    expiresInHours?: number;
  },
  querier?: Querier,
): Promise<{ grantId: string; shareToken: string; expiresAt: string }> {
  const shareToken = randomBytes(24).toString('base64url');
  const tokenHash = hashTokenSha256(shareToken);
  const hours = params.expiresInHours ?? 72; // 72 hours default
  const expiresAt = new Date(Date.now() + hours * 60 * 60 * 1000);

  const execute = async (q: Querier) => {
    const res = await q.query<{ id: string; expires_at: string }>(
      `INSERT INTO patient_share_grant (
         org_id, patient_id, recipient_label, recipient_role,
         shared_document_ids, include_questions, share_token_sha256, expires_at
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id, expires_at::text`,
      [
        params.orgId,
        params.patientId,
        params.recipientLabel,
        params.recipientRole,
        params.sharedDocumentIds,
        params.includeQuestions ?? true,
        tokenHash,
        expiresAt.toISOString(),
      ],
    );
    const row = res.rows[0]!;
    return { grantId: row.id, shareToken, expiresAt: row.expires_at };
  };

  if (querier) return execute(querier);
  return withPatientPortalContext(
    { orgId: params.orgId, patientId: params.patientId, actorRole: 'patient' },
    execute,
  );
}

/**
 * Revokes a share grant immediately.
 */
export async function revokePatientShareGrant(
  grantId: string,
  sessionContext: { orgId: string; patientId: string; actorRole: 'patient' | 'caregiver' },
  querier?: Querier,
): Promise<boolean> {
  const execute = async (q: Querier) => {
    const res = await q.query(
      `UPDATE patient_share_grant
       SET revoked_at = now()
       WHERE id = $1 AND patient_id = $2 AND revoked_at IS NULL`,
      [grantId, sessionContext.patientId],
    );
    return (res.rowCount ?? 0) > 0;
  };
  if (querier) return execute(querier);
  return withPatientPortalContext(sessionContext, execute);
}

/**
 * Validates a share grant token via portal_lookup_share.
 */
export async function validatePatientShareToken(
  shareToken: string,
): Promise<{
  grantId: string;
  orgId: string;
  patientId: string;
  recipientLabel: string;
  recipientRole: string;
  sharedDocumentIds: string[];
  includeQuestions: boolean;
  expiresAt: Date;
} | null> {
  const tokenHash = hashTokenSha256(shareToken);
  const pool = getAppPool();
  const res = await pool.query<{
    grant_id: string;
    org_id: string;
    patient_id: string;
    recipient_label: string;
    recipient_role: string;
    shared_document_ids: string[];
    include_questions: boolean;
    expires_at: Date;
    revoked_at: Date | null;
  }>('SELECT * FROM portal_lookup_share($1)', [tokenHash]);

  if (res.rowCount === 0) return null;
  const row = res.rows[0]!;
  if (row.revoked_at !== null) return null;
  if (new Date(row.expires_at).getTime() <= Date.now()) return null;

  return {
    grantId: row.grant_id,
    orgId: row.org_id,
    patientId: row.patient_id,
    recipientLabel: row.recipient_label,
    recipientRole: row.recipient_role,
    sharedDocumentIds: row.shared_document_ids,
    includeQuestions: row.include_questions,
    expiresAt: new Date(row.expires_at),
  };
}

/**
 * Creates a rate-limited OTP challenge.
 */
export async function createPatientOtpChallenge(
  params: {
    orgId: string;
    patientId: string;
    identifierValue: string;
    otpCode: string;
    expiresInMinutes?: number;
  },
  querier?: Querier,
): Promise<{ id: string; expiresAt: string }> {
  const otpHash = hashTokenSha256(params.otpCode);
  const minutes = params.expiresInMinutes ?? 10;
  const expiresAt = new Date(Date.now() + minutes * 60 * 1000);

  const execute = async (q: Querier) => {
    const res = await q.query<{ id: string; expires_at: string }>(
      `INSERT INTO patient_otp_challenge (
         org_id, patient_id, identifier_value, otp_hash, expires_at
       )
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, expires_at::text`,
      [params.orgId, params.patientId, params.identifierValue, otpHash, expiresAt.toISOString()],
    );
    return { id: res.rows[0]!.id, expiresAt: res.rows[0]!.expires_at };
  };

  if (querier) return execute(querier);
  return withPatientPortalContext(
    { orgId: params.orgId, patientId: params.patientId, actorRole: 'patient' },
    execute,
  );
}

/**
 * Verifies an OTP challenge with attempt limits, expiry, and single-use semantics.
 */
export async function verifyPatientOtpChallenge(
  params: {
    orgId: string;
    patientId: string;
    identifierValue: string;
    otpCode: string;
  },
  querier?: Querier,
): Promise<{ verified: boolean; error?: 'expired' | 'invalid_code' | 'max_attempts_exceeded' | 'not_found' }> {
  const execute = async (q: Querier) => {
    const res = await q.query<{
      id: string;
      otp_hash: string;
      attempts: number;
      max_attempts: number;
      expires_at: Date;
      consumed_at: Date | null;
    }>(
      `SELECT id, otp_hash, attempts, max_attempts, expires_at, consumed_at
       FROM patient_otp_challenge
       WHERE org_id = $1 AND patient_id = $2 AND identifier_value = $3 AND consumed_at IS NULL
       ORDER BY created_at DESC
       LIMIT 1
       FOR UPDATE`,
      [params.orgId, params.patientId, params.identifierValue],
    );

    if (res.rowCount === 0) return { verified: false, error: 'not_found' as const };
    const challenge = res.rows[0]!;

    if (new Date(challenge.expires_at).getTime() <= Date.now()) {
      return { verified: false, error: 'expired' as const };
    }

    if (challenge.attempts >= challenge.max_attempts) {
      return { verified: false, error: 'max_attempts_exceeded' as const };
    }

    const expectedHash = hashTokenSha256(params.otpCode);
    if (challenge.otp_hash !== expectedHash) {
      await q.query('UPDATE patient_otp_challenge SET attempts = attempts + 1 WHERE id = $1', [challenge.id]);
      return { verified: false, error: 'invalid_code' as const };
    }

    // Success: mark consumed (single-use)
    await q.query('UPDATE patient_otp_challenge SET consumed_at = now() WHERE id = $1', [challenge.id]);
    return { verified: true };
  };

  if (querier) return execute(querier);
  return withPatientPortalContext(
    { orgId: params.orgId, patientId: params.patientId, actorRole: 'patient' },
    execute,
  );
}
