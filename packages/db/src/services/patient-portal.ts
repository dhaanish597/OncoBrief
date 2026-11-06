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

export interface PatientPreparationState {
  checksJson: unknown[];
  questionsJson: unknown[];
  symptomNotes: string;
  companionName: string;
  packSelectedDocumentIds: string[];
  updatedAt: string;
}

export interface PatientPortalSnapshot {
  patient: {
    id: string;
    demoCode: string | null;
    displayName: string;
    stage: string | null;
    diagnosis: string | null;
    primaryLanguage: string;
    mrn: string | null;
    primaryClinicianName: string | null;
  };
  readiness: {
    band: string;
    requiredItems: number;
    satisfiedItems: number;
    missingRequired: number;
    missingExpected: number;
    openTasks: number;
  } | null;
  appointments: Array<{
    id: string;
    scheduledStart: string;
    scheduledEnd: string;
    roomLabel: string;
    appointmentType: string;
    status: string;
    clinicianName: string | null;
  }>;
  timeline: Array<{
    id: string;
    factType: string;
    valueText: string;
    displayDate: string | null;
    state: string;
    documentId: string;
    evidenceFactId: string;
    verbatimQuote: string | null;
    sourcePage: number | null;
    sourceSpanId: string | null;
    sourceDocumentName: string | null;
    documentVersion: number | null;
    extractionMethod: string | null;
    extractorName: string | null;
    extractorVersion: string | null;
    extractedAt: string | null;
    reviewerId: string | null;
    reviewedAt: string | null;
  }>;
  documents: Array<{
    id: string;
    documentType: string | null;
    originalFilename: string;
    documentDate: string | null;
    issuingFacility: string | null;
    pageCount: number | null;
    clinicianStatus: string;
    patientReviewStatus: string | null;
    reviewedAt: string | null;
    duplicateStatus: string;
  }>;
  missingDocumentTasks: Array<{
    id: string;
    title: string;
    detail: string | null;
    dueOn: string | null;
    status: string;
    priority: string;
  }>;
  continuityMessages: Array<{
    id: string;
    bodyRendered: string;
    locale: string;
    approvedAt: string | null;
    attendanceStatus: string;
  }>;
  caregivers: Array<{
    id: string;
    fullName: string;
    relationship: string;
    phoneNumber: string;
    isActive: boolean;
    scopes: string[];
  }>;
  preparation: PatientPreparationState | null;
  shareGrants: Array<{
    id: string;
    granteeLabel: string;
    expiresAt: string;
    documentIds: string[];
    isRevoked: boolean;
  }>;
}

export async function getPatientPortalSnapshot(
  session: ValidatedPatientPortalSession,
  querier?: Querier,
): Promise<PatientPortalSnapshot> {
  const execute = async (q: Querier): Promise<PatientPortalSnapshot> => {
    // 1. Patient profile
    const pRes = await q.query<{
      id: string;
      demo_code: string | null;
      display_name: string;
      primary_language: string;
      mrn: string | null;
      primary_clinician_name: string | null;
    }>(
      `SELECT p.id, p.demo_code, p.display_name, p.primary_language,
              pi.value as mrn,
              u.display_name as primary_clinician_name
       FROM patient p
       LEFT JOIN patient_identifier pi ON pi.patient_id = p.id AND pi.org_id = p.org_id AND pi.system = 'mrn'
       LEFT JOIN app_user u ON u.id = p.primary_clinician_id
       WHERE p.id = $1 AND p.org_id = $2`,
      [session.patientId, session.orgId],
    );

    if (pRes.rowCount === 0) {
      throw new Error(`Patient not found: ${session.patientId}`);
    }
    const pRow = pRes.rows[0]!;

    // 2. Readiness snapshot
    const rRes = await q.query<{
      readiness_band: string;
      required_items: number;
      satisfied_items: number;
      missing_required: number;
      missing_expected: number;
      open_tasks: number;
    }>(
      `SELECT readiness_band, required_items, satisfied_items, missing_required, missing_expected, open_tasks
       FROM record_readiness_snapshot
       WHERE patient_id = $1 AND org_id = $2
       ORDER BY computed_at DESC
       LIMIT 1`,
      [session.patientId, session.orgId],
    );

    const readiness = rRes.rowCount && rRes.rowCount > 0
      ? {
          band: rRes.rows[0]!.readiness_band,
          requiredItems: rRes.rows[0]!.required_items,
          satisfiedItems: rRes.rows[0]!.satisfied_items,
          missingRequired: rRes.rows[0]!.missing_required,
          missingExpected: rRes.rows[0]!.missing_expected,
          openTasks: rRes.rows[0]!.open_tasks,
        }
      : null;

    // 3. Appointments (redacted if 'appointments' scope missing)
    let appointments: PatientPortalSnapshot['appointments'] = [];
    if (session.grantedScopes.includes('appointments')) {
      const aRes = await q.query<{
        id: string;
        scheduled_start: Date;
        scheduled_end: Date;
        room_label: string;
        appointment_type: string;
        status: string;
        clinician_name: string | null;
      }>(
        `SELECT a.id, a.scheduled_start, a.scheduled_end, a.room_label, a.appointment_type, a.status,
                u.display_name as clinician_name
         FROM appointment a
         LEFT JOIN app_user u ON u.id = a.clinician_id
         WHERE a.patient_id = $1 AND a.org_id = $2
         ORDER BY a.scheduled_start ASC`,
        [session.patientId, session.orgId],
      );
      appointments = aRes.rows.map((r) => ({
        id: r.id,
        scheduledStart: r.scheduled_start.toISOString(),
        scheduledEnd: r.scheduled_end.toISOString(),
        roomLabel: r.room_label,
        appointmentType: r.appointment_type,
        status: r.status,
        clinicianName: r.clinician_name,
      }));
    }

    // 4. Timeline and its provenance require the same document-access scope.
    let timeline: PatientPortalSnapshot['timeline'] = [];
    if (session.grantedScopes.includes('documents')) {
      const tRes = await q.query<{
        id: string;
        fact_type: string;
        value_text: string;
        display_date: Date | null;
        state: string;
        document_id: string;
        evidence_fact_id: string;
        verbatim_quote: string | null;
        source_page: number | null;
        source_span_id: string | null;
        source_document_name: string | null;
        document_version: number | null;
        extraction_method: string | null;
        extractor_name: string | null;
        extractor_version: string | null;
        extracted_at: Date | null;
        reviewer_id: string | null;
        reviewed_at: Date | null;
      }>(
        `SELECT te.id, te.fact_type, te.value_text, te.display_date, te.state, te.document_id,
                te.evidence_fact_id, ef.verbatim_quote,
                source_span.page_number AS source_page, source_span.id AS source_span_id,
                d.original_filename AS source_document_name, d.doc_version AS document_version,
                ef.extractor_kind AS extraction_method, ef.extractor_name, ef.extractor_version,
                ef.created_at AS extracted_at,
                CASE WHEN es.state IN ('verified', 'corrected') THEN es.last_actor_id END AS reviewer_id,
                CASE WHEN es.state IN ('verified', 'corrected') THEN es.last_changed_at END AS reviewed_at
         FROM timeline_event te
         LEFT JOIN evidence_fact ef ON ef.id = te.evidence_fact_id
           AND ef.org_id = te.org_id AND ef.patient_id = te.patient_id
           AND ef.document_id = te.document_id
         LEFT JOIN document d ON d.id = ef.document_id
           AND d.org_id = te.org_id AND d.patient_id = te.patient_id
         LEFT JOIN evidence_state es ON es.evidence_fact_id = ef.id
           AND es.org_id = te.org_id AND es.patient_id = te.patient_id
         LEFT JOIN LATERAL (
           SELECT ts.id, dp.page_number
           FROM evidence_span_link esl
           JOIN text_span ts ON ts.id = esl.text_span_id AND ts.org_id = esl.org_id
           JOIN document_page dp ON dp.id = ts.page_id AND dp.org_id = ts.org_id
             AND dp.document_id = ts.document_id
           WHERE esl.evidence_fact_id = ef.id AND esl.org_id = te.org_id
             AND ts.document_id = ef.document_id
           ORDER BY esl.ordinal, dp.page_number, ts.span_index, ts.id
           LIMIT 1
         ) source_span ON true
         WHERE te.patient_id = $1 AND te.org_id = $2
           AND te.state NOT IN ('rejected', 'superseded')
         ORDER BY te.display_date DESC NULLS LAST, te.updated_at DESC`,
        [session.patientId, session.orgId],
      );
      timeline = tRes.rows.map((r) => ({
        id: r.id,
        factType: r.fact_type,
        valueText: r.value_text,
        displayDate: r.display_date ? r.display_date.toISOString().split('T')[0]! : null,
        state: r.state,
        documentId: r.document_id,
        evidenceFactId: r.evidence_fact_id,
        verbatimQuote: r.verbatim_quote,
        sourcePage: r.source_page,
        sourceSpanId: r.source_span_id,
        sourceDocumentName: r.source_document_name,
        documentVersion: r.document_version,
        extractionMethod: r.extraction_method,
        extractorName: r.extractor_name,
        extractorVersion: r.extractor_version,
        extractedAt: r.extracted_at?.toISOString() ?? null,
        reviewerId: r.reviewer_id,
        reviewedAt: r.reviewed_at?.toISOString() ?? null,
      }));
    }

    // Derive stage/diagnosis from timeline if available
    let stage: string | null = null;
    let diagnosis: string | null = null;
    for (const item of timeline) {
      if (!stage && (item.factType === 'tnm_stage' || item.factType === 'stage')) {
        stage = item.valueText;
      }
      if (!diagnosis && (item.factType === 'primary_site' || item.factType === 'histology' || item.factType === 'diagnosis')) {
        diagnosis = item.valueText;
      }
    }

    // 5. Documents (redacted if 'documents' scope missing - SEC-NEG-16)
    let documents: PatientPortalSnapshot['documents'] = [];
    if (session.grantedScopes.includes('documents')) {
      const dRes = await q.query<{
        id: string;
        document_type: string | null;
        original_filename: string;
        document_date: Date | null;
        issuing_facility: string | null;
        page_count: number | null;
        ingest_status: string;
        duplicate_status: string;
        patient_review_status: string | null;
        reviewed_at: Date | null;
      }>(
        `SELECT d.id, d.document_type, d.original_filename, d.document_date, d.issuing_facility,
                d.page_count, d.ingest_status, d.duplicate_status,
                pdr.review_status as patient_review_status,
                pdr.reviewed_at
         FROM document d
         LEFT JOIN patient_document_review pdr ON pdr.document_id = d.id AND pdr.patient_id = d.patient_id AND pdr.org_id = d.org_id
         WHERE d.patient_id = $1 AND d.org_id = $2
         ORDER BY d.document_date DESC NULLS LAST, d.uploaded_at DESC`,
        [session.patientId, session.orgId],
      );
      documents = dRes.rows.map((r) => ({
        id: r.id,
        documentType: r.document_type,
        originalFilename: r.original_filename,
        documentDate: r.document_date ? r.document_date.toISOString().split('T')[0]! : null,
        issuingFacility: r.issuing_facility,
        pageCount: r.page_count,
        clinicianStatus: r.ingest_status,
        patientReviewStatus: r.patient_review_status,
        reviewedAt: r.reviewed_at ? r.reviewed_at.toISOString() : null,
        duplicateStatus: r.duplicate_status,
      }));
    }

    // 6. Missing document tasks
    const mRes = await q.query<{
      id: string;
      title: string;
      detail: string | null;
      due_on: Date | null;
      status: string;
      priority: string;
    }>(
      `SELECT t.id, t.title, t.detail, t.due_on, t.status, t.priority
       FROM admin_task t
       WHERE t.patient_id = $1 AND t.org_id = $2
         AND t.status = 'open'
         AND (t.origin_kind = 'record_gap' OR t.origin_record_gap_id IS NOT NULL OR t.task_kind ILIKE '%gap%' OR t.task_kind ILIKE '%missing%')
       ORDER BY t.due_on ASC NULLS LAST, t.created_at DESC`,
      [session.patientId, session.orgId],
    );
    const missingDocumentTasks = mRes.rows.map((r) => ({
      id: r.id,
      title: r.title,
      detail: r.detail,
      dueOn: r.due_on ? r.due_on.toISOString().split('T')[0]! : null,
      status: r.status,
      priority: r.priority,
    }));

    // 7. Approved continuity messages (EXCLUDES draft/pending/withdrawn - SEC-NEG-11)
    const msgRes = await q.query<{
      id: string;
      body_rendered: string;
      locale: string;
      approved_at: Date | null;
      attendance_status: string;
    }>(
      `SELECT pm.id, pm.body_rendered, pm.locale, pm.approved_at, pm.attendance_status
       FROM patient_message pm
       WHERE pm.patient_id = $1 AND pm.org_id = $2
         AND pm.status = 'approved'
       ORDER BY pm.approved_at DESC NULLS LAST, pm.created_at DESC`,
      [session.patientId, session.orgId],
    );
    const continuityMessages = msgRes.rows.map((r) => ({
      id: r.id,
      bodyRendered: r.body_rendered,
      locale: r.locale,
      approvedAt: r.approved_at ? r.approved_at.toISOString() : null,
      attendanceStatus: r.attendance_status,
    }));

    // 8. Caregivers
    const cgRes = await q.query<{
      id: string;
      full_name: string;
      relationship: string;
      phone_number: string;
      is_active: boolean;
      sync_reminders: boolean;
    }>(
      `SELECT c.id, c.full_name, c.relationship, c.phone_number, c.is_active, c.sync_reminders
       FROM caregiver_contact c
       WHERE c.patient_id = $1 AND c.org_id = $2
       ORDER BY c.consent_recorded_at ASC`,
      [session.patientId, session.orgId],
    );
    const caregivers = cgRes.rows.map((r) => ({
      id: r.id,
      fullName: r.full_name,
      relationship: r.relationship,
      phoneNumber: r.phone_number,
      isActive: r.is_active,
      scopes: r.sync_reminders ? ['appointments', 'reminders'] : [],
    }));

    // 9. Preparation (redacted if 'preparation' scope missing - SEC-NEG-16)
    let preparation: PatientPreparationState | null = null;
    if (session.grantedScopes.includes('preparation')) {
      preparation = await getPatientPreparationState(q, session.patientId);
    }

    // 10. Share Grants
    const sgRes = await q.query<{
      id: string;
      recipient_label: string;
      expires_at: Date;
      shared_document_ids: string[];
      is_revoked: boolean;
    }>(
      `SELECT sg.id, sg.recipient_label, sg.expires_at, sg.shared_document_ids, (sg.revoked_at IS NOT NULL) as is_revoked
       FROM patient_share_grant sg
       WHERE sg.patient_id = $1 AND sg.org_id = $2
       ORDER BY sg.created_at DESC`,
      [session.patientId, session.orgId],
    );
    const shareGrants = sgRes.rows.map((r) => ({
      id: r.id,
      granteeLabel: r.recipient_label,
      expiresAt: r.expires_at.toISOString(),
      documentIds: r.shared_document_ids,
      isRevoked: r.is_revoked,
    }));

    return {
      patient: {
        id: pRow.id,
        demoCode: pRow.demo_code,
        displayName: pRow.display_name,
        stage,
        diagnosis,
        primaryLanguage: pRow.primary_language,
        mrn: pRow.mrn,
        primaryClinicianName: pRow.primary_clinician_name,
      },
      readiness,
      appointments,
      timeline,
      documents,
      missingDocumentTasks,
      continuityMessages,
      caregivers,
      preparation,
      shareGrants,
    };
  };

  if (querier) return execute(querier);
  return withPatientPortalContext(session, execute);
}
