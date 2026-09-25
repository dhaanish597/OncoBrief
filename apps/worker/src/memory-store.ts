import type {
  BeginJobResult,
  DocumentForIngest,
  IngestionJob,
  IngestionResult,
  NormalizedPage,
  SetStageInput,
} from '@oncobrief/db/worker';
import type { ExtractionPort } from '@oncobrief/ports';
import type { FinalizeDocumentInput, FinalizeResult, IngestionStore, WorkerAuditInput } from './store';

/**
 * In-memory IngestionStore for offline unit tests. It mirrors the schema
 * constraints the handlers rely on: `UNIQUE (document_id)` on the job (the
 * idempotency gate) and `UNIQUE (org_id, patient_id, content_sha256)` on the
 * document (the exact-duplicate gate).
 */
export class MemoryIngestionStore implements IngestionStore {
  documents = new Map<string, DocumentForIngest>();
  jobs = new Map<string, IngestionJob>();
  /** sha256Hex → documentId, for duplicate simulation. */
  hashes = new Map<string, string>();
  audits: WorkerAuditInput[] = [];
  ingestCalls = 0;
  ingestResult: IngestionResult = {
    documentId: 'doc',
    status: 'ready',
    pages: 1,
    spans: 3,
    candidates: 2,
    promoted: 2,
    rejected: 0,
    conflictsCreated: 0,
    conflictsFlagged: 0,
    documentType: 'pathology_report',
  };

  constructor(private readonly orgId: string) {}

  addDocument(doc: DocumentForIngest): void {
    this.documents.set(doc.id, doc);
  }

  private failNotImplemented(): never {
    throw new Error('not_implemented_in_memory_store');
  }

  async getDocumentForIngest(documentId: string): Promise<DocumentForIngest | null> {
    return this.documents.get(documentId) ?? null;
  }

  async beginIngestionJob(input: { documentId: string; correlationId: string }): Promise<BeginJobResult> {
    const existing = this.jobs.get(input.documentId);
    if (existing && existing.stage === 'completed') {
      return { job: existing, isNew: false, terminal: true };
    }
    const base: IngestionJob = {
      id: `job-${input.documentId}`,
      org_id: this.orgId,
      document_id: input.documentId,
      correlation_id: input.correlationId,
      stage: existing?.stage ?? 'queued',
      provider_job_id: existing?.provider_job_id ?? null,
      s3_bucket: null,
      s3_key: null,
      s3_version_id: null,
      attempts: existing ? existing.attempts + 1 : 0,
      last_error: null,
    };
    this.jobs.set(input.documentId, base);
    return { job: base, isNew: !existing, terminal: false };
  }

  async getIngestionJob(documentId: string): Promise<IngestionJob | null> {
    return this.jobs.get(documentId) ?? null;
  }

  async setIngestionStage(input: SetStageInput): Promise<void> {
    const job = this.jobs.get(input.documentId);
    if (!job) return;
    job.stage = input.stage;
    if (input.providerJobId) job.provider_job_id = input.providerJobId;
    job.last_error = input.lastError ?? null;
  }

  async setDocumentStatus(documentId: string, status: string, _error: string | null): Promise<void> {
    const doc = this.documents.get(documentId);
    if (doc) doc.ingest_status = status;
  }

  async setDocumentCorrelation(documentId: string, correlationId: string, _version: string | null): Promise<void> {
    const doc = this.documents.get(documentId);
    if (doc) doc.correlation_id = correlationId;
  }

  async finalizeDocument(input: FinalizeDocumentInput): Promise<FinalizeResult> {
    const owner = this.hashes.get(input.sha256Hex);
    if (owner && owner !== input.documentId) {
      return { duplicateOf: owner };
    }
    this.hashes.set(input.sha256Hex, input.documentId);
    return { duplicateOf: null };
  }

  async ingestNormalizedPages(
    documentId: string,
    _pages: NormalizedPage[],
    _extractor: ExtractionPort,
    _kind: 'rule' | 'llm',
    _correlationId: string,
  ): Promise<IngestionResult> {
    this.ingestCalls += 1;
    return { ...this.ingestResult, documentId };
  }

  async appendAudit(input: WorkerAuditInput): Promise<void> {
    this.audits.push(input);
  }

  /** Present so the class satisfies the interface even in partial fakes. */
  unused(): never {
    return this.failNotImplemented();
  }
}
