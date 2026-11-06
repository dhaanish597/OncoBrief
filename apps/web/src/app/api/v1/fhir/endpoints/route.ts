import { NextResponse } from 'next/server';
import { listFhirEndpoints, registerFhirEndpoint, withTenant } from '@oncobrief/db';
import { getSession, tenantCtx } from '@/lib/session';

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: { code: 'unauthorized' } }, { status: 401 });
  }

  const endpoints = await withTenant(tenantCtx(session), async (q) => {
    return listFhirEndpoints(q, session.orgId);
  });

  return NextResponse.json({ endpoints });
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: { code: 'unauthorized' } }, { status: 401 });
  }

  if (!['clinician', 'org_admin', 'records_officer'].includes(session.role)) {
    return NextResponse.json({ error: { code: 'forbidden' } }, { status: 403 });
  }

  let body: Partial<Parameters<typeof registerFhirEndpoint>[1]>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: { code: 'invalid_json' } }, { status: 400 });
  }

  if (!body.name || !body.baseUrl) {
    return NextResponse.json({ error: { code: 'missing_required_fields' } }, { status: 400 });
  }

  const { name, baseUrl } = body;

  try {
    const result = await withTenant(tenantCtx(session), async (q) => {
      return registerFhirEndpoint(q, {
        orgId: session.orgId,
        name,
        baseUrl,
        authKind: body.authKind ?? 'none',
        authConfig: body.authConfig,
        allowedOperations: body.allowedOperations,
        userId: session.userId,
      });
    });

    return NextResponse.json(result, { status: 201 });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: { code: 'registration_failed', message: err instanceof Error ? err.message : String(err) } },
      { status: 400 }
    );
  }
}
