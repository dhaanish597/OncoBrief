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
        mrn: raw.patient.mrn ?? raw.patient.demoCode ?? 'N/A',
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
      documents: (raw.documents ?? []).map((d: any) => ({
        id: d.id,
        filename: d.originalFilename ?? d.filename ?? 'Document',
        documentDate: d.documentDate,
        issuingFacility: d.issuingFacility,
        mimeType: d.mimeType ?? 'application/pdf',
        byteSize: d.byteSize ?? 1024,
        sha256Hex: d.sha256Hex ?? '',
        clinicianStatus: d.clinicianStatus ?? 'verified',
        patientReviewStatus: d.patientReviewStatus ?? 'unreviewed',
        recordOrigin: d.recordOrigin ?? 'hospital',
      })),
      timeline: (raw.timeline ?? []).map((t: any) => ({
        id: t.id,
        title: t.valueText ?? t.title ?? '',
        date: t.displayDate ?? t.date ?? '',
        category: t.factType ?? t.category ?? 'stage',
        sourceDocumentId: t.documentId ?? t.sourceDocumentId ?? '',
        quote: t.valueText ?? t.quote ?? '',
      })),
      appointments: (raw.appointments ?? []).map((a: any) => ({
        id: a.id,
        scheduledStart: a.scheduledStart,
        scheduledEnd: a.scheduledEnd,
        status: a.status,
        clinicianName: a.clinicianName ?? 'Oncologist',
        department: a.roomLabel ?? a.department ?? 'Medical Oncology OPD',
        tokenNumber: a.tokenNumber ?? 'ONC-14',
        canConfirmAttendance: true,
      })),
      continuityMessages: (raw.continuityMessages ?? []).map((m: any) => ({
        id: m.id,
        locale: m.locale,
        body: m.bodyRendered ?? m.body ?? '',
        approvedAt: m.approvedAt,
      })),
      tasks: (raw.missingDocumentTasks ?? (raw as any).tasks ?? []).map((t: any) => ({
        id: t.id,
        title: t.title,
        detail: t.detail,
        dueOn: t.dueOn,
        status: t.status,
        priority: t.priority,
      })),
      missingDocumentTasks: (raw.missingDocumentTasks ?? (raw as any).tasks ?? []).map((t: any) => ({
        id: t.id,
        title: t.title,
        detail: t.detail,
        dueOn: t.dueOn,
        status: t.status,
        priority: t.priority,
      })),
      caregivers: raw.caregivers ?? [],
      shareGrants: (raw.shareGrants ?? []).map((g: any) => ({
        id: g.id,
        recipientLabel: g.recipientLabel ?? g.granteeLabel ?? 'Recipient',
        expiresAt: g.expiresAt,
        sharedDocumentIds: g.sharedDocumentIds ?? g.documentIds ?? [],
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
