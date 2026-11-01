import { NextResponse } from 'next/server';
import {
  getDocument,
  createPatientDiscrepancyFlag,
  recordPatientDocumentReview,
  withPatientPortalContext,
  appendAuditEvent,
} from '@oncobrief/db';
import { scanForBoundaryViolation } from '@oncobrief/domain';
import { requirePatientPortalSession, NO_CACHE_HEADERS } from '@/lib/patient-session';

export async function POST(request: Request) {
  const auth = await requirePatientPortalSession(request, 'documents');
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
    documentId,
    fieldName = 'other',
    patientReason,
  } = body as {
    documentId?: string;
    fieldName?: 'date' | 'facility' | 'summary' | 'lab_value' | 'missing_page' | 'other';
    patientReason?: string;
  };

  if (!documentId || !patientReason || typeof patientReason !== 'string') {
    return NextResponse.json(
      { error: { code: 'bad_request', message: 'documentId and patientReason are required' } },
      { status: 400, headers: NO_CACHE_HEADERS },
    );
  }

  // 1. Clinical boundary violation check
  const boundaryViolations = scanForBoundaryViolation(patientReason);
  if (boundaryViolations.length > 0) {
    return NextResponse.json(
      {
        error: {
          code: 'clinical_boundary_violation',
          message: 'Flag note contains prohibited diagnostic, risk scoring, or treatment concepts',
          violations: boundaryViolations,
        },
      },
      { status: 422, headers: NO_CACHE_HEADERS },
    );
  }

  const result = await withPatientPortalContext(session, async (q) => {
    // 2. Ownership check: document must exist for this patient (SEC-NEG-07)
    const doc = await getDocument(q, session.patientId, documentId);
    if (!doc) {
      return { status: 404, error: 'not_found', message: 'Document not found' };
    }

    // 3. Resolve staff user for admin_task.created_by
    const staffRes = await q.query<{ user_id: string }>(
      `SELECT user_id FROM membership
       WHERE org_id = $1 AND role IN ('coordinator', 'org_admin', 'clinician')
       LIMIT 1`,
      [session.orgId],
    );
    const staffUserId = staffRes.rows[0]?.user_id;
    if (!staffUserId) {
      return { status: 500, error: 'staff_missing', message: 'No staff user configured for task assignment' };
    }

    // 4. Create reconciliation task
    const taskRes = await q.query<{ id: string }>(
      `INSERT INTO admin_task
         (org_id, patient_id, title, detail, task_kind, status,
          origin_kind, origin_document_id, priority, created_by)
       VALUES ($1, $2, $3, $4, 'reconciliation', 'open', 'document', $5, 'high', $6)
       RETURNING id`,
      [
        session.orgId,
        session.patientId,
        'Patient flagged discrepancy on document: ' + (doc.originalFilename ?? 'Document'),
        `Field: ${fieldName}. Reason: ${patientReason}`,
        documentId,
        staffUserId,
      ],
    );
    const taskId = taskRes.rows[0]!.id;

    // 5. Create discrepancy flag
    const flag = await createPatientDiscrepancyFlag(q, {
      orgId: session.orgId,
      patientId: session.patientId,
      documentId,
      fieldName,
      patientReason,
      linkedTaskId: taskId,
    });

    // 6. Update review status to flagged
    await recordPatientDocumentReview(
      q,
      {
        orgId: session.orgId,
        patientId: session.patientId,
        documentId,
        reviewStatus: 'discrepancy_flagged',
        reviewedByRole: session.actorRole,
        note: patientReason,
      },
    );

    // 7. Audit log
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
          flagId: flag.id,
          documentId,
          reason: patientReason,
        },
      });
    } catch {
      /* non-fatal */
    }

    return {
      status: 201,
      flagId: flag.id,
      documentId,
      taskId,
      statusStr: flag.status,
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
      flagId: result.flagId,
      documentId: result.documentId,
      taskId: result.taskId,
      status: result.statusStr,
    },
    { status: 201, headers: NO_CACHE_HEADERS },
  );
}
