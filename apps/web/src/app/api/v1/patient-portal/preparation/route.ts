import { NextResponse } from 'next/server';
import {
  upsertPatientPreparationState,
  withPatientPortalContext,
  appendAuditEvent,
} from '@oncobrief/db';
import { scanForBoundaryViolation } from '@oncobrief/domain';
import { requirePatientPortalSession, NO_CACHE_HEADERS } from '@/lib/patient-session';

export async function PUT(request: Request) {
  const auth = await requirePatientPortalSession(request, 'preparation');
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
    checks = [],
    questions = [],
    symptomNotes = '',
    companionName,
    packSelectedDocumentIds = [],
    appointmentId,
  } = body as {
    checks?: unknown[];
    questions?: Array<{ id?: string; text?: string }>;
    symptomNotes?: string;
    companionName?: string;
    packSelectedDocumentIds?: string[];
    appointmentId?: string | null;
  };

  // 1. Clinical boundary violation checks (SEC-NEG-15)
  // Patient symptom notes and questions must not contain prohibited diagnostic/recommendation concepts
  const violations = [
    ...scanForBoundaryViolation(String(symptomNotes ?? '')),
    ...questions.flatMap((q) => scanForBoundaryViolation(String(q.text ?? ''))),
  ];

  if (violations.length > 0) {
    return NextResponse.json(
      {
        error: {
          code: 'clinical_boundary_violation',
          message: 'Preparation contains prohibited clinical concepts (prognosis, risk scoring, or recommendation)',
          violations,
        },
      },
      { status: 422, headers: NO_CACHE_HEADERS },
    );
  }

  const result = await withPatientPortalContext(session, async (q) => {
    const updated = await upsertPatientPreparationState(q, {
      orgId: session.orgId,
      patientId: session.patientId,
      appointmentId,
      checks: Array.isArray(checks) ? checks : [],
      questions: Array.isArray(questions) ? questions : [],
      symptomNotes: String(symptomNotes ?? ''),
      companionName: companionName ? String(companionName) : undefined,
      packSelectedDocumentIds: Array.isArray(packSelectedDocumentIds) ? packSelectedDocumentIds : [],
    });

    try {
      await appendAuditEvent(q, {
        orgId: session.orgId,
        actor: { userId: session.caregiverContactId ?? session.patientId, role: session.actorRole },
        action: 'patient.updated', // audit action
        entityKind: 'patient_preparation_state',
        entityId: updated.id,
        outcome: 'success',
        metadata: { checksCount: checks.length, questionsCount: questions.length },
      });
    } catch {
      /* non-fatal */
    }

    return updated;
  });

  return NextResponse.json(
    { success: true, id: result.id, updatedAt: result.updatedAt },
    { status: 200, headers: NO_CACHE_HEADERS },
  );
}
