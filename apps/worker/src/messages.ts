/**
 * Message normalisation for the async pipeline (Phase 3).
 *
 * Two entry points feed the worker:
 *   1. S3 `ObjectCreated` notifications (or a normalised message the web app
 *      enqueues in local mode).
 *   2. Textract completion notifications delivered through SNS, or a
 *      self-scheduled poll when no notification channel is configured.
 *
 * All shapes are untrusted input. Parsing is total: anything unrecognised
 * returns null and the caller acks and logs rather than crashing.
 */

export interface DocumentIngestMessage {
  kind: 'document-ingest';
  documentId: string;
  orgId: string;
  correlationId: string;
  s3Bucket: string;
  s3Key: string;
  s3VersionId: string | null;
}

export interface OcrResultMessage {
  kind: 'ocr-notification' | 'ocr-poll';
  providerJobId: string;
  documentId: string;
  orgId: string;
  correlationId: string;
  providerStatus?: string;
  /** Number of polls already performed for this job; bounds self-scheduling. */
  pollCount: number;
}

export interface StorageKeyParts {
  orgId: string;
  patientId: string;
  documentId: string;
}

/** Parse `org/{org}/patient/{patient}/doc/{documentId}/…`. */
export function parseStorageKey(key: string): StorageKeyParts | null {
  const m = /^org\/([^/]+)\/patient\/([^/]+)\/doc\/([^/]+)\//.exec(key);
  if (!m) return null;
  return { orgId: m[1]!, patientId: m[2]!, documentId: m[3]! };
}

function decodeS3Key(key: string): string {
  return decodeURIComponent(key.replace(/\+/g, ' '));
}

export function parseIngestMessage(raw: unknown): DocumentIngestMessage | null {
  const value = typeof raw === 'string' ? safeParse(raw) : raw;
  if (!value || typeof value !== 'object') return null;
  const obj = value as Record<string, unknown>;

  // Normalised message produced by the application (local mode).
  if (obj['kind'] === 'document-ingest' && typeof obj['documentId'] === 'string') {
    return {
      kind: 'document-ingest',
      documentId: String(obj['documentId']),
      orgId: String(obj['orgId']),
      correlationId: String(obj['correlationId'] ?? `doc:${obj['documentId']}`),
      s3Bucket: String(obj['s3Bucket']),
      s3Key: String(obj['s3Key']),
      s3VersionId: obj['s3VersionId'] ? String(obj['s3VersionId']) : null,
    };
  }

  // Raw S3 event notification.
  const records = obj['Records'];
  if (Array.isArray(records) && records.length > 0) {
    const record = records[0] as Record<string, unknown>;
    const s3 = (record['s3'] ?? {}) as Record<string, unknown>;
    const bucket = (s3['bucket'] ?? {}) as Record<string, unknown>;
    const object = (s3['object'] ?? {}) as Record<string, unknown>;
    const rawKey = object['key'];
    const bucketName = bucket['name'];
    if (typeof rawKey !== 'string' || typeof bucketName !== 'string') return null;
    const key = decodeS3Key(rawKey);
    const parts = parseStorageKey(key);
    if (!parts) return null;
    return {
      kind: 'document-ingest',
      documentId: parts.documentId,
      orgId: parts.orgId,
      correlationId: `s3:${parts.documentId}`,
      s3Bucket: bucketName,
      s3Key: key,
      s3VersionId: object['versionId'] ? String(object['versionId']) : null,
    };
  }

  return null;
}

export function parseOcrMessage(raw: unknown): OcrResultMessage | null {
  const value = typeof raw === 'string' ? safeParse(raw) : raw;
  if (!value || typeof value !== 'object') return null;
  let obj = value as Record<string, unknown>;

  // Self-scheduled poll.
  if (obj['kind'] === 'ocr-poll' && typeof obj['providerJobId'] === 'string') {
    return {
      kind: 'ocr-poll',
      providerJobId: String(obj['providerJobId']),
      documentId: String(obj['documentId']),
      orgId: String(obj['orgId']),
      correlationId: String(obj['correlationId']),
      pollCount: Number(obj['pollCount'] ?? 1),
    };
  }

  // SNS envelope: Message is a JSON string.
  if (obj['Type'] === 'Notification' && typeof obj['Message'] === 'string') {
    const inner = safeParse(obj['Message']);
    if (!inner) return null;
    obj = inner as Record<string, unknown>;
  }

  const jobId = obj['JobId'];
  if (typeof jobId !== 'string') return null;
  const documentLocation = (obj['DocumentLocation'] ?? {}) as Record<string, unknown>;
  const key = typeof documentLocation['S3ObjectName'] === 'string'
    ? String(documentLocation['S3ObjectName'])
    : '';
  const parts = key ? parseStorageKey(key) : null;
  const documentId = typeof obj['JobTag'] === 'string' ? String(obj['JobTag']) : parts?.documentId;
  if (!documentId) return null;
  return {
    kind: 'ocr-notification',
    providerJobId: jobId,
    documentId,
    orgId: parts?.orgId ?? '',
    correlationId: `ocr:${documentId}`,
    providerStatus: typeof obj['Status'] === 'string' ? String(obj['Status']) : undefined,
    pollCount: 0,
  };
}

function safeParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
