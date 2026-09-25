import type { Querier } from '../client';

/**
 * Ingestion job bookkeeping (ADR 0015, Phase 3).
 *
 * S3 notifications and SQS delivery are **at-least-once**. A worker must
 * therefore decide whether to act from the database, never from the message:
 * `beginIngestionJob` is the idempotency gate. The first call for a document
 * returns `terminal: false`; a later redelivery after `completed` returns
 * `terminal: true`, and the worker acks the message without re-running OCR or
 * re-appending evidence.
 *
 * `document_ingestion_job` has `UNIQUE (document_id)`, so the gate is enforced
 * by the schema rather than by a read-then-write race.
 */

export type IngestionStage =
  | 'queued'
  | 'textract_started'
  | 'ocr_fetched'
  | 'extracting'
  | 'completed'
  | 'failed';

export interface IngestionJob {
  id: string;
  org_id: string;
  document_id: string;
  correlation_id: string;
  stage: IngestionStage;
  provider_job_id: string | null;
  s3_bucket: string | null;
  s3_key: string | null;
  s3_version_id: string | null;
  attempts: number;
  last_error: string | null;
}

export interface BeginJobInput {
  orgId: string;
  documentId: string;
  correlationId: string;
  s3Bucket?: string | null;
  s3Key?: string | null;
  s3VersionId?: string | null;
}

export interface BeginJobResult {
  job: IngestionJob;
  isNew: boolean;
  /** True when the document already reached a terminal ingested state. */
  terminal: boolean;
}

export async function beginIngestionJob(q: Querier, input: BeginJobInput): Promise<BeginJobResult> {
  const existing = await getIngestionJob(q, input.documentId);
  if (existing && existing.stage === 'completed') {
    return { job: existing, isNew: false, terminal: true };
  }

  const res = await q.query<IngestionJob>(
    `INSERT INTO document_ingestion_job
       (org_id, document_id, correlation_id, stage, s3_bucket, s3_key, s3_version_id)
     VALUES ($1,$2,$3,'queued',$4,$5,$6)
     ON CONFLICT (document_id) DO UPDATE SET
       attempts = document_ingestion_job.attempts + 1,
       correlation_id = EXCLUDED.correlation_id,
       s3_bucket = COALESCE(EXCLUDED.s3_bucket, document_ingestion_job.s3_bucket),
       s3_key = COALESCE(EXCLUDED.s3_key, document_ingestion_job.s3_key),
       s3_version_id = COALESCE(EXCLUDED.s3_version_id, document_ingestion_job.s3_version_id),
       updated_at = now()
     RETURNING *`,
    [input.orgId, input.documentId, input.correlationId, input.s3Bucket ?? null, input.s3Key ?? null, input.s3VersionId ?? null],
  );
  return { job: res.rows[0]!, isNew: !existing, terminal: false };
}

export async function getIngestionJob(q: Querier, documentId: string): Promise<IngestionJob | null> {
  const res = await q.query<IngestionJob>(
    'SELECT * FROM document_ingestion_job WHERE document_id = $1',
    [documentId],
  );
  return res.rows[0] ?? null;
}

export interface SetStageInput {
  documentId: string;
  stage: IngestionStage;
  providerJobId?: string | null;
  lastError?: string | null;
}

export async function setIngestionStage(q: Querier, input: SetStageInput): Promise<void> {
  await q.query(
    `UPDATE document_ingestion_job
        SET stage = $2,
            provider_job_id = COALESCE($3, provider_job_id),
            last_error = $4,
            attempts = CASE WHEN $2 = 'failed' THEN attempts + 1 ELSE attempts END,
            updated_at = now()
      WHERE document_id = $1`,
    [input.documentId, input.stage, input.providerJobId ?? null, input.lastError ?? null],
  );
}

export interface DocumentForIngest {
  id: string;
  org_id: string;
  patient_id: string;
  storage_key: string;
  ingest_status: string;
  correlation_id: string | null;
}

export async function getDocumentForIngest(
  q: Querier,
  documentId: string,
): Promise<DocumentForIngest | null> {
  const res = await q.query<DocumentForIngest>(
    `SELECT id, org_id, patient_id, storage_key, ingest_status, correlation_id
       FROM document WHERE id = $1`,
    [documentId],
  );
  return res.rows[0] ?? null;
}

/** Resolve a document from an S3 object key (S3 → SQS notifications). */
export async function findDocumentByStorageKey(
  q: Querier,
  orgId: string,
  storageKey: string,
): Promise<DocumentForIngest | null> {
  const res = await q.query<DocumentForIngest>(
    `SELECT id, org_id, patient_id, storage_key, ingest_status, correlation_id
       FROM document WHERE org_id = $1 AND storage_key = $2`,
    [orgId, storageKey],
  );
  return res.rows[0] ?? null;
}

export async function setDocumentStatus(
  q: Querier,
  documentId: string,
  status: string,
  error: string | null,
): Promise<void> {
  await q.query('UPDATE document SET ingest_status = $2, ingest_error = $3 WHERE id = $1', [
    documentId,
    status,
    error,
  ]);
}

export async function setDocumentCorrelation(
  q: Querier,
  documentId: string,
  correlationId: string,
  s3VersionId?: string | null,
): Promise<void> {
  await q.query(
    'UPDATE document SET correlation_id = $2, s3_version_id = COALESCE($3, s3_version_id) WHERE id = $1',
    [documentId, correlationId, s3VersionId ?? null],
  );
}
