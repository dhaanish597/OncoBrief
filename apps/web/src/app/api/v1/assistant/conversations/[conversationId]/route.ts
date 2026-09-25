import { NextResponse } from 'next/server';
import { withTenant, getConversation, deleteConversation } from '@oncobrief/db';
import { getSession, tenantCtx } from '@/lib/session';

/** Read one conversation. Only the owning user may read it. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ conversationId: string }> },
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: { code: 'unauthorized' } }, { status: 401 });
  }

  const { conversationId } = await params;
  const conversation = await withTenant(tenantCtx(session), (q) =>
    getConversation(q, conversationId, session.userId),
  );

  // Never reveal whether another user's conversation exists.
  if (!conversation) {
    return NextResponse.json({ error: { code: 'not_found' } }, { status: 404 });
  }

  return NextResponse.json({ conversation });
}

/** Delete one conversation (cascades to its messages). Owner only. */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ conversationId: string }> },
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: { code: 'unauthorized' } }, { status: 401 });
  }

  const { conversationId } = await params;
  await withTenant(tenantCtx(session), (q) =>
    deleteConversation(q, conversationId, session.userId),
  );

  return new NextResponse(null, { status: 204 });
}
