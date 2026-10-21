import { NextResponse } from 'next/server';
import { can } from '@oncobrief/domain';
import { appendAuditEvent, getPageSpans, getDocument, getStorage, withTenant } from '@oncobrief/db';
import { resolveApiCaller } from '@/lib/auth-api';

/**
 * Page geometry for the source inspector, plus the page-view audit event.
 * The client never constructs a storage path: geometry is resolved server-side
 * and the caller must hold a session whose org owns the document (RLS is the
 * backstop, but the read is also explicitly scoped by patient id).
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string; documentId: string; pageNumber: string }> },
) {
  return handle(request, params, '/api/v1/patients/[id]/documents/[documentId]/pages/[n]');
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; documentId: string; pageNumber: string }> },
) {
  return handle(request, params, 'page_view');
}

async function handle(
  request: Request,
  paramsPromise: Promise<{ id: string; documentId: string; pageNumber: string }>,
  purpose: string,
) {
  const session = await resolveApiCaller(request);
  if (!session) return NextResponse.json({ error: { code: 'unauthorized' } }, { status: 401 });
  if (!can(session.role, 'document:read_page')) {
    return NextResponse.json({ error: { code: 'forbidden' } }, { status: 403 });
  }

  const { id, documentId, pageNumber } = await paramsPromise;
  const page = Number(pageNumber);
  if (!Number.isInteger(page) || page < 1) {
    return NextResponse.json(
      { error: { code: 'bad_page', message: 'Page must be an integer >= 1' } },
      { status: 400 },
    );
  }

  const result = await withTenant(session.ctx, async (q) => {
    const doc = await getDocument(q, id, documentId);
    if (!doc) return null;
    const pageData = await getPageSpans(q, documentId, page);
    if (!pageData) return null;

    let documentUrl: string | null = null;
    try {
      const storage = getStorage();
      if (doc.storageKey) {
        documentUrl = await storage.presignGet(doc.storageKey, 300);
      }
    } catch (err) {
      console.warn('Failed to presign document URL for page:', err);
    }

    await appendAuditEvent(q, {
      orgId: session.orgId,
      actor: { userId: session.userId, role: session.role },
      action: 'document.page_viewed',
      entityKind: 'document',
      entityId: documentId,
      outcome: 'success',
      metadata: { page, purpose },
    });
    return { document: doc, page: pageData, documentUrl };
  });

  if (!result) {
    // Never 403: a cross-tenant fetch must not confirm that the row exists.
    return NextResponse.json({ error: { code: 'not_found' } }, { status: 404 });
  }

  if (purpose === 'page_view') return new NextResponse(null, { status: 204 });

  return NextResponse.json({
    documentUrl: result.documentUrl,
    pageNumber: page,
    width: result.page.widthPx ?? 800,
    height: result.page.heightPx ?? 1100,
    mimeType: result.document.mimeType,
    spans: result.page.spans,
    document: {
      id: result.document.id,
      filename: result.document.filename,
      pageCount: result.document.pageCount,
      documentType: result.document.documentType,
      contentSha256: result.document.contentSha256,
      mimeType: result.document.mimeType,
    },
    page: {
      pageNumber: page,
      plainText: result.page.plainText,
      spans: result.page.spans,
    },
  });
}
