import { NextResponse } from 'next/server';
import {
  withTransaction,
  createPatientPortalSession,
  revokePatientPortalSession,
  verifyPatientOtpChallenge,
  appendAuditEvent,
  withPatientPortalContext,
} from '@oncobrief/db';
import { requirePatientPortalSession, NO_CACHE_HEADERS, checkRateLimit } from '@/lib/patient-session';

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: NO_CACHE_HEADERS });
}

export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    const parsed = await request.json();
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return NextResponse.json({ error: { code: 'bad_request' } }, { status: 400, headers: NO_CACHE_HEADERS });
    }
    body = parsed as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: { code: 'bad_request' } }, { status: 400, headers: NO_CACHE_HEADERS });
  }

  const {
    hospitalSlug,
    actorRole = 'patient',
    caregiverPhone,
    deviceLabel,
  } = body as {
    hospitalSlug?: string;
    actorRole?: 'patient' | 'caregiver';
    caregiverPhone?: string;
    deviceLabel?: string;
  };
  const patientExternalId = ((body.patientExternalId ?? body.identifier) as string | undefined)?.trim();
  const otpCode = ((body.otpCode ?? body.otp) as string | undefined)?.trim();

  if (!hospitalSlug || typeof hospitalSlug !== 'string' ||
      !patientExternalId || typeof patientExternalId !== 'string' ||
      !otpCode || typeof otpCode !== 'string') {
    return NextResponse.json(
      { error: { code: 'bad_request', message: 'hospitalSlug, patientExternalId, and otpCode are required' } },
      { status: 400, headers: NO_CACHE_HEADERS },
    );
  }

  if (actorRole !== 'patient' && actorRole !== 'caregiver') {
    return NextResponse.json(
      { error: { code: 'bad_request', message: 'actorRole must be patient or caregiver' } },
      { status: 400, headers: NO_CACHE_HEADERS },
    );
  }

  const clientIp = request.headers.get('x-forwarded-for') ?? 'local';
  const rateLimitKey = `${clientIp}:${patientExternalId}`;
  if (!checkRateLimit(rateLimitKey)) {
    return NextResponse.json(
      { error: { code: 'rate_limit_exceeded', message: 'Too many login attempts. Please wait 15 minutes.' } },
      { status: 429, headers: { ...NO_CACHE_HEADERS, 'Retry-After': '900' } },
    );
  }

  // Transaction-scoped resolution of tenant, patient and caregiver via SECURITY DEFINER helpers
  const lookup = await withTransaction(async (q) => {
    // 1. Resolve Hospital / Organization to ensure hospital exists
    const orgRes = await q.query<{ id: string; slug: string; name: string; is_demo_fixture: boolean }>(
      'SELECT id, slug, name, is_demo_fixture FROM portal_lookup_hospital($1)',
      [hospitalSlug],
    );
    if (orgRes.rowCount === 0) {
      return { status: 404, error: 'hospital_not_found', message: 'Hospital not found' };
    }

    // 2. Resolve Patient
    const patientRes = await q.query<{
      org_id: string;
      org_slug: string;
      org_name: string;
      org_is_demo: boolean;
      patient_id: string;
      demo_code: string | null;
      display_name: string;
      patient_is_demo: boolean;
    }>(
      'SELECT * FROM portal_lookup_patient_by_identifier($1, $2)',
      [hospitalSlug, patientExternalId],
    );

    if (patientRes.rowCount === 0) {
      return { status: 404, error: 'patient_not_found', message: 'Patient not found' };
    }
    const row = patientRes.rows[0]!;
    const org = {
      id: row.org_id,
      slug: row.org_slug,
      name: row.org_name,
      is_demo_fixture: row.org_is_demo,
    };
    const patient = {
      id: row.patient_id,
      demo_code: row.demo_code,
      display_name: row.display_name,
      is_demo_fixture: row.patient_is_demo,
    };

    // 3. If Caregiver role, verify caregiver contact and active consent
    let caregiverContactId: string | null = null;
    if (actorRole === 'caregiver') {
      if (!caregiverPhone) {
        return { status: 400, error: 'bad_request', message: 'caregiverPhone is required for caregiver role' };
      }
      const cgRes = await q.query<{ caregiver_id: string; is_active: boolean; revoked_at: Date | null }>(
        'SELECT * FROM portal_lookup_caregiver_contact($1, $2, $3)',
        [org.id, patient.id, caregiverPhone],
      );
      if (cgRes.rowCount === 0 || !cgRes.rows[0]!.is_active || cgRes.rows[0]!.revoked_at !== null) {
        return { status: 403, error: 'caregiver_not_authorized', message: 'Caregiver consent missing or revoked' };
      }
      caregiverContactId = cgRes.rows[0]!.caregiver_id;
    }

    return { status: 200, org, patient, caregiverContactId };
  });

  if (lookup.status !== 200) {
    return NextResponse.json(
      { error: { code: lookup.error, message: lookup.message } },
      { status: lookup.status, headers: NO_CACHE_HEADERS },
    );
  }

  const { org, patient, caregiverContactId } = lookup as {
    org: { id: string; slug: string; name: string; is_demo_fixture: boolean };
    patient: { id: string; demo_code: string | null; display_name: string; is_demo_fixture: boolean };
    caregiverContactId: string | null;
  };

  // 4. Verify OTP Challenge
  let otpVerified = false;
  // In genuine production mode (NODE_ENV === 'production'), fixed synthetic test OTPs are UNCONDITIONALLY rejected,
  // regardless of environment variables or fixture flags (SEC-NEG-21).
  // Fixed synthetic demo OTP is ONLY allowed in non-production environments (test / development) AND ONLY for designated demo fixtures.
  const isProduction = process.env.NODE_ENV === 'production';
  const isDemoAuthorized =
    !isProduction &&
    (patient.is_demo_fixture || org.is_demo_fixture) &&
    (otpCode === '246810' || otpCode === '123456');

  if (isDemoAuthorized) {
    otpVerified = true;
  } else {
    const challengeTarget = actorRole === 'caregiver' ? caregiverPhone! : patientExternalId;
    const challengeRes = await verifyPatientOtpChallenge({
      orgId: org.id,
      patientId: patient.id,
      identifierValue: challengeTarget,
      otpCode,
    });
    otpVerified = challengeRes.verified;
  }

  if (!otpVerified) {
    return NextResponse.json(
      { error: { code: 'invalid_credentials', message: 'Invalid or expired OTP verification code' } },
      { status: 401, headers: NO_CACHE_HEADERS },
    );
  }

  const grantedScopes = ['appointments', 'reminders', 'documents', 'preparation'];

  // 5. Create Authenticated Session
  const created = await createPatientPortalSession({
    orgId: org.id,
    patientId: patient.id,
    actorRole,
    caregiverContactId,
    grantedScopes,
    deviceLabel: deviceLabel ?? 'Patient Mobile App',
  });

  // 6. Record Audit Event
  try {
    await withPatientPortalContext(created.session, async (q) => {
      await appendAuditEvent(q, {
        orgId: org.id,
        actor: { userId: caregiverContactId ?? patient.id, role: actorRole },
        action: 'auth.login',
        entityKind: 'patient_portal_session',
        entityId: created.session.sessionId,
        outcome: 'success',
      });
    });
  } catch {
    /* non-fatal audit append */
  }

  return NextResponse.json(
    {
      sessionToken: created.token,
      token: created.token,
      expiresAt: created.session.expiresAt.toISOString(),
      hospitalId: org.id,
      patientId: patient.id,
      patientExternalId,
      actorRole,
      grantedScopes,
      organization: {
        id: org.id,
        slug: org.slug,
        name: org.name,
      },
      patient: {
        id: patient.id,
        displayName: patient.display_name,
        mrn: patient.demo_code ?? '',
      },
    },
    { status: 201, headers: NO_CACHE_HEADERS },
  );
}

export async function DELETE(request: Request) {
  const auth = await requirePatientPortalSession(request);
  if (!auth.ok) return auth.response;
  const { session } = auth;

  await revokePatientPortalSession(session.sessionId, session);

  try {
    await withPatientPortalContext(session, async (q) => {
      await appendAuditEvent(q, {
        orgId: session.orgId,
        actor: { userId: session.caregiverContactId ?? session.patientId, role: session.actorRole },
        action: 'auth.logout',
        entityKind: 'patient_portal_session',
        entityId: session.sessionId,
        outcome: 'success',
      });
    });
  } catch {
    /* non-fatal */
  }

  return NextResponse.json({ revoked: true, revokedAt: new Date().toISOString() }, { headers: NO_CACHE_HEADERS });
}

export async function GET(request: Request) {
  const auth = await requirePatientPortalSession(request);
  if (!auth.ok) return auth.response;
  const { session } = auth;

  return NextResponse.json(
    {
      session: {
        sessionId: session.sessionId,
        hospitalId: session.orgId,
        patientId: session.patientId,
        actorRole: session.actorRole,
        caregiverContactId: session.caregiverContactId,
        grantedScopes: session.grantedScopes,
        expiresAt: session.expiresAt.toISOString(),
      },
    },
    { headers: NO_CACHE_HEADERS },
  );
}
