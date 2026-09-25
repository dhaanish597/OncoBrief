import type {
  BeginJobInput,
  BeginJobResult,
  DocumentForIngest,
  IngestionJob,
  IngestionResult,
  NormalizedPage,
  SetStageInput,
} from '@oncobrief/db/worker';
import type { ExtractionPort } from '@oncobrief/ports';

/**
 * The storage boundary the handlers depend on. The Postgres implementation
 * binds one `org_id` (from the message) and opens a tenant transaction per
 * call; the in-memory implementation is used by the offline tests. Handlers
 * never touch a database or a network directly, so they are fully testable.
 */

export interface FinalizeDocumentInput {
  documentId: string;
  patientId: string;
  sha256: Buffer | null;
  sha256Hex: string;
  byteSize: number;
  mimeType: string;
  s3VersionId: string | null;
}

export interface FinalizeResult {
  /** Set when a byte-identical document already exists for this patient. */
  duplicateOf: string | null;
}

export type WorkerAuditAction =
  | 'document.finalized'
  | 'document.duplicate_candidate'
  | 'ocr.started'
  | 'ocr.completed'
  | 'ocr.failed'
  | 'ingestion.retry';

export interface WorkerAuditInput {
  action: WorkerAuditAction;
  entityKind: string;
  entityId: string;
  correlationId: string;
  outcome: 'success' | 'denied' | 'error';
  metadata?: Record<string, unknown>;
}

export interface IngestionStore {
  getDocumentForIngest(documentId: string): Promise<DocumentForIngest | null>;
  beginIngestionJob(input: Omit<BeginJobInput, 'orgId'>): Promise<BeginJobResult>;
  getIngestionJob(documentId: string): Promise<IngestionJob | null>;
  setIngestionStage(input: SetStageInput): Promise<void>;
  setDocumentStatus(documentId: string, status: string, error: string | null): Promise<void>;
  setDocumentCorrelation(documentId: string, correlationId: string, s3VersionId: string | null): Promise<void>;
  finalizeDocument(input: FinalizeDocumentInput): Promise<FinalizeResult>;
  ingestNormalizedPages(
    documentId: string,
    pages: NormalizedPage[],
    extractor: ExtractionPort,
    extractorKind: 'rule' | 'llm',
    correlationId: string,
  ): Promise<IngestionResult>;
  appendAudit(input: WorkerAuditInput): Promise<void>;
}
