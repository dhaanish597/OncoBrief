import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ConnectedPatientRepository } from '../src/repository';
import type { PatientPortalApiClient } from '../src/api-client';
import type { DocumentRecord } from '../src/domain';

describe('MOB-013: Connected Records, Uploads, and Verification Badges', () => {
  it('enforces dual badge separation: patient review NEVER elevates clinician verification (REQ-MOB-017 / SEC-NEG-10)', async () => {
    const unverifiedDoc: DocumentRecord = {
      id: 'doc-uploaded-01',
      name: 'outside-biopsy.pdf',
      category: 'pathology',
      date: '2026-10-25',
      facility: 'City Diagnostics',
      mimeType: 'application/pdf',
      size: 1024,
      version: '1',
      extraction: 'unavailable',
      patientReviewed: false,
      clinicianVerified: false,
      addedAt: '2026-10-25T10:00:00.000Z',
    };

    let reviewCalledWithId: string | null = null;
    const mockClient = {
      async executeMutation(item: { action: { type: string; id?: string } }) {
        if (item.action.type === 'review') {
          reviewCalledWithId = item.action.id ?? null;
        }
        return { ok: true };
      },
    } as unknown as PatientPortalApiClient;

    const repo = new ConnectedPatientRepository({ client: mockClient });
    repo.state.documents = [unverifiedDoc];

    // Patient performs review
    repo.apply({ type: 'review', id: 'doc-uploaded-01' });

    // Invariant: patientReviewed is true, but clinicianVerified remains FALSE
    assert.equal(repo.state.documents[0]!.patientReviewed, true);
    assert.equal(repo.state.documents[0]!.clinicianVerified, false);

    await repo.flush();
    assert.equal(reviewCalledWithId, 'doc-uploaded-01');
  });

  it('records discrepancy flag with reason without altering underlying evidence facts (REQ-MOB-018)', async () => {
    let flagPayload: { id?: string; reason?: string } | null = null;
    const mockClient = {
      async executeMutation(item: { action: { type: string; id?: string; reason?: string } }) {
        if (item.action.type === 'flag') {
          flagPayload = { id: item.action.id, reason: item.action.reason };
        }
        return { ok: true };
      },
    } as unknown as PatientPortalApiClient;

    const repo = new ConnectedPatientRepository({ client: mockClient });
    repo.state.documents = [
      {
        id: 'doc-lab-01',
        name: 'blood-report.pdf',
        category: 'laboratory',
        date: '2026-10-20',
        facility: 'Metropolis Labs',
        mimeType: 'application/pdf',
        size: 2048,
        version: '1',
        extraction: 'fixture',
        patientReviewed: false,
        clinicianVerified: true,
        addedAt: '2026-10-20T10:00:00.000Z',
      },
    ];

    repo.apply({
      type: 'flag',
      id: 'doc-lab-01',
      reason: 'Sample collection date is listed as Oct 20, but sample was taken Oct 18.',
    });

    assert.equal(repo.state.flags.length, 1);
    assert.equal(repo.state.flags[0]!.documentId, 'doc-lab-01');
    assert.equal(repo.state.flags[0]!.reason, 'Sample collection date is listed as Oct 20, but sample was taken Oct 18.');
    // Clinician verification is preserved
    assert.equal(repo.state.documents[0]!.clinicianVerified, true);

    await repo.flush();
    assert.deepEqual(flagPayload, {
      id: 'doc-lab-01',
      reason: 'Sample collection date is listed as Oct 20, but sample was taken Oct 18.',
    });
  });

  it('surfaces missing-document tasks from clinician snapshot in connected state (REQ-MOB-019)', () => {
    const repo = new ConnectedPatientRepository();
    repo.hydrateSnapshot({
      patient: {
        id: 'p-1',
        mrn: 'MRN-001',
        displayName: 'Meenakshi Sundaram',
      },
      summary: {
        diagnosis: 'Breast Cancer',
        journeyStage: 'Pre-consultation',
        readinessScore: { done: 2, total: 4 },
      },
      documents: [],
      timeline: [],
      appointments: [],
      continuityMessages: [],
      caregivers: [],
      shareGrants: [],
      preparation: {
        questions: [],
        symptomNotes: '',
        companionName: 'Anand',
        packSelectedDocumentIds: [],
      },
      tasks: [
        {
          id: 'task-missing-1',
          title: 'Histopathology Slide Report Needed',
          category: 'missing_document',
          status: 'open',
          dueDate: '2026-11-05',
          description: 'Outside biopsy slides from Apollo Greams Road',
        },
      ],
      lastSyncedAt: '2026-11-01T12:00:00.000Z',
    });

    const missingTasks = (repo.state.tasks ?? []).filter((t) => t.category === 'missing_document');
    assert.equal(missingTasks.length, 1);
    assert.equal(missingTasks[0]!.title, 'Histopathology Slide Report Needed');
    assert.equal(missingTasks[0]!.dueDate, '2026-11-05');
  });
});
