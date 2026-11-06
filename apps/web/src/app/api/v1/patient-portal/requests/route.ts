import { NextResponse } from 'next/server';
import {
  withPatientPortalContext,
  appendAuditEvent,
} from '@oncobrief/db';
import { scanForBoundaryViolation } from '@oncobrief/domain';
import { requirePatientPortalSession, NO_CACHE_HEADERS } from '@/lib/patient-session';

export async function GET(request: Request) {
  const auth = await requirePatientPortalSession(request);
  if (!auth.ok) return auth.response;
  const { session } = auth;

  const result = await withPatientPortalContext(session, async (q) => {
    const res = await q.query<{
      id: string;
      title: string;
      detail: string | null;
      status: string;
      created_at: string;
    }>(
      `SELECT id, title, detail, status, created_at::text
       FROM admin_task
       WHERE org_id = $1 AND patient_id = $2
       ORDER BY created_at DESC
       LIMIT 50`,
      [session.orgId, session.patientId],
    );

    return {
      requests: res.rows.map((r) => ({
        id: r.id,
        title: r.title,
        detail: r.detail,
        status: r.status,
        createdAt: r.created_at,
      })),
    };
  });

  return NextResponse.json(result, { status: 200, headers: NO_CACHE_HEADERS });
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: NO_CACHE_HEADERS });
}

export async function POST(request: Request) {
  const auth = await requirePatientPortalSession(request);
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
    title,
    detail,
    category = 'administrative',
  } = body as {
    title?: string;
    detail?: string;
    category?: string;
  };

  if (!title || typeof title !== 'string' || !title.trim()) {
    return NextResponse.json(
      { error: { code: 'bad_request', message: 'title is required' } },
      { status: 400, headers: NO_CACHE_HEADERS },
    );
  }

  // 1. Clinical boundary scan
  const textToScan = `${title} ${detail ?? ''}`;
  const violations = scanForBoundaryViolation(textToScan);
  if (violations.length > 0) {
    return NextResponse.json(
      {
        error: {
          code: 'clinical_boundary_violation',
          message: 'Request text contains prohibited diagnostic or treatment terms',
          violations,
        },
      },
      { status: 422, headers: NO_CACHE_HEADERS },
    );
  }

  const result = await withPatientPortalContext(session, async (q) => {
    // 2. Rate limit check: max 10 open requests per patient
    const countRes = await q.query<{ count: string }>(
      `SELECT count(*)::text as count
       FROM admin_task
       WHERE org_id = $1 AND patient_id = $2 AND status = 'open'`,
      [session.orgId, session.patientId],
    );
    if (Number(countRes.rows[0]?.count ?? 0) >= 10) {
      return {
        status: 429,
        error: 'too_many_requests',
        message: 'Maximum of 10 open coordinator requests reached. Please wait for previous requests to be resolved.',
      };
    }

    // 3. Resolve staff user for created_by foreign key
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

    // 4. Resolve source document for task_must_have_source constraint
    const docRes = await q.query<{ id: string }>(
      `SELECT id FROM document WHERE org_id = $1 AND patient_id = $2 LIMIT 1`,
      [session.orgId, session.patientId],
    );
    const originDocumentId = docRes.rows[0]?.id;
    if (!originDocumentId) {
      return { status: 400, error: 'no_source_document', message: 'Patient has no record to anchor task source' };
    }

    // 5. Insert task
    const fullDetail = detail ? `[${category.toUpperCase()}] ${detail}` : `[${category.toUpperCase()}]`;
    const insRes = await q.query<{ id: string; created_at: string }>(
      `INSERT INTO admin_task
         (org_id, patient_id, title, detail, task_kind, status, priority, created_by,
          origin_kind, origin_document_id)
       VALUES ($1, $2, $3, $4, 'reconciliation', 'open', 'normal', $5, 'document', $6)
       RETURNING id, created_at::text`,
      [
        session.orgId,
        session.patientId,
        title.trim(),
        fullDetail,
        staffUserId,
        originDocumentId,
      ],
    );
    const taskId = insRes.rows[0]!.id;
    const createdAt = insRes.rows[0]!.created_at;

    // 6. Audit log
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
          title: title.trim(),
          category,
        },
      });
    } catch {
      /* non-fatal */
    }

    return {
      status: 201,
      requestId: taskId,
      title: title.trim(),
      statusText: 'open',
      createdAt,
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
      requestId: result.requestId,
      title: result.title,
      status: result.statusText,
      createdAt: result.createdAt,
    },
    { status: 201, headers: NO_CACHE_HEADERS },
  );
}
