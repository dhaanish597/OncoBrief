import { NextResponse } from 'next/server';
import {
  withPatientPortalContext,
  appendAuditEvent,
} from '@oncobrief/db';
import { requirePatientPortalSession, NO_CACHE_HEADERS } from '@/lib/patient-session';

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: NO_CACHE_HEADERS });
}

export async function POST(request: Request) {
  const auth = await requirePatientPortalSession(request, 'appointments');
  if (!auth.ok) return auth.response;
  const { session } = auth;

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
    appointmentId,
    action,
    note,
    preferredDateWindow,
  } = body as {
    appointmentId?: string;
    action?: 'confirm' | 'request_reschedule';
    note?: string;
    preferredDateWindow?: string;
  };

  if (!appointmentId || !action || !['confirm', 'request_reschedule'].includes(action)) {
    return NextResponse.json(
      { error: { code: 'bad_request', message: 'appointmentId and action (confirm | request_reschedule) are required' } },
      { status: 400, headers: NO_CACHE_HEADERS },
    );
  }

  const result = await withPatientPortalContext(session, async (q) => {
    // 1. Ownership & existence check (SEC-NEG-06 / IDOR guard)
    const apptRes = await q.query<{
      id: string;
      status: string;
      clinician_id: string;
    }>(
      `SELECT id, status, clinician_id
       FROM appointment
       WHERE id = $1 AND patient_id = $2 AND org_id = $3`,
      [appointmentId, session.patientId, session.orgId],
    );

    if (apptRes.rowCount === 0) {
      return { status: 404, error: 'not_found', message: 'Appointment not found' };
    }
    const appt = apptRes.rows[0]!;

    // Resolve a staff user for DB foreign key integrity on audit and history
    const staffRes = await q.query<{ user_id: string }>(
      `SELECT user_id FROM membership
       WHERE org_id = $1 AND role IN ('coordinator', 'org_admin', 'clinician')
       LIMIT 1`,
      [session.orgId],
    );
    const staffUserId = staffRes.rows[0]?.user_id ?? appt.clinician_id;

    if (action === 'confirm') {
      // 2. Transition appointment to confirmed if scheduled
      if (appt.status === 'scheduled') {
        await q.query(
          `UPDATE appointment
           SET status = 'confirmed', updated_by = $1, updated_at = now()
           WHERE id = $2 AND org_id = $3`,
          [staffUserId, appointmentId, session.orgId],
        );

        await q.query(
          `INSERT INTO appointment_status_history
             (org_id, appointment_id, from_status, to_status, actor_id, reason)
           VALUES ($1, $2, $3, 'confirmed', $4, $5)`,
          [
            session.orgId,
            appointmentId,
            appt.status,
            staffUserId,
            note ?? 'Confirmed by patient via mobile portal',
          ],
        );
      }

      // 3. Audit log
      try {
        await appendAuditEvent(q, {
          orgId: session.orgId,
          actor: { userId: null, role: session.actorRole },
          action: 'appointment.status_changed',
          entityKind: 'appointment',
          entityId: appointmentId,
          outcome: 'success',
          metadata: {
            patientId: session.patientId,
            caregiverContactId: session.caregiverContactId ?? null,
            fromStatus: appt.status,
            toStatus: 'confirmed',
            confirmedBy: session.actorRole,
          },
        });
      } catch {
        /* non-fatal audit */
      }

      return {
        status: 200 as const,
        appointmentId,
        appointmentStatus: 'confirmed',
        action: 'confirm' as const,
      };
    }

    // action === 'request_reschedule'
    // 4. Create reconciliation admin task for hospital coordinator
    const sourceDocRes = await q.query<{ id: string }>(
      'SELECT id FROM document WHERE org_id = $1 AND patient_id = $2 LIMIT 1',
      [session.orgId, session.patientId],
    );
    const originDocumentId = sourceDocRes.rows[0]?.id;
    if (!originDocumentId) {
      return { status: 400 as const, error: 'no_source_document', message: 'No patient record found for task linkage' };
    }

    const taskRes = await q.query<{ id: string }>(
      `INSERT INTO admin_task
         (org_id, patient_id, title, detail, task_kind, status, priority, created_by,
          origin_kind, origin_document_id)
       VALUES ($1, $2, $3, $4, 'reconciliation', 'open', 'normal', $5, 'document', $6)
       RETURNING id`,
      [
        session.orgId,
        session.patientId,
        'Patient requested appointment reschedule',
        `Preferred Window: ${preferredDateWindow ?? 'None provided'}. Reason: ${note ?? 'None provided'} (Appointment: ${appointmentId})`,
        staffUserId,
        originDocumentId,
      ],
    );
    const taskId = taskRes.rows[0]!.id;

    // 5. Audit log
    try {
      await appendAuditEvent(q, {
        orgId: session.orgId,
        actor: { userId: null, role: session.actorRole },
        action: 'task.created',
        entityKind: 'admin_task',
        entityId: taskId,
        outcome: 'success',
        metadata: {
          patientId: session.patientId,
          caregiverContactId: session.caregiverContactId ?? null,
          appointmentId,
          requestedWindow: preferredDateWindow ?? null,
        },
      });
    } catch {
      /* non-fatal audit */
    }

    return {
      status: 200 as const,
      appointmentId,
      taskId,
      action: 'request_reschedule' as const,
    };
  });

  if ('error' in result) {
    return NextResponse.json(
      { error: { code: result.error, message: result.message } },
      { status: result.status, headers: NO_CACHE_HEADERS },
    );
  }

  return NextResponse.json(
    {
      appointmentId: result.appointmentId,
      status: result.action === 'confirm' ? result.appointmentStatus : undefined,
      taskId: result.action === 'request_reschedule' ? result.taskId : undefined,
      action: result.action,
    },
    { status: 200, headers: NO_CACHE_HEADERS },
  );
}
