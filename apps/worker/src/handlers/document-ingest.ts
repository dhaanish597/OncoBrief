import { createHash } from 'node:crypto';
import { sniffContentType } from '@oncobrief/db/worker';
import type { AsyncOcrPort, ExtractionPort, QueuePort, StoragePort } from '@oncobrief/ports';
import type { DocumentIngestMessage } from '../messages';
import type { Logger } from '../logger';
import type { IngestionStore } from '../store';

export interface DocumentHandlerConfig {
  documentQueue: string;
  ocrResultQueue: string;
  ocrPollDelaySeconds: number;
  /** When false, the worker self-schedules polls instead of waiting on SNS. */
  useTextractNotifications: boolean;
}

export interface DocumentHandlerDeps {
  store: IngestionStore;
  queue: QueuePort;
  storage: StoragePort;
  ocr: AsyncOcrPort;
  extractor: ExtractionPort;
  logger: Logger;
  config: DocumentHandlerConfig;
  orgId: string;
  now?: () => Date;
}

/**
 * Stage 1 — S3 object created → download, server-side hash, start Textract.
 *
 * Idempotent by construction: `beginIngestionJob` returns `terminal: true`
 * after a document is completed, so an at-least-once redelivery of the same
 * S3 event does no work. On success it does not ingest evidence; it starts
 * OCR and either waits for a completion notification or self-schedules a poll.
 *
 * Throws on transient failure, so the SQS message is not deleted and is
 * redelivered, eventually to the dead-letter queue.
 */
export async function handleDocumentIngest(
  msg: DocumentIngestMessage,
  deps: DocumentHandlerDeps,
): Promise<void> {
  const startedAt = Date.now();
  const log = deps.logger;
  const base = {
    correlation_id: msg.correlationId,
    document_id: msg.documentId,
    org_id: msg.orgId,
    stage: 'document-ingest',
  };

  const doc = await deps.store.getDocumentForIngest(msg.documentId);
  if (!doc) {
    log.warn(base, 'document not found for ingest message; acking');
    return;
  }
  if (doc.ingest_status === 'ready' || doc.ingest_status === 'quarantined') {
    log.info({ ...base, status: doc.ingest_status }, 'document already ingested; skipping');
    return;
  }

  const began = await deps.store.beginIngestionJob({
    documentId: msg.documentId,
    correlationId: msg.correlationId,
    s3Bucket: msg.s3Bucket,
    s3Key: msg.s3Key,
    s3VersionId: msg.s3VersionId,
  });
  if (began.terminal) {
    log.info(base, 'duplicate delivery after completion; skipping');
    return;
  }
  const inProgressStages = new Set(['textract_started', 'ocr_fetched', 'extracting']);
  if (!began.isNew && inProgressStages.has(began.job.stage)) {
    // A redelivery of the same S3 event before OCR finished. OCR was already
    // started for this document; starting a second Textract job would double
    // the corpus. Skip and let the completion path advance.
    log.info({ ...base, status: began.job.stage }, 'ingest already in progress; skipping');
    return;
  }

  await deps.store.setDocumentCorrelation(msg.documentId, msg.correlationId, msg.s3VersionId);
  await deps.store.setDocumentStatus(msg.documentId, 'rendering', null);

  const bytes = await deps.storage.get(msg.s3Key);
  const sha256Hex = createHash('sha256').update(bytes).digest('hex');
  const mimeType = sniffContentType(bytes) ?? 'application/octet-stream';

  const finalized = await deps.store.finalizeDocument({
    documentId: msg.documentId,
    patientId: doc.patient_id,
    sha256: Buffer.from(sha256Hex, 'hex'),
    sha256Hex,
    byteSize: bytes.byteLength,
    mimeType,
    s3VersionId: msg.s3VersionId,
  });
  await deps.store.appendAudit({
    action: 'document.finalized',
    entityKind: 'document',
    entityId: msg.documentId,
    correlationId: msg.correlationId,
    outcome: 'success',
    metadata: { byte_size: bytes.byteLength, mime_type: mimeType, sha256: sha256Hex },
  });

  if (finalized.duplicateOf) {
    // Byte-identical re-upload: flagged for human confirmation, never deleted.
    await deps.store.setDocumentStatus(msg.documentId, 'ready', null);
    await deps.store.setIngestionStage({ documentId: msg.documentId, stage: 'completed' });
    await deps.store.appendAudit({
      action: 'document.duplicate_candidate',
      entityKind: 'document',
      entityId: msg.documentId,
      correlationId: msg.correlationId,
      outcome: 'success',
      metadata: { duplicate_of_document_id: finalized.duplicateOf, sha256: sha256Hex },
    });
    log.info({ ...base, status: 'duplicate_candidate' }, 'exact duplicate detected');
    return;
  }

  await deps.store.setDocumentStatus(msg.documentId, 'ocr_running', null);

  const job = await deps.ocr.startDocumentAnalysis({
    documentId: msg.documentId,
    orgId: deps.orgId,
    s3Key: msg.s3Key,
    s3Bucket: msg.s3Bucket,
    correlationId: msg.correlationId,
  });
  await deps.store.setIngestionStage({
    documentId: msg.documentId,
    stage: 'textract_started',
    providerJobId: job.providerJobId,
  });
  await deps.store.appendAudit({
    action: 'ocr.started',
    entityKind: 'document',
    entityId: msg.documentId,
    correlationId: msg.correlationId,
    outcome: 'success',
    metadata: { provider_job_id: job.providerJobId },
  });

  if (!deps.config.useTextractNotifications) {
    await deps.queue.send(
      deps.config.ocrResultQueue,
      {
        kind: 'ocr-poll',
        providerJobId: job.providerJobId,
        documentId: msg.documentId,
        orgId: deps.orgId,
        correlationId: msg.correlationId,
        pollCount: 1,
      },
      { delaySeconds: deps.config.ocrPollDelaySeconds, correlationId: msg.correlationId },
    );
  }

  log.info(
    {
      ...base,
      provider_job_id: job.providerJobId,
      status: 'textract_started',
      duration_ms: Date.now() - startedAt,
    },
    'started document analysis',
  );
}
