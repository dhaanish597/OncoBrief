import { NextResponse } from 'next/server';
import { deactivateFhirEndpoint, getFhirEndpoint, withTenant } from '@oncobrief/db';
import { getSession, tenantCtx } from '@/lib/session';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: { code: 'unauthorized' } }, { status: 401 });
  }

  const { id } = await params;
  const endpoint = await withTenant(tenantCtx(session), async (q) => {
    return getFhirEndpoint(q, session.orgId, id);
  });

  if (!endpoint) {
    return NextResponse.json({ error: { code: 'not_found' } }, { status: 404 });
  }

  return NextResponse.json({ endpoint });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: { code: 'unauthorized' } }, { status: 401 });
  }

  if (!['clinician', 'org_admin'].includes(session.role)) {
    return NextResponse.json({ error: { code: 'forbidden' } }, { status: 403 });
  }

  const { id } = await params;
  await withTenant(tenantCtx(session), async (q) => {
    await deactivateFhirEndpoint(q, session.orgId, id, session.userId);
  });

  return NextResponse.json({ success: true });
}
