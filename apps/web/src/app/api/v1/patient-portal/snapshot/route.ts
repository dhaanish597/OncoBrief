import { NextResponse } from 'next/server';
import { getPatientPortalSnapshot } from '@oncobrief/db';
import { requirePatientPortalSession, NO_CACHE_HEADERS } from '@/lib/patient-session';

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: NO_CACHE_HEADERS });
}

export async function GET(request: Request) {
  const auth = await requirePatientPortalSession(request);
  if (!auth.ok) return auth.response;
  const { session } = auth;

  try {
    const raw = await getPatientPortalSnapshot(session);
    const snapshot = {
      patient: {
        id: raw.patient.id,
        displayName: raw.patient.displayName,
        demoCode: raw.patient.demoCode,
        mrn: raw.patient.mrn,
        stage: raw.patient.stage,
        diagnosis: raw.patient.diagnosis,
        primaryLanguage: raw.patient.primaryLanguage,
      },
      summary: {
        diagnosis: raw.patient.diagnosis ?? '',
        journeyStage: raw.patient.stage ?? '',
        readinessScore: raw.readiness
          ? { done: raw.readiness.satisfiedItems, total: raw.readiness.requiredItems }
          : { done: 0, total: 0 },
      },
      documents: (raw.documents ?? []).map((d) => ({
        id: d.id,
        filename: d.originalFilename,
        documentDate: d.documentDate,
        issuingFacility: d.issuingFacility,
        mimeType: null,
        byteSize: null,
        sha256Hex: null,
        clinicianStatus: d.clinicianStatus,
        patientReviewStatus: d.patientReviewStatus ?? 'unreviewed',
        recordOrigin: null,
      })),
      timeline: (raw.timeline ?? []).map((t) => ({
        id: t.id,
        title: t.valueText,
        date: t.displayDate,
        category: t.factType,
        sourceDocumentId: t.documentId,
        state: t.state,
        evidenceFactId: t.evidenceFactId,
        quote: t.verbatimQuote,
        sourcePage: t.sourcePage,
        sourceSpanId: t.sourceSpanId,
        sourceDocumentName: t.sourceDocumentName,
        documentVersion: t.documentVersion,
        extractionMethod: t.extractionMethod,
        extractorName: t.extractorName,
        extractorVersion: t.extractorVersion,
        extractedAt: t.extractedAt,
        reviewerId: t.reviewerId,
        reviewedAt: t.reviewedAt,
      })),
      appointments: (raw.appointments ?? []).map((a) => ({
        id: a.id,
        scheduledStart: a.scheduledStart,
        scheduledEnd: a.scheduledEnd,
        status: a.status,
        clinicianName: a.clinicianName,
        department: a.roomLabel,
        tokenNumber: null,
        canConfirmAttendance: ['scheduled', 'confirmed'].includes(a.status),
      })),
      continuityMessages: (raw.continuityMessages ?? []).map((m) => ({
        id: m.id,
        locale: m.locale,
        body: m.bodyRendered,
        approvedAt: m.approvedAt,
      })),
      tasks: raw.missingDocumentTasks.map((t) => ({
        id: t.id,
        title: t.title,
        detail: t.detail,
        dueOn: t.dueOn,
        status: t.status,
        priority: t.priority,
      })),
      missingDocumentTasks: raw.missingDocumentTasks.map((t) => ({
        id: t.id,
        title: t.title,
        detail: t.detail,
        dueOn: t.dueOn,
        status: t.status,
        priority: t.priority,
      })),
      caregivers: raw.caregivers ?? [],
      shareGrants: (raw.shareGrants ?? []).map((g) => ({
        id: g.id,
        recipientLabel: g.granteeLabel,
        expiresAt: g.expiresAt,
        sharedDocumentIds: g.documentIds,
        isRevoked: !!g.isRevoked,
      })),
      preparation: raw.preparation ?? null,
      lastSyncedAt: new Date().toISOString(),
    };
    return NextResponse.json(snapshot, { headers: NO_CACHE_HEADERS });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal Server Error';
    return NextResponse.json(
      { error: { code: 'snapshot_error', message } },
      { status: 500, headers: NO_CACHE_HEADERS },
    );
  }
}
