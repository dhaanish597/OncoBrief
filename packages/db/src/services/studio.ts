import { createHash } from 'node:crypto';
import type { Querier } from '../client';
import { appendAuditEvent } from './audit';
import type { StudioArtifactKind } from '@oncobrief/domain';

export interface StudioArtifactRecord {
  id: string;
  orgId: string;
  patientId: string;
  artifactKind: StudioArtifactKind;
  title: string;
  locale: string;
  markdownBody: string;
  citedFactIds: string[];
  citedGuidelineIds: string[];
  isDeidentified: boolean;
  status: 'draft' | 'ready' | 'approved' | 'withdrawn';
  snapshotSha256: string | null;
  createdBy: string;
  createdAt: string;
  approvedBy: string | null;
  approvedAt: string | null;
  sourcesUnavailable?: boolean;
}

export interface CreateStudioArtifactInput {
  orgId: string;
  patientId: string;
  artifactKind: StudioArtifactKind;
  title: string;
  markdownBody: string;
  citedFactIds?: string[];
  citedGuidelineIds?: string[];
  isDeidentified?: boolean;
  locale?: string;
  createdBy: string;
}

export interface UpdateStudioArtifactInput {
  orgId: string;
  artifactId: string;
  title: string;
  markdownBody: string;
  citedFactIds: string[];
  citedGuidelineIds: string[];
  isDeidentified?: boolean;
  locale?: string;
  updatedBy: string;
}

export interface ApproveStudioArtifactInput {
  orgId: string;
  artifactId: string;
  approvedBy: string;
  role: string;
  approvalNote?: string;
  expectedMarkdownBody?: string;
  expectedCitedFactIds?: string[];
  expectedCitedGuidelineIds?: string[];
}

function mapRow(row: {
  id: string;
  org_id: string;
  patient_id: string;
  artifact_kind: string;
  title: string;
  locale: string;
  markdown_body: string;
  cited_fact_ids: string[];
  cited_guideline_ids: string[];
  is_deidentified: boolean;
  status: string;
  snapshot_sha256: Buffer | null;
  created_by: string;
  created_at: Date;
  approved_by: string | null;
  approved_at: Date | null;
}): StudioArtifactRecord {
  return {
    id: row.id,
    orgId: row.org_id,
    patientId: row.patient_id,
    artifactKind: row.artifact_kind as StudioArtifactKind,
    title: row.title,
    locale: row.locale,
    markdownBody: row.markdown_body,
    citedFactIds: row.cited_fact_ids || [],
    citedGuidelineIds: row.cited_guideline_ids || [],
    isDeidentified: row.is_deidentified,
    status: row.status as StudioArtifactRecord['status'],
    snapshotSha256: row.snapshot_sha256 ? row.snapshot_sha256.toString('hex') : null,
    createdBy: row.created_by,
    createdAt: row.created_at.toISOString(),
    approvedBy: row.approved_by,
    approvedAt: row.approved_at ? row.approved_at.toISOString() : null,
  };
}

export async function createStudioArtifact(
  q: Querier,
  input: CreateStudioArtifactInput,
): Promise<StudioArtifactRecord> {
  const citedFacts = input.citedFactIds ?? [];
  const citedGuidelines = input.citedGuidelineIds ?? [];

  const res = await q.query<{
    id: string;
    org_id: string;
    patient_id: string;
    artifact_kind: string;
    title: string;
    locale: string;
    markdown_body: string;
    cited_fact_ids: string[];
    cited_guideline_ids: string[];
    is_deidentified: boolean;
    status: string;
    snapshot_sha256: Buffer | null;
    created_by: string;
    created_at: Date;
    approved_by: string | null;
    approved_at: Date | null;
  }>(
    `INSERT INTO studio_artifact
       (org_id, patient_id, artifact_kind, title, locale, markdown_body,
        cited_fact_ids, cited_guideline_ids, is_deidentified, status, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'draft', $10)
     RETURNING *`,
    [
      input.orgId,
      input.patientId,
      input.artifactKind,
      input.title,
      input.locale ?? 'en-IN',
      input.markdownBody,
      citedFacts,
      citedGuidelines,
      input.isDeidentified ?? false,
      input.createdBy,
    ],
  );

  const record = mapRow(res.rows[0]!);

  await appendAuditEvent(q, {
    orgId: input.orgId,
    actor: { userId: input.createdBy, role: null },
    action: 'studio.draft_created',
    entityKind: 'studio_artifact',
    entityId: record.id,
    outcome: 'success',
    metadata: {
      patient_id: input.patientId,
      artifact_kind: input.artifactKind,
      cited_facts_count: citedFacts.length,
      cited_guidelines_count: citedGuidelines.length,
      is_deidentified: input.isDeidentified ?? false,
    },
  });

  return record;
}

export async function updateStudioArtifact(
  q: Querier,
  input: UpdateStudioArtifactInput,
): Promise<StudioArtifactRecord> {
  const current = await q.query<{ status: string }>(
    `SELECT status FROM studio_artifact WHERE org_id = $1 AND id = $2`,
    [input.orgId, input.artifactId],
  );
  if (!current.rows[0]) {
    throw new Error('Studio artifact not found');
  }
  if (current.rows[0].status === 'approved') {
    throw new Error('approved_studio_is_immutable');
  }

  const res = await q.query<{
    id: string;
    org_id: string;
    patient_id: string;
    artifact_kind: string;
    title: string;
    locale: string;
    markdown_body: string;
    cited_fact_ids: string[];
    cited_guideline_ids: string[];
    is_deidentified: boolean;
    status: string;
    snapshot_sha256: Buffer | null;
    created_by: string;
    created_at: Date;
    approved_by: string | null;
    approved_at: Date | null;
  }>(
    `UPDATE studio_artifact
        SET title = $3,
            markdown_body = $4,
            cited_fact_ids = $5,
            cited_guideline_ids = $6,
            is_deidentified = coalesce($7, is_deidentified),
            locale = coalesce($8, locale)
      WHERE org_id = $1 AND id = $2
      RETURNING *`,
    [
      input.orgId,
      input.artifactId,
      input.title,
      input.markdownBody,
      input.citedFactIds,
      input.citedGuidelineIds,
      input.isDeidentified,
      input.locale,
    ],
  );

  const record = mapRow(res.rows[0]!);

  await appendAuditEvent(q, {
    orgId: input.orgId,
    actor: { userId: input.updatedBy, role: null },
    action: 'studio.draft_updated',
    entityKind: 'studio_artifact',
    entityId: record.id,
    outcome: 'success',
    metadata: {
      cited_facts_count: input.citedFactIds.length,
      cited_guidelines_count: input.citedGuidelineIds.length,
    },
  });

  return record;
}

export interface StudioSourceAccess {
  accessible: boolean;
  expectedCount: number;
  availableCount: number;
}

export async function assertStudioArtifactSourcesAccessible(
  q: Querier,
  orgId: string,
  citedFactIds: readonly string[],
  requireVerified = true,
): Promise<StudioSourceAccess> {
  if (citedFactIds.length === 0) return { accessible: true, expectedCount: 0, availableCount: 0 };
  const uniqueIds = [...new Set(citedFactIds)];
  const res = await q.query<{ n: number }>(
    `SELECT count(*)::int AS n
       FROM evidence_fact ef
       JOIN document d ON d.id = ef.document_id
       LEFT JOIN evidence_state es ON es.evidence_fact_id = ef.id
      WHERE ef.org_id = $1
        AND ef.id = ANY($2::uuid[])
        AND d.ingest_error IS DISTINCT FROM 'consent_revoked_or_expired'
        AND (NOT $3::boolean OR coalesce(es.state, 'extracted') IN ('verified', 'corrected'))`,
    [orgId, uniqueIds, requireVerified],
  );
  const accessibleCount = res.rows[0]?.n ?? 0;
  return { accessible: accessibleCount === uniqueIds.length, expectedCount: uniqueIds.length, availableCount: accessibleCount };
}

export async function approveStudioArtifact(
  q: Querier,
  input: ApproveStudioArtifactInput,
): Promise<StudioArtifactRecord> {
  if (input.role !== 'clinician') {
    throw new Error('Studio approval requires clinician authority');
  }

  const current = await q.query<{
    status: string;
    markdown_body: string;
    cited_fact_ids: string[];
    cited_guideline_ids: string[];
  }>(
    `SELECT status, markdown_body, cited_fact_ids, cited_guideline_ids
       FROM studio_artifact WHERE org_id = $1 AND id = $2 FOR UPDATE`,
    [input.orgId, input.artifactId],
  );
  if (!current.rows[0]) {
    throw new Error('Studio artifact not found');
  }
  if (current.rows[0].status === 'approved') {
    throw new Error('Artifact is already approved');
  }

  const row = current.rows[0];
  if ((input.expectedMarkdownBody !== undefined && input.expectedMarkdownBody !== row.markdown_body) ||
      (input.expectedCitedFactIds !== undefined && JSON.stringify(input.expectedCitedFactIds) !== JSON.stringify(row.cited_fact_ids)) ||
      (input.expectedCitedGuidelineIds !== undefined && JSON.stringify(input.expectedCitedGuidelineIds) !== JSON.stringify(row.cited_guideline_ids))) {
    throw new Error('studio_draft_changed');
  }
  const access = await assertStudioArtifactSourcesAccessible(q, input.orgId, row.cited_fact_ids ?? []);
  if (!access.accessible) throw new Error('studio_source_withdrawn_or_unverified');

  const approvedAt = new Date();
  const canonicalPayload = JSON.stringify({
    markdownBody: current.rows[0].markdown_body,
    citedFactIds: current.rows[0].cited_fact_ids ?? [],
    citedGuidelineIds: current.rows[0].cited_guideline_ids ?? [],
    approvedBy: input.approvedBy,
    approvedAt: approvedAt.toISOString(),
  });
  const snapshotSha256 = createHash('sha256').update(canonicalPayload, 'utf8').digest();

  const res = await q.query<{
    id: string;
    org_id: string;
    patient_id: string;
    artifact_kind: string;
    title: string;
    locale: string;
    markdown_body: string;
    cited_fact_ids: string[];
    cited_guideline_ids: string[];
    is_deidentified: boolean;
    status: string;
    snapshot_sha256: Buffer | null;
    created_by: string;
    created_at: Date;
    approved_by: string | null;
    approved_at: Date | null;
  }>(
    `UPDATE studio_artifact
        SET status = 'approved',
            approved_by = $3,
            approved_at = $4,
            snapshot_sha256 = $5
      WHERE org_id = $1 AND id = $2
      RETURNING *`,
    [input.orgId, input.artifactId, input.approvedBy, approvedAt, snapshotSha256],
  );

  const record = mapRow(res.rows[0]!);

  await appendAuditEvent(q, {
    orgId: input.orgId,
    actor: { userId: input.approvedBy, role: 'clinician' },
    action: 'studio.approved',
    entityKind: 'studio_artifact',
    entityId: record.id,
    outcome: 'success',
    metadata: {
      snapshot_sha256: snapshotSha256.toString('hex'),
      artifact_kind: record.artifactKind,
      has_approval_note: !!input.approvalNote,
    },
  });

  return record;
}

export async function getStudioArtifact(
  q: Querier,
  orgId: string,
  artifactId: string,
): Promise<StudioArtifactRecord | null> {
  const res = await q.query<{
    id: string;
    org_id: string;
    patient_id: string;
    artifact_kind: string;
    title: string;
    locale: string;
    markdown_body: string;
    cited_fact_ids: string[];
    cited_guideline_ids: string[];
    is_deidentified: boolean;
    status: string;
    snapshot_sha256: Buffer | null;
    created_by: string;
    created_at: Date;
    approved_by: string | null;
    approved_at: Date | null;
  }>(
    `SELECT * FROM studio_artifact WHERE org_id = $1 AND id = $2`,
    [orgId, artifactId],
  );
  if (!res.rows[0]) return null;
  return maskUnavailableStudioSources(q, mapRow(res.rows[0]));
}

export async function listStudioArtifacts(
  q: Querier,
  orgId: string,
  patientId: string,
): Promise<StudioArtifactRecord[]> {
  const res = await q.query<{
    id: string;
    org_id: string;
    patient_id: string;
    artifact_kind: string;
    title: string;
    locale: string;
    markdown_body: string;
    cited_fact_ids: string[];
    cited_guideline_ids: string[];
    is_deidentified: boolean;
    status: string;
    snapshot_sha256: Buffer | null;
    created_by: string;
    created_at: Date;
    approved_by: string | null;
    approved_at: Date | null;
  }>(
    `SELECT * FROM studio_artifact WHERE org_id = $1 AND patient_id = $2 ORDER BY created_at DESC`,
    [orgId, patientId],
  );
  return Promise.all(res.rows.map((row) => maskUnavailableStudioSources(q, mapRow(row))));
}

async function maskUnavailableStudioSources(q: Querier, record: StudioArtifactRecord): Promise<StudioArtifactRecord> {
  const access = await assertStudioArtifactSourcesAccessible(q, record.orgId, record.citedFactIds, false);
  if (access.accessible) return record;
  return { ...record, title: 'Source unavailable — document restricted', markdownBody: '', sourcesUnavailable: true };
}

export function verifyStudioArtifactSnapshot(artifact: StudioArtifactRecord): boolean {
  if (artifact.status !== 'approved' || !artifact.snapshotSha256 || !artifact.approvedAt || !artifact.approvedBy) return false;
  return createHash('sha256').update(JSON.stringify({
    markdownBody: artifact.markdownBody, citedFactIds: artifact.citedFactIds,
    citedGuidelineIds: artifact.citedGuidelineIds, approvedBy: artifact.approvedBy, approvedAt: artifact.approvedAt,
  }), 'utf8').digest('hex') === artifact.snapshotSha256;
}

