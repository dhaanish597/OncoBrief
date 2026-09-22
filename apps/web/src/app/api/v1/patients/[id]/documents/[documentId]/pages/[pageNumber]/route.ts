import { NextResponse } from 'next/server';
import { appendAuditEvent, getPageSpans, getDocument } from '@oncobrief/db';
import { getSession, tenantCtx } from '@/lib/session';
import { withTenant } from '@oncobrief/db';

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
  return handle(params, '/api/v1/patients/[id]/documents/[documentId]/pages/[n]');
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; documentId: string; pageNumber: string }> },
) {
  return handle(params, 'page_view');
}

async function handle(
  paramsPromise: Promise<{ id: string; documentId: string; pageNumber: string }>,
  purpose: string,
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: { code: 'unauthorized' } }, { status: 401 });

  const { id, documentId, pageNumber } = await paramsPromise;
  const page = Number(pageNumber);
  if (!Number.isInteger(page) || page < 1) {
    return NextResponse.json({ error: { code: 'bad_page' } }, { status: 400 });
  }

  const result = await withTenant(tenantCtx(session), async (q) => {
    const doc = await getDocument(q, id, documentId);
    if (!doc) return null;
    const spans = await getPageSpans(q, documentId, page);
    if (!spans) return null;
    await appendAuditEvent(q, {
      orgId: session.orgId,
      actor: { userId: session.userId, role: session.role },
      action: 'document.page_viewed',
      entityKind: 'document',
      entityId: documentId,
      outcome: 'success',
      metadata: { page, purpose },
    });
    return { document: doc, page: spans };
  });

  if (!result) {
    // Never 403: a cross-tenant fetch must not confirm that the row exists.
    return NextResponse.json({ error: { code: 'not_found' } }, { status: 404 });
  }

  if (purpose === 'page_view') return new NextResponse(null, { status: 204 });

  return NextResponse.json({
    document: {
      id: result.document.id,
      filename: result.document.filename,
      pageCount: result.document.pageCount,
      documentType: result.document.documentType,
      contentSha256: result.document.contentSha256,
    },
    page: {
      pageNumber: page,
      plainText: result.page.plainText,
      spans: result.page.spans,
    },
  });
}
