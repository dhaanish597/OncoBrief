import { NextResponse } from 'next/server';
import { getPatientPortalSnapshot } from '@oncobrief/db';
import { requirePatientPortalSession, NO_CACHE_HEADERS } from '@/lib/patient-session';

export async function GET(request: Request) {
  const auth = await requirePatientPortalSession(request);
  if (!auth.ok) return auth.response;
  const { session } = auth;

  try {
    const snapshot = await getPatientPortalSnapshot(session);
    return NextResponse.json(snapshot, { headers: NO_CACHE_HEADERS });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal Server Error';
    return NextResponse.json(
      { error: { code: 'snapshot_error', message } },
      { status: 500, headers: NO_CACHE_HEADERS },
    );
  }
}
