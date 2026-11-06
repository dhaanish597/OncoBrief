import { NextResponse } from 'next/server';
import { exportPatientFhirBundle, withTenant } from '@oncobrief/db';
import { getSession, tenantCtx } from '@/lib/session';

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: { code: 'unauthorized' } }, { status: 401 });
  }

  if (!['clinician', 'records_officer', 'org_admin'].includes(session.role)) {
    return NextResponse.json({ error: { code: 'forbidden' } }, { status: 403 });
  }

  let body: Partial<Parameters<typeof exportPatientFhirBundle>[1]>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: { code: 'invalid_json' } }, { status: 400 });
  }

  if (!body.patientId) {
    return NextResponse.json({ error: { code: 'missing_patient_id' } }, { status: 400 });
  }

  const { patientId } = body;

  try {
    const result = await withTenant(tenantCtx(session), async (q) => {
      return exportPatientFhirBundle(q, {
        orgId: session.orgId,
        patientId,
        exportKind: body.exportKind ?? 'nrces_health_document',
        consentId: body.consentId,
        verifiedOnly: body.verifiedOnly !== false,
        userId: session.userId,
        role: session.role,
        idempotencyKey: body.idempotencyKey,
      });
    });

    return NextResponse.json(result, {
      status: 200,
      headers: {
        'Content-Type': 'application/fhir+json',
      },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    const status = msg.includes('consent_not_granted') ? 403 : msg.includes('not_found') ? 404 : 400;
    return NextResponse.json(
      { error: { code: 'fhir_export_failed', message: msg } },
      { status }
    );
  }
}
