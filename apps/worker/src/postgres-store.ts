import {
  appendAuditEvent,
  beginIngestionJob,
  getDocumentForIngest,
  getIngestionJob,
  ingestNormalizedPages,
  setDocumentCorrelation,
  setDocumentStatus,
  setIngestionStage,
  withTenant,
  type Querier,
  type TenantContext,
} from '@oncobrief/db/worker';
import type { ExtractionPort } from '@oncobrief/ports';
import type {
  FinalizeDocumentInput,
  FinalizeResult,
  IngestionStore,
  WorkerAuditInput,
} from './store';

/**
 * Postgres-backed store. A worker is a system actor: it holds no user id and
 * no role, but it still runs inside a tenant transaction, so RLS applies and a
 * wrong `org_id` returns zero rows rather than another tenant's data.
 */
export class PostgresIngestionStore implements IngestionStore {
  private readonly ctx: TenantContext;

  constructor(private readonly orgId: string) {
    this.ctx = { orgId, userId: null, role: null };
  }

  private run<T>(fn: (q: Querier) => Promise<T>): Promise<T> {
    return withTenant(this.ctx, fn);
  }

  getDocumentForIngest(documentId: string) {
    return this.run((q) => getDocumentForIngest(q, documentId));
  }

  beginIngestionJob(input: Parameters<IngestionStore['beginIngestionJob']>[0]) {
    return this.run((q) => beginIngestionJob(q, { ...input, orgId: this.orgId }));
  }

  getIngestionJob(documentId: string) {
    return this.run((q) => getIngestionJob(q, documentId));
  }

  setIngestionStage(input: Parameters<IngestionStore['setIngestionStage']>[0]) {
    return this.run((q) => setIngestionStage(q, input));
  }

  setDocumentStatus(documentId: string, status: string, error: string | null) {
    return this.run((q) => setDocumentStatus(q, documentId, status, error));
  }

  setDocumentCorrelation(documentId: string, correlationId: string, s3VersionId: string | null) {
    return this.run((q) => setDocumentCorrelation(q, documentId, correlationId, s3VersionId));
  }

  async finalizeDocument(input: FinalizeDocumentInput): Promise<FinalizeResult> {
    return this.run(async (q) => {
      // Exact-duplicate detection (Phase 10). Check first so the unique
      // constraint is not violated inside the transaction (which would abort it
      // and make any follow-up statement fail with "current transaction is
      // aborted"). The UNIQUE constraint remains the backstop for a race.
      const existing = await q.query<{ id: string }>(
        `SELECT id FROM document
          WHERE org_id = $1 AND patient_id = $2 AND content_sha256 = $3 AND id <> $4`,
        [this.orgId, input.patientId, input.sha256, input.documentId],
      );
      const duplicateOf = existing.rows[0]?.id ?? null;

      if (duplicateOf) {
        // A duplicate row references the original and deliberately keeps a NULL
        // content hash: the canonical `UNIQUE (org, patient, sha256)` belongs to
        // the original, and NULLs are distinct so several pending copies coexist.
        await q.query(
          `UPDATE document
              SET byte_size = $2, mime_type = $3,
                  s3_version_id = COALESCE($4, s3_version_id),
                  duplicate_of_document_id = $5,
                  duplicate_status = 'duplicate_candidate',
                  ingest_status = 'rendering'
            WHERE id = $1`,
          [input.documentId, input.byteSize, input.mimeType, input.s3VersionId, duplicateOf],
        );
        return { duplicateOf };
      }

      await q.query(
        `UPDATE document
            SET content_sha256 = $2, byte_size = $3, mime_type = $4,
                s3_version_id = COALESCE($5, s3_version_id),
                ingest_status = 'rendering'
          WHERE id = $1`,
        [input.documentId, input.sha256, input.byteSize, input.mimeType, input.s3VersionId],
      );
      return { duplicateOf: null };
    });
  }

  ingestNormalizedPages(
    documentId: string,
    pages: Parameters<IngestionStore['ingestNormalizedPages']>[1],
    extractor: ExtractionPort,
    extractorKind: 'rule' | 'llm',
    correlationId: string,
  ) {
    return this.run((q) => ingestNormalizedPages(q, extractor, documentId, pages, extractorKind, correlationId));
  }

  appendAudit(input: WorkerAuditInput): Promise<void> {
    return this.run(async (q) => {
      await appendAuditEvent(q, {
        orgId: this.orgId,
        actor: { userId: null, role: null, onBehalfOf: 'worker' },
        action: input.action,
        entityKind: input.entityKind,
        entityId: input.entityId,
        outcome: input.outcome,
        correlationId: input.correlationId,
        ...(input.metadata ? { metadata: input.metadata } : {}),
      });
    });
  }
}
