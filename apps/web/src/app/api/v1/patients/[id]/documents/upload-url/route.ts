import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import {
  appendAuditEvent,
  extensionForContentType,
  getPatient,
  getPresignPut,
  isAllowedUploadContentType,
  reserveDocumentForUpload,
  storageKeyFor,
  withTenant,
} from '@oncobrief/db';
import { can } from '@oncobrief/domain';
import { resolveApiCaller } from '@/lib/auth-api';

/**
 * `POST /api/v1/patients/{patient_id}/documents/upload-url` (Phase 2).
 *
 * Allocates a document id, reserves a tenant-scoped row, and returns a
 * short-lived presigned PUT so the bytes go **directly** to object storage.
 * Large PDFs never transit the application process.
 *
 * Trust is preserved because the hash is not trusted from the client: the
 * worker re-reads the object, computes SHA-256 and the real MIME type, and only
 * then can evidence be derived. The presigned key is tenant-prefixed and the
 * caller's `org_id` is asserted before signing, so a swapped identifier cannot
 * produce a valid signature.
 *
 * Authorization is enforced server-side (Layer 2 policy + Layer 3 RLS); the
 * frontend is never trusted for it.
 */

const MAX_BYTES = 25 * 1024 * 1024;
const PRESIGN_TTL_SECONDS = 900;

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await resolveApiCaller(request);
  if (!session) {
    return NextResponse.json({ error: { code: 'unauthorized' } }, { status: 401 });
  }
  if (!can(session.role, 'document:upload')) {
    return NextResponse.json({ error: { code: 'forbidden' } }, { status: 403 });
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

  const { id: patientId } = await params;

  let body: {
    filename?: unknown;
    mimeType?: unknown;
    byteSize?: unknown;
    documentDate?: unknown;
    issuingFacility?: unknown;
    sourceKind?: unknown;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: { code: 'invalid_json' } }, { status: 400 });
  }

  const filename = typeof body.filename === 'string' ? body.filename.trim() : '';
  const mimeType = typeof body.mimeType === 'string' ? body.mimeType : '';
  const byteSize = typeof body.byteSize === 'number' ? body.byteSize : 0;

  if (!filename) return NextResponse.json({ error: { code: 'filename_required' } }, { status: 400 });
  if (!isAllowedUploadContentType(mimeType)) {
    return NextResponse.json({ error: { code: 'unsupported_content_type' } }, { status: 415 });
  }
  if (byteSize > MAX_BYTES) {
    return NextResponse.json({ error: { code: 'upload_too_large', maxBytes: MAX_BYTES } }, { status: 413 });
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
      sourceKind: (typeof body.sourceKind === 'string' ? body.sourceKind : 'upload') as 'upload',
      documentDate: typeof body.documentDate === 'string' ? body.documentDate : null,
      issuingFacility: typeof body.issuingFacility === 'string' ? body.issuingFacility : null,
      correlationId,
    });

    await appendAuditEvent(q, {
      orgId: session.orgId,
      actor: { userId: session.userId, role: session.role },
      action: 'document.upload_url_issued',      entityKind: 'document',
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
    { status: 201 },
  );
}
