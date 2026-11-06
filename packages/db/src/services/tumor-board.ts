import { scanForBoundaryViolation } from '@oncobrief/domain';
import type { Querier } from '../client';
import { appendAuditEvent } from './audit';

export type TumorBoardStatus = 'scheduled' | 'in_progress' | 'completed' | 'cancelled';
export type CaseStatus = 'registered' | 'presented' | 'deferred' | 'concluded';

export interface TumorBoardMeetingRow {
  id: string;
  org_id: string;
  title: string;
  meeting_date: string;
  start_time: string;
  end_time: string;
  location: string;
  status: TumorBoardStatus;
  moderator_user_id: string | null;
  moderator_name?: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  cases_count: number;
}

export interface TumorBoardCaseRow {
  id: string;
  org_id: string;
  meeting_id: string;
  patient_id: string;
  patient_name: string;
  patient_identifier?: string;
  packet_id: string | null;
  packet_status?: string | null;
  staging_fact_id: string | null;
  cited_fact_ids: string[];
  presenter_user_id: string | null;
  presenter_name?: string | null;
  status: CaseStatus;
  order_index: number;
  discussion_summary: string | null;
  recommendation_notes: string | null;
  clinical_staging: string | null;
  checklist_histology_verified: boolean;
  checklist_imaging_verified: boolean;
  checklist_staging_verified: boolean;
  checklist_genomics_verified: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreateTumorBoardMeetingInput {
  orgId: string;
  title: string;
  meetingDate: string;
  startTime: string;
  endTime: string;
  location: string;
  moderatorUserId?: string | null;
  notes?: string | null;
  actorId: string;
}

export interface RegisterTumorBoardCaseInput {
  orgId: string;
  meetingId: string;
  patientId: string;
  packetId?: string | null;
  stagingFactId?: string | null;
  citedFactIds?: string[];
  presenterUserId?: string | null;
  clinicalStaging?: string | null;
  actorId: string;
}

export interface UpdateTumorBoardCaseInput {
  orgId: string;
  meetingId: string;
  patientId: string;
  status?: CaseStatus;
  discussionSummary?: string | null;
  recommendationNotes?: string | null;
  clinicalStaging?: string | null;
  stagingFactId?: string | null;
  citedFactIds?: string[];
  checklists?: {
    histology?: boolean;
    imaging?: boolean;
    staging?: boolean;
    genomics?: boolean;
  };
  actorId: string;
}

/**
 * Enforces OncoBrief's non-clinical boundary on Tumor Board text fields (TASK-004, ADR-004).
 */
function assertTumorBoardTextWithinBoundary(fields: (string | null | undefined)[]): void {
  for (const field of fields) {
    if (!field) continue;
    const violations = scanForBoundaryViolation(field);
    if (violations.length > 0) {
      throw new Error(`clinical_boundary_violation:${violations[0]!.patternId}`);
    }
  }
}

export interface VerifiedStagingFactRow {
  id: string;
  org_id: string;
  patient_id: string;
  patient_name?: string;
  fact_type: string;
  value_normalized: string;
  verbatim_quote: string;
  observed_on: string | null;
  document_id: string;
  document_name: string;
  state: string;
  confidence_band: string;
}

/**
 * Lists verified staging facts for a specific patient or across all patients in an organization.
 * Strictly excludes diagnosis, procedure, or unverified extracted candidate facts.
 */
export async function listVerifiedPatientStagingFacts(
  q: Querier,
  orgId: string,
  patientId?: string,
): Promise<VerifiedStagingFactRow[]> {
  const conditions = [
    'ef.org_id = $1',
    `ef.fact_type IN ('stage_text.as_written', 'stage.recorded')`,
    `COALESCE(es.state, 'extracted') IN ('verified', 'corrected')`,
    `d.ingest_error IS DISTINCT FROM 'consent_revoked_or_expired'`,
  ];
  const params: unknown[] = [orgId];

  if (patientId) {
    conditions.push('ef.patient_id = $2');
    params.push(patientId);
  }

  const sql = `
    SELECT
      ef.id,
      ef.org_id,
      ef.patient_id,
      p.display_name AS patient_name,
      ef.fact_type,
      ef.value_normalized,
      ef.verbatim_quote,
      ef.observed_on::text AS observed_on,
      ef.document_id,
      d.original_filename AS document_name,
      COALESCE(es.state, 'extracted') AS state,
      ef.confidence_band
    FROM evidence_fact ef
    JOIN patient p ON p.id = ef.patient_id AND p.org_id = ef.org_id
    JOIN document d ON d.id = ef.document_id AND d.org_id = ef.org_id
    LEFT JOIN evidence_state es ON es.evidence_fact_id = ef.id
    WHERE ${conditions.join(' AND ')}
    ORDER BY ef.created_at DESC
  `;

  const res = await q.query<VerifiedStagingFactRow>(sql, params);
  return res.rows;
}

/**
 * Resolves the verbatim text from a verified staging fact when `stagingFactId` is provided.
 */
async function resolveVerifiedStagingFactText(
  q: Querier,
  orgId: string,
  patientId: string,
  stagingFactId: string,
): Promise<string> {
  const res = await q.query<{ verbatim_quote: string; value_normalized: string }>(
    `SELECT ef.verbatim_quote, ef.value_normalized
       FROM evidence_fact ef
       JOIN document d ON d.id = ef.document_id AND d.org_id = ef.org_id
       LEFT JOIN evidence_state es ON es.evidence_fact_id = ef.id
      WHERE ef.org_id = $1
        AND ef.patient_id = $2
        AND ef.id = $3
        AND ef.fact_type IN ('stage_text.as_written', 'stage.recorded')
        AND COALESCE(es.state, 'extracted') IN ('verified', 'corrected')
        AND d.ingest_error IS DISTINCT FROM 'consent_revoked_or_expired'
      LIMIT 1`,
    [orgId, patientId, stagingFactId],
  );
  const row = res.rows[0];
  if (!row) {
    throw new Error('invalid_tumor_board_staging_fact: Fact must be a verified stage fact for this patient.');
  }
  return row.value_normalized || row.verbatim_quote;
}

export async function listTumorBoardMeetings(
  q: Querier,
  orgId: string,
  status?: TumorBoardStatus,
): Promise<TumorBoardMeetingRow[]> {
  const conditions = ['m.org_id = $1'];
  const values: unknown[] = [orgId];

  if (status) {
    conditions.push('m.status = $2');
    values.push(status);
  }

  const sql = `
    SELECT
      m.id,
      m.org_id,
      m.title,
      m.meeting_date::text,
      m.start_time::text,
      m.end_time::text,
      m.location,
      m.status,
      m.moderator_user_id,
      u.display_name AS moderator_name,
      m.notes,
      m.created_at::text,
      m.updated_at::text,
      (SELECT count(*)::int FROM tumor_board_case c WHERE c.meeting_id = m.id) AS cases_count
    FROM tumor_board_meeting m
    LEFT JOIN app_user u ON u.id = m.moderator_user_id
    WHERE ${conditions.join(' AND ')}
    ORDER BY m.meeting_date DESC, m.start_time ASC
  `;

  const res = await q.query<TumorBoardMeetingRow>(sql, values);
  return res.rows;
}

export async function getTumorBoardMeeting(
  q: Querier,
  orgId: string,
  meetingId: string,
): Promise<TumorBoardMeetingRow | null> {
  const sql = `
    SELECT
      m.id,
      m.org_id,
      m.title,
      m.meeting_date::text,
      m.start_time::text,
      m.end_time::text,
      m.location,
      m.status,
      m.moderator_user_id,
      u.display_name AS moderator_name,
      m.notes,
      m.created_at::text,
      m.updated_at::text,
      (SELECT count(*)::int FROM tumor_board_case c WHERE c.meeting_id = m.id) AS cases_count
    FROM tumor_board_meeting m
    LEFT JOIN app_user u ON u.id = m.moderator_user_id
    WHERE m.org_id = $1 AND m.id = $2
    LIMIT 1
  `;
  const res = await q.query<TumorBoardMeetingRow>(sql, [orgId, meetingId]);
  return res.rows[0] ?? null;
}

export async function createTumorBoardMeeting(
  q: Querier,
  input: CreateTumorBoardMeetingInput,
): Promise<string> {
  assertTumorBoardTextWithinBoundary([input.title, input.location, input.notes]);

  const sql = `
    INSERT INTO tumor_board_meeting (
      org_id, title, meeting_date, start_time, end_time, location, moderator_user_id, notes
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    RETURNING id
  `;
  const res = await q.query<{ id: string }>(sql, [
    input.orgId,
    input.title.trim(),
    input.meetingDate,
    input.startTime,
    input.endTime,
    input.location.trim(),
    input.moderatorUserId ?? null,
    input.notes ?? null,
  ]);
  if (!res.rows[0]) throw new Error('failed_to_create_meeting');
  const id = res.rows[0].id;

  await appendAuditEvent(q, {
    orgId: input.orgId,
    actor: { userId: input.actorId, role: null },
    action: 'tumor_board.meeting_created',
    entityKind: 'tumor_board_meeting',
    entityId: id,
    outcome: 'success',
    metadata: { title: input.title, meetingDate: input.meetingDate },
  });

  return id;
}

export async function updateTumorBoardMeeting(
  q: Querier,
  input: {
    orgId: string;
    meetingId: string;
    status?: TumorBoardStatus;
    notes?: string | null;
    actorId: string;
  },
): Promise<void> {
  assertTumorBoardTextWithinBoundary([input.notes]);

  await q.query(
    `UPDATE tumor_board_meeting
     SET status = COALESCE($3, status),
         notes = COALESCE($4, notes),
         updated_at = now()
     WHERE org_id = $1 AND id = $2`,
    [input.orgId, input.meetingId, input.status ?? null, input.notes ?? null],
  );

  await appendAuditEvent(q, {
    orgId: input.orgId,
    actor: { userId: input.actorId, role: null },
    action: 'tumor_board.meeting_updated',
    entityKind: 'tumor_board_meeting',
    entityId: input.meetingId,
    outcome: 'success',
    metadata: { status: input.status },
  });
}

export async function listTumorBoardCases(
  q: Querier,
  orgId: string,
  meetingId: string,
): Promise<TumorBoardCaseRow[]> {
  const sql = `
    SELECT
      c.id,
      c.org_id,
      c.meeting_id,
      c.patient_id,
      p.display_name AS patient_name,
      (SELECT value FROM patient_identifier pi WHERE pi.patient_id = p.id LIMIT 1) AS patient_identifier,
      c.packet_id,
      cp.status AS packet_status,
      c.staging_fact_id,
      COALESCE(c.cited_fact_ids, '{}') AS cited_fact_ids,
      c.presenter_user_id,
      u.display_name AS presenter_name,
      c.status,
      c.order_index,
      c.discussion_summary,
      c.recommendation_notes,
      c.clinical_staging,
      c.checklist_histology_verified,
      c.checklist_imaging_verified,
      c.checklist_staging_verified,
      c.checklist_genomics_verified,
      c.created_at::text,
      c.updated_at::text
    FROM tumor_board_case c
    JOIN patient p ON p.id = c.patient_id AND p.org_id = c.org_id
    LEFT JOIN consultation_packet cp ON cp.id = c.packet_id AND cp.org_id = c.org_id
    LEFT JOIN app_user u ON u.id = c.presenter_user_id
    WHERE c.org_id = $1 AND c.meeting_id = $2
    ORDER BY c.order_index ASC, c.created_at ASC
  `;
  const res = await q.query<TumorBoardCaseRow>(sql, [orgId, meetingId]);
  return res.rows;
}

export async function registerTumorBoardCase(
  q: Querier,
  input: RegisterTumorBoardCaseInput,
): Promise<string> {
  assertTumorBoardTextWithinBoundary([input.clinicalStaging]);

  let resolvedStaging = input.clinicalStaging?.trim() || null;
  if (input.stagingFactId) {
    const factText = await resolveVerifiedStagingFactText(
      q,
      input.orgId,
      input.patientId,
      input.stagingFactId,
    );
    if (!resolvedStaging) {
      resolvedStaging = factText;
    }
  }

  const citedFactIds = [...new Set([
    ...(input.citedFactIds ?? []).filter(Boolean),
    ...(input.stagingFactId ? [input.stagingFactId] : []),
  ])];

  const countRes = await q.query<{ count: string }>(
    `SELECT count(*)::text AS count FROM tumor_board_case WHERE org_id = $1 AND meeting_id = $2`,
    [input.orgId, input.meetingId],
  );
  const nextOrder = Number(countRes.rows[0]?.count || 0) + 1;

  const sql = `
    INSERT INTO tumor_board_case (
      org_id,
      meeting_id,
      patient_id,
      packet_id,
      staging_fact_id,
      cited_fact_ids,
      presenter_user_id,
      clinical_staging,
      order_index
    ) VALUES ($1, $2, $3, $4, $5, $6::uuid[], $7, $8, $9)
    RETURNING id
  `;
  const res = await q.query<{ id: string }>(sql, [
    input.orgId,
    input.meetingId,
    input.patientId,
    input.packetId ?? null,
    input.stagingFactId ?? null,
    citedFactIds,
    input.presenterUserId ?? null,
    resolvedStaging,
    nextOrder,
  ]);
  if (!res.rows[0]) throw new Error('failed_to_register_case');
  const caseId = res.rows[0].id;

  await appendAuditEvent(q, {
    orgId: input.orgId,
    actor: { userId: input.actorId, role: null },
    action: 'tumor_board.case_registered',
    entityKind: 'tumor_board_case',
    entityId: caseId,
    outcome: 'success',
    metadata: {
      meetingId: input.meetingId,
      patientId: input.patientId,
      packetId: input.packetId,
      stagingFactId: input.stagingFactId ?? null,
      citedFactsCount: citedFactIds.length,
    },
  });

  return caseId;
}

export async function updateTumorBoardCase(
  q: Querier,
  input: UpdateTumorBoardCaseInput,
): Promise<void> {
  assertTumorBoardTextWithinBoundary([
    input.discussionSummary,
    input.recommendationNotes,
    input.clinicalStaging,
  ]);

  let resolvedStaging = input.clinicalStaging ?? null;
  if (input.stagingFactId) {
    const factText = await resolveVerifiedStagingFactText(
      q,
      input.orgId,
      input.patientId,
      input.stagingFactId,
    );
    if (!resolvedStaging) {
      resolvedStaging = factText;
    }
  }

  const citedFactIds =
    input.citedFactIds !== undefined
      ? [...new Set([
          ...input.citedFactIds.filter(Boolean),
          ...(input.stagingFactId ? [input.stagingFactId] : []),
        ])]
      : null;

  const checklists = input.checklists || {};

  await q.query(
    `UPDATE tumor_board_case
     SET status = COALESCE($4, status),
         discussion_summary = COALESCE($5, discussion_summary),
         recommendation_notes = COALESCE($6, recommendation_notes),
         clinical_staging = COALESCE($7, clinical_staging),
         staging_fact_id = COALESCE($8, staging_fact_id),
         cited_fact_ids = CASE WHEN $9::uuid[] IS NOT NULL THEN $9::uuid[] ELSE cited_fact_ids END,
         checklist_histology_verified = COALESCE($10, checklist_histology_verified),
         checklist_imaging_verified = COALESCE($11, checklist_imaging_verified),
         checklist_staging_verified = COALESCE($12, checklist_staging_verified),
         checklist_genomics_verified = COALESCE($13, checklist_genomics_verified),
         updated_at = now()
     WHERE org_id = $1 AND meeting_id = $2 AND patient_id = $3`,
    [
      input.orgId,
      input.meetingId,
      input.patientId,
      input.status ?? null,
      input.discussionSummary ?? null,
      input.recommendationNotes ?? null,
      resolvedStaging,
      input.stagingFactId ?? null,
      citedFactIds,
      checklists.histology ?? null,
      checklists.imaging ?? null,
      checklists.staging ?? null,
      checklists.genomics ?? null,
    ],
  );

  await appendAuditEvent(q, {
    orgId: input.orgId,
    actor: { userId: input.actorId, role: null },
    action: 'tumor_board.case_updated',
    entityKind: 'tumor_board_case',
    entityId: input.meetingId,
    outcome: 'success',
    metadata: {
      patientId: input.patientId,
      status: input.status,
      stagingFactId: input.stagingFactId ?? null,
      citedFactsCount: citedFactIds ? citedFactIds.length : undefined,
      checklists: input.checklists,
    },
  });
}
