import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import {
  appendAuditEvent,
  env,
  extensionForContentType,
  getPatient,
  getPresignPut,
  reserveDocumentForUpload,
  storageKeyFor,
  withTenant,
} from '@oncobrief/db';
import { can } from '@oncobrief/domain';
import { resolveApiCaller } from '@/lib/auth-api';

const MAX_BYTES = 25 * 1024 * 1024;
const PRESIGN_TTL_SECONDS = 900;
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/tiff',
  'image/webp',
  'application/fhir+json',
  'application/json',
  'application/dicom',
  'text/plain',
  'text/vcard',
]);

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  // 1. resolveApiCaller(request) -> 401 UNAUTHORIZED if null.
  const session = await resolveApiCaller(request);
  if (!session) {
    return NextResponse.json({ error: { code: 'unauthorized' } }, { status: 401 });
  }

  // 2. can(caller.role, 'document:upload') -> 403 FORBIDDEN if false.
  if (!can(session.role, 'document:upload')) {
    return NextResponse.json({ error: { code: 'forbidden' } }, { status: 403 });
  }

  // 3. Validate params.id is a valid UUID -> 400 BAD_REQUEST if invalid.
  const { id: patientId } = await params;
  if (!patientId || !UUID_REGEX.test(patientId)) {
    return NextResponse.json(
      { error: { code: 'bad_request', message: 'Invalid patient UUID' } },
      { status: 400 },
    );
  }

  // 4. Parse await request.json() inside try/catch and verify non-null object -> 400 INVALID_JSON if malformed.
  let body: Record<string, unknown>;
  try {
    const parsed = await request.json();
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return NextResponse.json({ error: { code: 'invalid_json' } }, { status: 400 });
    }
    body = parsed as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: { code: 'invalid_json' } }, { status: 400 });
  }

  // 5. Validate filename / fileName (non-empty string, <= 255 chars) -> 400 VALIDATION_ERROR.
  const rawFilename = body['filename'] ?? body['fileName'];
  const filename = typeof rawFilename === 'string' ? rawFilename.trim() : '';
  if (!filename || filename.length > 255) {
    return NextResponse.json(
      { error: { code: 'validation_error', message: 'filename is required (<= 255 chars)' } },
      { status: 400 },
    );
  }

  // 6. Validate contentType / mimeType against the non-interpretive intake allowlist -> 400 UNSUPPORTED_MEDIA_TYPE.
  const rawContentType = body['contentType'] ?? body['mimeType'];
  const mimeType = typeof rawContentType === 'string' ? rawContentType.trim() : '';
  if (!mimeType || !ALLOWED_MIME_TYPES.has(mimeType)) {
    return NextResponse.json(
      { error: { code: 'unsupported_media_type', message: 'Unsupported MIME type' } },
      { status: 400 },
    );
  }

  // 7. Validate sizeBytes / byteSize (> 0 and <= 25 * 1024 * 1024 bytes) -> 400 if <= 0, 413 PAYLOAD_TOO_LARGE if > 26,214,400.
  const rawSize = body['sizeBytes'] ?? body['byteSize'];
  const byteSize = typeof rawSize === 'number' ? rawSize : 0;
  if (byteSize <= 0) {
    return NextResponse.json(
      { error: { code: 'validation_error', message: 'sizeBytes must be greater than 0' } },
      { status: 400 },
    );
  }
  if (byteSize > MAX_BYTES) {
    return NextResponse.json(
      { error: { code: 'payload_too_large', maxBytes: MAX_BYTES } },
      { status: 413 },
    );
  }

  // 8. Only after Steps 1–7 pass: If STORAGE_DRIVER === 'fs', return 501 NOT_IMPLEMENTED; otherwise return 200/201 with S3 presigned URL.
  if (env.storageDriver === 'fs') {
    return NextResponse.json(
      {
        error: {
          code: 'not_implemented',
          message:
            'Direct upload requires S3-compatible storage. Set STORAGE_DRIVER=s3 (MinIO locally) and retry.',
        },
      },
      { status: 501 },
    );
  }

  const presigner = getPresignPut();
  if (!presigner) {
    return NextResponse.json(
      {
        error: {
          code: 'presign_unavailable',
          message:
            'Direct upload requires S3-compatible storage. Set STORAGE_DRIVER=s3 (MinIO locally) and retry.',
        },
      },
      { status: 501 },
    );
  }

  const documentId = randomUUID();
  const correlationId = `up:${documentId}`;
  const extension = extensionForContentType(mimeType);
  const s3Key = storageKeyFor(session.orgId, patientId, documentId, extension);

  // Confirm the patient is readable within this tenant before reserving a row.
  const reserved = await withTenant(session.ctx, async (q) => {
    const patient = await getPatient(q, patientId);
    if (!patient) return false;

    await reserveDocumentForUpload(q, {
      documentId,
      orgId: session.orgId,
      patientId,
      uploadedBy: session.userId,
      filename,
      mimeType,
      storageKey: s3Key,
      sourceKind: (typeof body['sourceKind'] === 'string' ? body['sourceKind'] : 'upload') as 'upload',
      documentDate: typeof body['documentDate'] === 'string' ? body['documentDate'] : null,
      issuingFacility: typeof body['issuingFacility'] === 'string' ? body['issuingFacility'] : null,
      correlationId,
    });

    await appendAuditEvent(q, {
      orgId: session.orgId,
      actor: { userId: session.userId, role: session.role },
      action: 'document.upload_url_issued',
      entityKind: 'document',
      entityId: documentId,
      outcome: 'success',
      correlationId,
      metadata: { filename, mime_type: mimeType, byte_size: byteSize },
    });
    return true;
  });

  if (!reserved) {
    // Cross-tenant or missing patient: 404, never 403 — do not confirm existence.
    return NextResponse.json({ error: { code: 'not_found' } }, { status: 404 });
  }

  const presigned = await presigner.presignPut(
    s3Key,
    mimeType,
    PRESIGN_TTL_SECONDS,
    byteSize > 0 ? byteSize : undefined,
  );

  return NextResponse.json(
    {
      document_id: documentId,
      presigned_url: presigned.url,
      s3_key: s3Key,
      expiration: presigned.expiresAt,
      required_headers: presigned.requiredHeaders,
      correlation_id: correlationId,
    },
    { status: 200 },
  );
}
