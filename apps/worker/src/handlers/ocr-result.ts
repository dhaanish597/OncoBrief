import type { AsyncOcrPort, ExtractionPort, QueuePort, StoragePort } from '@oncobrief/ports';
import type { NormalizedPage } from '@oncobrief/db/worker';
import type { Logger } from '../logger';
import type { IngestionStore } from '../store';
import type { OcrResultMessage } from '../messages';

export interface OcrHandlerConfig {
  ocrResultQueue: string;
  ocrPollDelaySeconds: number;
  ocrMaxPolls: number;
  extractorKind: 'rule' | 'llm';
}

export interface OcrHandlerDeps {
  store: IngestionStore;
  queue: QueuePort;
  storage: StoragePort;
  ocr: AsyncOcrPort;
  extractor: ExtractionPort;
  logger: Logger;
  config: OcrHandlerConfig;
  orgId: string;
}

/**
 * Stage 2 — Textract completion → fetch results → normalise → promote.
 *
 * Idempotency: the job stage is checked first, and the promotion path is only
 * reached once. If a completion notification and a self-scheduled poll race,
 * both read the same job row; the first to reach `completed` wins and the
 * second observes it and returns. Evidence is never appended twice.
 *
 * Raw Textract output is retained under `ocr/raw.json` before normalisation,
 * so extraction can be re-run and extractor versions diffed (architecture
 * §15.1). The raw payload is never discarded.
 */
export async function handleOcrResult(msg: OcrResultMessage, deps: OcrHandlerDeps): Promise<void> {
  const startedAt = Date.now();
  const log = deps.logger;
  const base = {
    correlation_id: msg.correlationId,
    document_id: msg.documentId,
    org_id: msg.orgId || deps.orgId,
    provider_job_id: msg.providerJobId,
    stage: 'ocr-result',
  };

  const doc = await deps.store.getDocumentForIngest(msg.documentId);
  if (!doc) {
    log.warn(base, 'document not found for ocr message; acking');
    return;
  }

  const job = await deps.store.getIngestionJob(msg.documentId);
  if (job?.stage === 'completed') {
    log.info(base, 'ocr result already processed; skipping');
    return;
  }

  const status = await deps.ocr.getJob(msg.providerJobId);

  if (status.status === 'IN_PROGRESS') {
    if (msg.kind === 'ocr-poll' && msg.pollCount >= deps.config.ocrMaxPolls) {
      await deps.store.setDocumentStatus(msg.documentId, 'failed', 'ocr_timeout');
      await deps.store.setIngestionStage({ documentId: msg.documentId, stage: 'failed', lastError: 'ocr_timeout' });
      await deps.store.appendAudit({
        action: 'ocr.failed',
        entityKind: 'document',
        entityId: msg.documentId,
        correlationId: msg.correlationId,
        outcome: 'error',
        metadata: { error_code: 'ocr_timeout', provider_job_id: msg.providerJobId },
      });
      log.error({ ...base, status: 'ocr_timeout' }, 'ocr job timed out');
      return;
    }
    await deps.queue.send(
      deps.config.ocrResultQueue,
      { ...msg, kind: 'ocr-poll', pollCount: (msg.pollCount ?? 0) + 1 },
      { delaySeconds: deps.config.ocrPollDelaySeconds, correlationId: msg.correlationId },
    );
    log.info({ ...base, status: 'in_progress', poll_count: msg.pollCount }, 'ocr still in progress');
    return;
  }

  if (status.status === 'FAILED') {
    await deps.store.setDocumentStatus(msg.documentId, 'failed', status.statusMessage ?? 'ocr_failed');
    await deps.store.setIngestionStage({
      documentId: msg.documentId,
      stage: 'failed',
      lastError: status.statusMessage ?? 'ocr_failed',
    });
    await deps.store.appendAudit({
      action: 'ocr.failed',
      entityKind: 'document',
      entityId: msg.documentId,
      correlationId: msg.correlationId,
      outcome: 'error',
      metadata: { error_code: 'ocr_failed', provider_job_id: msg.providerJobId },
    });
    log.error({ ...base, status: 'failed' }, 'ocr job failed');
    return;
  }

  const { pages, raw } = await deps.ocr.getResults(msg.providerJobId);

  if (pages.length === 0) {
    await deps.store.setDocumentStatus(msg.documentId, 'quarantined', 'manual_transcription_required');
    await deps.store.setIngestionStage({ documentId: msg.documentId, stage: 'completed' });
    await deps.store.appendAudit({
      action: 'ocr.completed',
      entityKind: 'document',
      entityId: msg.documentId,
      correlationId: msg.correlationId,
      outcome: 'success',
      metadata: { pages: 0, quarantined: true },
    });
    log.warn({ ...base, status: 'quarantined' }, 'ocr produced no text; quarantined');
    return;
  }

  const rawKey = `org/${deps.orgId}/patient/${doc.patient_id}/doc/${msg.documentId}/ocr/raw.json`;
  await deps.storage.put(rawKey, Buffer.from(JSON.stringify(raw)), 'application/json');

  await deps.store.setIngestionStage({ documentId: msg.documentId, stage: 'ocr_fetched' });

  const normalized: NormalizedPage[] = pages.map((p) => ({
    pageNumber: p.pageNumber,
    widthPx: p.widthPx ?? null,
    heightPx: p.heightPx ?? null,
    plainText: p.plainText,
    spans: p.spans,
    engine: p.engine,
    engineVersion: p.engineVersion,
  }));

  const result = await deps.store.ingestNormalizedPages(
    msg.documentId,
    normalized,
    deps.extractor,
    deps.config.extractorKind,
    msg.correlationId,
  );
  await deps.store.setIngestionStage({ documentId: msg.documentId, stage: 'completed' });
  await deps.store.appendAudit({
    action: 'ocr.completed',
    entityKind: 'document',
    entityId: msg.documentId,
    correlationId: msg.correlationId,
    outcome: 'success',
    metadata: {
      pages: result.pages,
      spans: result.spans,
      promoted: result.promoted,
      rejected: result.rejected,
      conflicts_created: result.conflictsCreated,
      extractor: deps.config.extractorKind,
    },
  });

  log.info(
    {
      ...base,
      status: 'completed',
      promoted: result.promoted,
      rejected: result.rejected,
      duration_ms: Date.now() - startedAt,
    },
    'ocr normalised and evidence promoted',
  );
}
