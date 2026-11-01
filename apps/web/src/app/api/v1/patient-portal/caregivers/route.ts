import { NextResponse } from 'next/server';
import {
  withPatientPortalContext,
  appendAuditEvent,
} from '@oncobrief/db';
import { requirePatientPortalSession, NO_CACHE_HEADERS } from '@/lib/patient-session';

export async function GET(request: Request) {
  const auth = await requirePatientPortalSession(request);
  if (!auth.ok) return auth.response;
  const { session } = auth;

  const result = await withPatientPortalContext(session, async (q) => {
    const res = await q.query<{
      id: string;
      full_name: string;
      relationship: string;
      phone_number: string;
      preferred_locale: string;
      sync_reminders: boolean;
      is_active: boolean;
    }>(
      `SELECT id, full_name, relationship, phone_number, preferred_locale, sync_reminders, is_active
       FROM caregiver_contact
       WHERE org_id = $1 AND patient_id = $2 AND is_active = true
       ORDER BY consent_recorded_at DESC`,
      [session.orgId, session.patientId],
    );

    const caregivers = res.rows.map((r) => ({
      id: r.id,
      fullName: r.full_name,
      relationship: r.relationship,
      phoneNumber: r.phone_number,
      preferredLocale: r.preferred_locale,
      syncReminders: r.sync_reminders,
      isActive: r.is_active,
      scopes: r.sync_reminders ? ['appointments', 'reminders'] : ['appointments'],
    }));

    return { caregivers };
  });

  return NextResponse.json(result, { status: 200, headers: NO_CACHE_HEADERS });
}

export async function POST(request: Request) {
  const auth = await requirePatientPortalSession(request);
  if (!auth.ok) return auth.response;
  const { session } = auth;

  // SEC-NEG-13: Caregiver session cannot register or mutate caregivers
  if (session.actorRole !== 'patient') {
    return NextResponse.json(
      { error: { code: 'patient_role_required', message: 'Only patients can register or modify caregivers' } },
      { status: 403, headers: NO_CACHE_HEADERS },
    );
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json(
      { error: { code: 'bad_request', message: 'Invalid JSON body' } },
      { status: 400, headers: NO_CACHE_HEADERS },
    );
  }

  const {
    fullName,
    relationship,
    phoneNumber,
    preferredLocale = 'ta-IN',
    syncReminders = true,
  } = body as {
    fullName?: string;
    relationship?: string;
    phoneNumber?: string;
    preferredLocale?: string;
    syncReminders?: boolean;
  };

  if (!fullName || !relationship || !phoneNumber) {
    return NextResponse.json(
      { error: { code: 'bad_request', message: 'fullName, relationship, and phoneNumber are required' } },
      { status: 400, headers: NO_CACHE_HEADERS },
    );
  }

  const result = await withPatientPortalContext(session, async (q) => {
    // Resolve staff user for foreign key integrity on consent_recorded_by
    const staffRes = await q.query<{ user_id: string }>(
      `SELECT user_id FROM membership
       WHERE org_id = $1 AND role IN ('coordinator', 'org_admin', 'clinician')
       LIMIT 1`,
      [session.orgId],
    );
    const staffUserId = staffRes.rows[0]?.user_id;
    if (!staffUserId) {
      return { status: 500, error: 'staff_missing', message: 'No staff user configured' };
    }

    const insRes = await q.query<{
      id: string;
      full_name: string;
      relationship: string;
      phone_number: string;
      preferred_locale: string;
      sync_reminders: boolean;
      is_active: boolean;
    }>(
      `INSERT INTO caregiver_contact
         (org_id, patient_id, full_name, relationship, phone_number, preferred_locale,
          prefers_voice_note, sync_reminders, consent_recorded_by, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, true, $7, $8, true)
       RETURNING id, full_name, relationship, phone_number, preferred_locale, sync_reminders, is_active`,
      [
        session.orgId,
        session.patientId,
        fullName.trim(),
        relationship.trim(),
        phoneNumber.trim(),
        preferredLocale.trim(),
        syncReminders,
        staffUserId,
      ],
    );
    const row = insRes.rows[0]!;

    // Audit log
    try {
      await appendAuditEvent(q, {
        orgId: session.orgId,
        actor: { userId: null, role: session.actorRole },
        action: 'caregiver.registered',
        entityKind: 'caregiver_contact',
        entityId: row.id,
        outcome: 'success',
        metadata: {
          patientId: session.patientId,
          caregiverId: row.id,
          relationship: row.relationship,
        },
      });
    } catch {
      /* non-fatal */
    }

    return {
      status: 201,
      caregiver: {
        id: row.id,
        fullName: row.full_name,
        relationship: row.relationship,
        phoneNumber: row.phone_number,
        preferredLocale: row.preferred_locale,
        syncReminders: row.sync_reminders,
        scopes: row.sync_reminders ? ['appointments', 'reminders'] : ['appointments'],
      },
    };
  });

  if ('error' in result) {
    return NextResponse.json(
      { error: { code: result.error, message: result.message } },
      { status: result.status, headers: NO_CACHE_HEADERS },
    );
  }

  return NextResponse.json(result, { status: 201, headers: NO_CACHE_HEADERS });
}

export async function DELETE(request: Request) {
  const auth = await requirePatientPortalSession(request);
  if (!auth.ok) return auth.response;
  const { session } = auth;

  // SEC-NEG-13: Caregiver cannot revoke caregivers
  if (session.actorRole !== 'patient') {
    return NextResponse.json(
      { error: { code: 'patient_role_required', message: 'Only patients can revoke caregivers' } },
      { status: 403, headers: NO_CACHE_HEADERS },
    );
  }

  const url = new URL(request.url);
  const caregiverId = url.searchParams.get('id') || url.searchParams.get('caregiverId');

  if (!caregiverId) {
    return NextResponse.json(
      { error: { code: 'bad_request', message: 'id or caregiverId query parameter is required' } },
      { status: 400, headers: NO_CACHE_HEADERS },
    );
  }

  const result = await withPatientPortalContext(session, async (q) => {
    // 1. Ownership check (SEC-NEG-06)
    const checkRes = await q.query<{ id: string }>(
      'SELECT id FROM caregiver_contact WHERE id = $1 AND patient_id = $2 AND org_id = $3',
      [caregiverId, session.patientId, session.orgId],
    );
    if (checkRes.rowCount === 0) {
      return { status: 404, error: 'not_found', message: 'Caregiver not found' };
    }

    // 2. SEC-NEG-13: Invalidate active sessions immediately
    await q.query(
      `UPDATE patient_portal_session
       SET revoked_at = now()
       WHERE org_id = $1 AND caregiver_contact_id = $2 AND revoked_at IS NULL`,
      [session.orgId, caregiverId],
    );

    // 3. Mark caregiver revoked
    await q.query(
      `UPDATE caregiver_contact
       SET is_active = false, sync_reminders = false, revoked_at = now()
       WHERE id = $1 AND org_id = $2 AND patient_id = $3`,
      [caregiverId, session.orgId, session.patientId],
    );

    // 4. Audit log
    try {
      await appendAuditEvent(q, {
        orgId: session.orgId,
        actor: { userId: null, role: session.actorRole },
        action: 'caregiver.revoked',
        entityKind: 'caregiver_contact',
        entityId: caregiverId,
        outcome: 'success',
        metadata: {
          patientId: session.patientId,
          caregiverId,
        },
      });
    } catch {
      /* non-fatal */
    }

    return {
      status: 200,
      caregiverId,
      revoked: true,
    };
  });

  if ('error' in result) {
    return NextResponse.json(
      { error: { code: result.error, message: result.message } },
      { status: result.status, headers: NO_CACHE_HEADERS },
    );
  }

  return NextResponse.json(result, { status: 200, headers: NO_CACHE_HEADERS });
}
