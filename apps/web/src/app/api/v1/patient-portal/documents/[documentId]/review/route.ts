import { NextResponse } from 'next/server';
import {
  getDocument,
  recordPatientDocumentReview,
  withPatientPortalContext,
  appendAuditEvent,
} from '@oncobrief/db';
import { requirePatientPortalSession, NO_CACHE_HEADERS } from '@/lib/patient-session';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ documentId: string }> },
) {
  const auth = await requirePatientPortalSession(request, 'documents');
  if (!auth.ok) return auth.response;
  const { session } = auth;

  const { documentId } = await params;
  if (!documentId) {
    return NextResponse.json(
      { error: { code: 'bad_request', message: 'documentId is required' } },
      { status: 400, headers: NO_CACHE_HEADERS },
    );
  }

  const result = await withPatientPortalContext(session, async (q) => {
    // 1. Ownership check: document must exist for this patient (SEC-NEG-06 / IDOR guard)
    const doc = await getDocument(q, session.patientId, documentId);
    if (!doc) {
      return { status: 404, error: 'not_found', message: 'Document not found' };
    }

    // 2. Record patient review strictly in patient_document_review.
    // SEC-NEG-10: ignore any caller payload attempting to mutate clinician verification or ingest_status.
    const review = await recordPatientDocumentReview(
      q,
      {
        orgId: session.orgId,
        patientId: session.patientId,
        documentId,
        reviewStatus: 'confirmed_by_patient',
        reviewedByRole: session.actorRole,
      },
    );

    // 3. Audit event
    try {
      await appendAuditEvent(q, {
        orgId: session.orgId,
        actor: { userId: null, role: session.actorRole },
        action: 'document.page_viewed', // using standard audit action
        entityKind: 'document',
        entityId: documentId,
        outcome: 'success',
        metadata: {
          patientId: session.patientId,
          caregiverContactId: session.caregiverContactId ?? null,
          patientReviewStatus: 'confirmed_by_patient',
        },
      });
    } catch {
      /* non-fatal audit */
    }

    return {
      status: 200,
      documentId,
      reviewStatus: review.reviewStatus,
      reviewedAt: review.reviewedAt,
    };
  });

  if ('error' in result) {
    return NextResponse.json(
      { error: { code: result.error, message: result.message } },
      { status: result.status, headers: NO_CACHE_HEADERS },
    );
  }

  return NextResponse.json(result, { status: 200, headers: NO_CACHE_HEADERS });
}
