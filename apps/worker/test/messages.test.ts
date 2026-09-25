import { describe, expect, it } from 'vitest';
import { parseIngestMessage, parseOcrMessage, parseStorageKey } from '../src/messages';

describe('parseStorageKey', () => {
  it('extracts org, patient and document from a tenant-prefixed key', () => {
    const parts = parseStorageKey('org/ORG/patient/PAT/doc/DOC/original.pdf');
    expect(parts).toEqual({ orgId: 'ORG', patientId: 'PAT', documentId: 'DOC' });
  });

  it('returns null for a key without the tenant prefix', () => {
    expect(parseStorageKey('uploads/random.pdf')).toBeNull();
  });
});

describe('parseIngestMessage', () => {
  it('accepts a normalised application message', () => {
    const msg = parseIngestMessage({
      kind: 'document-ingest',
      documentId: 'DOC',
      orgId: 'ORG',
      correlationId: 'CORR',
      s3Bucket: 'bucket',
      s3Key: 'org/ORG/patient/PAT/doc/DOC/original.pdf',
    });
    expect(msg?.documentId).toBe('DOC');
    expect(msg?.correlationId).toBe('CORR');
  });

  it('extracts a raw S3 ObjectCreated notification, URL-decoding the key', () => {
    const msg = parseIngestMessage({
      Records: [
        {
          s3: {
            bucket: { name: 'oncobrief-documents' },
            object: { key: 'org/ORG/patient/PAT/doc/DOC/original+file.pdf', versionId: 'v3' },
          },
        },
      ],
    });
    expect(msg).not.toBeNull();
    expect(msg?.orgId).toBe('ORG');
    expect(msg?.documentId).toBe('DOC');
    expect(msg?.s3Key).toContain('original file.pdf');
    expect(msg?.s3VersionId).toBe('v3');
    expect(msg?.correlationId).toBe('s3:DOC');
  });

  it('returns null for unrelated payloads', () => {
    expect(parseIngestMessage({ hello: 'world' })).toBeNull();
    expect(parseIngestMessage('not json')).toBeNull();
  });
});

describe('parseOcrMessage', () => {
  it('unwraps an SNS Textract completion notification', () => {
    const msg = parseOcrMessage({
      Type: 'Notification',
      Message: JSON.stringify({
        JobId: 'job-123',
        Status: 'SUCCEEDED',
        DocumentLocation: { S3ObjectName: 'org/ORG/patient/PAT/doc/DOC/original.pdf' },
      }),
    });
    expect(msg?.kind).toBe('ocr-notification');
    expect(msg?.providerJobId).toBe('job-123');
    expect(msg?.documentId).toBe('DOC');
    expect(msg?.orgId).toBe('ORG');
  });

  it('parses a self-scheduled poll and preserves the poll count', () => {
    const msg = parseOcrMessage({
      kind: 'ocr-poll',
      providerJobId: 'job-123',
      documentId: 'DOC',
      orgId: 'ORG',
      correlationId: 'CORR',
      pollCount: 4,
    });
    expect(msg?.kind).toBe('ocr-poll');
    expect(msg?.pollCount).toBe(4);
  });

  it('prefers JobTag for the document id', () => {
    const msg = parseOcrMessage({ JobId: 'j', JobTag: 'DOC-TAGGED' });
    expect(msg?.documentId).toBe('DOC-TAGGED');
  });

  it('returns null when there is no job id', () => {
    expect(parseOcrMessage({ Status: 'SUCCEEDED' })).toBeNull();
  });
});
