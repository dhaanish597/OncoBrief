import { NextResponse } from 'next/server';
import {
  getDocument,
  getPageSpans,
  getStorage,
  withPatientPortalContext,
  appendAuditEvent,
} from '@oncobrief/db';
import { requirePatientPortalSession, NO_CACHE_HEADERS } from '@/lib/patient-session';

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: NO_CACHE_HEADERS });
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ documentId: string; pageNumber: string }> },
) {
  const auth = await requirePatientPortalSession(request, 'documents');
  if (!auth.ok) return auth.response;
  const { session } = auth;

  const { documentId, pageNumber } = await params;
  const page = Number(pageNumber);
  if (!Number.isInteger(page) || page < 1) {
    return NextResponse.json(
      { error: { code: 'bad_request', message: 'pageNumber must be an integer >= 1' } },
      { status: 400, headers: NO_CACHE_HEADERS },
    );
  }

  const result = await withPatientPortalContext(session, async (q) => {
    // 1. Verify document ownership by patient (SEC-NEG-06 IDOR protection)
    const doc = await getDocument(q, session.patientId, documentId);
    if (!doc) return null;

    // 2. Fetch page spans and text
    const pageData = await getPageSpans(q, documentId, page);
    if (!pageData) return null;

    // 3. Storage URL if available
    let documentUrl: string | null = null;
    try {
      const storage = getStorage();
      if (doc.storageKey) {
        documentUrl = await storage.presignGet(doc.storageKey, 300);
      }
    } catch {
      /* storage unavailable in test/local environments */
    }

    // 4. Audit logging
    try {
      await appendAuditEvent(q, {
        orgId: session.orgId,
        actor: { userId: session.caregiverContactId ?? session.patientId, role: session.actorRole },
        action: 'document.page_viewed',
        entityKind: 'document',
        entityId: documentId,
        outcome: 'success',
        metadata: { pageNumber: page },
      });
    } catch {
      /* non-fatal audit */
    }

    return {
      document: doc,
      page: {
        ...pageData,
        pageNumber: page,
      },
      documentUrl,
    };
  });

  if (!result) {
    return NextResponse.json(
      { error: { code: 'not_found', message: 'Document or page not found' } },
      { status: 404, headers: NO_CACHE_HEADERS },
    );
  }

  return NextResponse.json(result, { headers: NO_CACHE_HEADERS });
}
