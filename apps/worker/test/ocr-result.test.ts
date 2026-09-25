import { describe, expect, it } from 'vitest';
import { handleOcrResult } from '../src/handlers/ocr-result';
import { MemoryIngestionStore } from '../src/memory-store';
import { MemoryQueueAdapter } from '../src/memory-queue';
import { NullLogger } from '../src/logger';
import { FakeAsyncOcr, MemoryStorage, stubExtractor } from './fakes';
import type { OcrResultMessage } from '../src/messages';

/**
 * Phase 3/4 — the OCR-result handler promotes exactly once, retains raw OCR,
 * and quarantines an empty result rather than guessing.
 */

const ORG = 'org-1';

function setup(status: 'SUCCEEDED' | 'IN_PROGRESS' | 'FAILED' = 'SUCCEEDED') {
  const store = new MemoryIngestionStore(ORG);
  store.addDocument({
    id: 'DOC',
    org_id: ORG,
    patient_id: 'PAT',
    storage_key: 'org/org-1/patient/PAT/doc/DOC/original.pdf',
    ingest_status: 'ocr_running',
    correlation_id: 'CORR',
  });
  store.jobs.set('DOC', {
    id: 'job-DOC',
    org_id: ORG,
    document_id: 'DOC',
    correlation_id: 'CORR',
    stage: 'textract_started',
    provider_job_id: 'job-1',
    s3_bucket: 'bucket',
    s3_key: 'org/org-1/patient/PAT/doc/DOC/original.pdf',
    s3_version_id: null,
    attempts: 0,
    last_error: null,
  });

  const storage = new MemoryStorage();
  const queue = new MemoryQueueAdapter();
  const ocr = new FakeAsyncOcr();
  ocr.status = status;
  return {
    store,
    storage,
    queue,
    ocr,
    extractor: stubExtractor,
    logger: new NullLogger(),
    config: { ocrResultQueue: 'ocr-q', ocrPollDelaySeconds: 0, ocrMaxPolls: 3, extractorKind: 'rule' as const },
    orgId: ORG,
  };
}

const notification: OcrResultMessage = {
  kind: 'ocr-notification',
  providerJobId: 'job-1',
  documentId: 'DOC',
  orgId: ORG,
  correlationId: 'CORR',
  pollCount: 0,
};

describe('handleOcrResult', () => {
  it('fetches results, retains raw OCR and promotes once', async () => {
    const d = setup('SUCCEEDED');

    await handleOcrResult(notification, d);

    expect(d.ocr.resultsCalls).toBe(1);
    expect(d.store.ingestCalls).toBe(1);
    expect(d.store.jobs.get('DOC')?.stage).toBe('completed');
    expect(d.storage.objects.has('org/org-1/patient/PAT/doc/DOC/ocr/raw.json')).toBe(true);
    expect(d.store.audits.map((a) => a.action)).toContain('ocr.completed');
  });

  it('does not promote twice if a completion arrives after the job completed', async () => {
    const d = setup('SUCCEEDED');
    await handleOcrResult(notification, d);
    await handleOcrResult(notification, d);
    expect(d.store.ingestCalls).toBe(1);
  });

  it('re-schedules a poll while the provider job is in progress', async () => {
    const d = setup('IN_PROGRESS');
    await handleOcrResult({ ...notification, kind: 'ocr-poll', pollCount: 1 }, d);
    expect(d.store.ingestCalls).toBe(0);
    expect(d.queue.sent.length).toBe(1);
    expect((d.queue.sent[0]!.body as { pollCount: number }).pollCount).toBe(2);
  });

  it('gives up after the poll limit and marks the document failed', async () => {
    const d = setup('IN_PROGRESS');
    await handleOcrResult({ ...notification, kind: 'ocr-poll', pollCount: 3 }, d);
    expect(d.store.documents.get('DOC')?.ingest_status).toBe('failed');
    expect(d.store.jobs.get('DOC')?.stage).toBe('failed');
    expect(d.store.audits.map((a) => a.action)).toContain('ocr.failed');
  });

  it('quarantines a document whose OCR produced no text', async () => {
    const d = setup('SUCCEEDED');
    d.ocr.pages = [];
    await handleOcrResult(notification, d);
    expect(d.store.documents.get('DOC')?.ingest_status).toBe('quarantined');
    expect(d.store.ingestCalls).toBe(0);
  });

  it('records a failure when the provider job fails', async () => {
    const d = setup('FAILED');
    await handleOcrResult(notification, d);
    expect(d.store.documents.get('DOC')?.ingest_status).toBe('failed');
    expect(d.store.audits.map((a) => a.action)).toContain('ocr.failed');
  });
});
