import { NextResponse } from 'next/server';
import { listPatientExtensionGrants, mintExtensionGrant } from '@oncobrief/db';
import { withSession } from '@/lib/session';

/**
 * Scoped Browser Extension Grant API (`TASK-016`, architecture §6.2).
 *
 * - GET: Lists recent extension grants for this patient.
 * - POST: Mints a single-use, 10-minute `ob_ext_*` token hashed with SHA-256
 *   in `extension_grant` and bound to `(org_id, user_id, patient_id, origin, scope)`.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const { id: patientId } = await params;
    const grants = await withSession(async (q, s) => {
      return listPatientExtensionGrants(q, s.orgId, patientId);
    });
    return NextResponse.json({ ok: true, grants });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'failed_to_list_grants';
    return NextResponse.json({ ok: false, error: msg }, { status: 400 });
  }
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const { id: patientId } = await params;
    const body = (await req.json().catch(() => ({}))) as {
      origin?: string;
      scope?: string[];
      ttlSeconds?: number;
    };

    const minted = await withSession(async (q, s) => {
      return mintExtensionGrant(q, {
        orgId: s.orgId,
        userId: s.userId,
        role: s.role,
        patientId,
        origin: body.origin?.trim() || 'https://ehr.hospital.example',
        scope: body.scope ?? ['capture:pdf', 'capture:dom_text', 'capture:fhir_json'],
        ttlSeconds: body.ttlSeconds ?? 600,
      });
    });

    return NextResponse.json({ ok: true, grant: minted });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'failed_to_mint_grant';
    const status = /forbidden/i.test(msg) ? 403 : /not_found/i.test(msg) ? 404 : 400;
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}
