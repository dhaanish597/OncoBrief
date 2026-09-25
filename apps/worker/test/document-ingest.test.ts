import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { handleDocumentIngest } from '../src/handlers/document-ingest';
import { MemoryIngestionStore } from '../src/memory-store';
import { MemoryQueueAdapter } from '../src/memory-queue';
import { NullLogger } from '../src/logger';
import { FakeAsyncOcr, MemoryStorage, stubExtractor } from './fakes';
import type { DocumentIngestMessage } from '../src/messages';

/**
 * Phase 3 — the document-ingest handler is idempotent under at-least-once
 * delivery, hashes bytes server-side, and flags exact duplicates without
 * deleting anything.
 */

const ORG = 'org-1';
const KEY = `org/${ORG}/patient/PAT/doc/DOC/original.pdf`;

function newDocumentStore(status = 'received') {
  const store = new MemoryIngestionStore(ORG);
  store.addDocument({
    id: 'DOC',
    org_id: ORG,
    patient_id: 'PAT',
    storage_key: KEY,
    ingest_status: status,
    correlation_id: null,
  });
  return store;
}

function deps(store: MemoryIngestionStore) {
  const storage = new MemoryStorage();
  const queue = new MemoryQueueAdapter();
  const ocr = new FakeAsyncOcr();
  return {
    store,
    queue,
    storage,
    ocr,
    extractor: stubExtractor,
    logger: new NullLogger(),
    config: {
      documentQueue: 'doc-q',
      ocrResultQueue: 'ocr-q',
      ocrPollDelaySeconds: 0,
      useTextractNotifications: false,
    },
    orgId: ORG,
  };
}

const message: DocumentIngestMessage = {
  kind: 'document-ingest',
  documentId: 'DOC',
  orgId: ORG,
  correlationId: 'CORR',
  s3Bucket: 'bucket',
  s3Key: KEY,
  s3VersionId: null,
};

describe('handleDocumentIngest', () => {
  it('hashes the object, starts OCR and records the provider job id', async () => {
    const store = newDocumentStore();
    const d = deps(store);
    d.storage.objects.set(KEY, Buffer.from('%PDF-1.7 fake'));

    await handleDocumentIngest(message, d);

    expect(d.ocr.started).toBe(1);
    expect(store.documents.get('DOC')?.ingest_status).toBe('ocr_running');
    const job = store.jobs.get('DOC');
    expect(job?.stage).toBe('textract_started');
    expect(job?.provider_job_id).toBe('job-1');
    const sha = createHash('sha256').update(Buffer.from('%PDF-1.7 fake')).digest('hex');
    expect(store.hashes.get(sha)).toBe('DOC');
    expect(store.audits.map((a) => a.action)).toContain('document.finalized');
    expect(store.audits.map((a) => a.action)).toContain('ocr.started');
    // A poll was scheduled because notifications are disabled.
    expect(d.queue.sent.some((s) => (s.body as { kind?: string }).kind === 'ocr-poll')).toBe(true);
  });

  it('does not start a second OCR job when the same S3 event is redelivered', async () => {
    const store = newDocumentStore();
    const d = deps(store);
    d.storage.objects.set(KEY, Buffer.from('%PDF-1.7 fake'));

    await handleDocumentIngest(message, d);
    await handleDocumentIngest(message, d);

    expect(d.ocr.started).toBe(1);
  });

  it('flags a byte-identical upload as a duplicate candidate and never deletes it', async () => {
    const store = newDocumentStore();
    const d = deps(store);
    const bytes = Buffer.from('%PDF-1.7 same bytes');
    d.storage.objects.set(KEY, bytes);
    const sha = createHash('sha256').update(bytes).digest('hex');
    // Pretend another document for this patient already has these bytes.
    store.hashes.set(sha, 'OTHER-DOC');

    await handleDocumentIngest(message, d);

    expect(d.ocr.started).toBe(0);
    expect(store.documents.get('DOC')?.ingest_status).toBe('ready');
    expect(store.audits.map((a) => a.action)).toContain('document.duplicate_candidate');
    expect(d.storage.objects.has(KEY)).toBe(true);
  });

  it('skips a document that is already ready', async () => {
    const store = newDocumentStore('ready');
    const d = deps(store);
    d.storage.objects.set(KEY, Buffer.from('%PDF-1.7 fake'));

    await handleDocumentIngest(message, d);

    expect(d.ocr.started).toBe(0);
    expect(store.jobs.size).toBe(0);
  });
});
