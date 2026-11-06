import { NextResponse } from 'next/server';
import {
  getExtractor,
  getOcr,
  getStorage,
  importExternalFhirBundle,
  withTenant,
} from '@oncobrief/db';
import { getSession, tenantCtx } from '@/lib/session';

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: { code: 'unauthorized' } }, { status: 401 });
  }

  if (!['clinician', 'records_officer', 'coordinator', 'org_admin'].includes(session.role)) {
    return NextResponse.json({ error: { code: 'forbidden' } }, { status: 403 });
  }

  let body: Partial<Parameters<typeof importExternalFhirBundle>[2]>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: { code: 'invalid_json' } }, { status: 400 });
  }

  if (!body.patientId || !body.bundleJson) {
    return NextResponse.json(
      { error: { code: 'missing_required_fields', message: 'patientId and bundleJson are required' } },
      { status: 400 }
    );
  }

  const { patientId, bundleJson } = body;

  try {
    const deps = {
      storage: getStorage(),
      ocr: getOcr(),
      extractor: getExtractor(),
    };

    const result = await withTenant(tenantCtx(session), async (q) => {
      return importExternalFhirBundle(q, deps, {
        orgId: session.orgId,
        patientId,
        endpointId: body.endpointId,
        bundleJson,
        defaultOriginFacility: body.defaultOriginFacility,
        idempotencyKey: body.idempotencyKey,
        userId: session.userId,
        role: session.role,
      });
    });

    return NextResponse.json(result, { status: 200 });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: { code: 'fhir_import_failed', message: err instanceof Error ? err.message : String(err) } },
      { status: 400 }
    );
  }
}
