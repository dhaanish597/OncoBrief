import { NextResponse } from 'next/server';
import { withTenant, listConversations } from '@oncobrief/db';
import { getSession, tenantCtx } from '@/lib/session';

/** List the authenticated user's own conversations. */
export async function GET(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: { code: 'unauthorized' } }, { status: 401 });
  }

  const url = new URL(request.url);
  const patientId = url.searchParams.get('patientId');

  const conversations = await withTenant(tenantCtx(session), (q) =>
    listConversations(q, session.userId, patientId),
  );

  return NextResponse.json({ conversations });
}
