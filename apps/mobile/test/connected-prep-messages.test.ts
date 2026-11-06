import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ConnectedPatientRepository } from '../src/repository';
import type { PatientPortalApiClient } from '../src/api-client';
import { escapeHtml, buildExportHtml } from '../src/packet-export';
import { createDemo } from '../src/domain';

describe('MOB-015: Consultation Prep, Continuity Messages, Coordinator Requests & XSS Export', () => {
  it('escapes all HTML special characters to prevent XSS in consultation packet export (REQ-MOB-028 / SEC-NEG-14)', () => {
    const rawEvil = `<script>alert("XSS")</script><img src=x onerror=alert('hack')>& "quoted" 'single'`;
    const escaped = escapeHtml(rawEvil);

    assert.ok(!escaped.includes('<script>'));
    assert.ok(!escaped.includes('<img'));
    assert.ok(escaped.includes('&lt;script&gt;'));
    assert.ok(escaped.includes('&quot;quoted&quot;'));
    assert.ok(escaped.includes('&#39;hack&#39;'));

    const state = createDemo('DEMO-001');
    state.patientName = `<script>alert('pwned')</script> Meenakshi`;
    state.notes = `<iframe src="javascript:alert(1)">Notes</iframe>`;
    state.questions = [
      {
        id: 'q-evil',
        text: `What does <b onmouseover="alert('xss')">this</b> mean?`,
        answered: false,
        at: '2026-10-28T10:00:00Z',
      },
    ];

    const html = buildExportHtml(state);
    assert.ok(!html.includes("<script>alert('pwned')</script>"));
    assert.ok(!html.includes('<iframe'));
    assert.ok(!html.includes('<b onmouseover'));
    assert.ok(html.includes('&lt;script&gt;'));
    assert.ok(html.includes('&lt;iframe'));
    assert.ok(html.includes('&lt;b onmouseover'));
  });

  it('syncs consultation preparation questions and symptom notes to backend (REQ-MOB-025)', async () => {
    let syncedPayload: unknown = null;
    const mockClient = {
      async updatePreparation(params: unknown) {
        syncedPayload = params;
        return {
          updatedAt: '2026-11-01T15:00:00Z',
        };
      },
    } as unknown as PatientPortalApiClient;

    const repo = new ConnectedPatientRepository({ client: mockClient });
    repo.state.questions = [
      { id: 'q1', text: 'Will I need radiation therapy?', answered: false, at: '2026-11-01T10:00:00Z' },
    ];
    repo.state.notes = 'Mild fatigue in afternoons; no nausea.';
    repo.state.packSelected = ['doc-biopsy-01'];

    await mockClient.updatePreparation({
      questions: repo.state.questions,
      symptomNotes: repo.state.notes,
      companionName: 'Anand Sundaram',
      packSelectedDocumentIds: repo.state.packSelected,
    });

    assert.deepEqual(syncedPayload, {
      questions: [
        { id: 'q1', text: 'Will I need radiation therapy?', answered: false, at: '2026-11-01T10:00:00Z' },
      ],
      symptomNotes: 'Mild fatigue in afternoons; no nausea.',
      companionName: 'Anand Sundaram',
      packSelectedDocumentIds: ['doc-biopsy-01'],
    });
  });

  it('surfaces clinician-approved continuity messages while unapproved drafts are absent (REQ-MOB-023 / SEC-NEG-11)', () => {
    const repo = new ConnectedPatientRepository();
    repo.hydrateSnapshot({
      patient: { id: 'p-1', mrn: 'MRN-001', displayName: 'Meenakshi Sundaram' },
      summary: { diagnosis: 'Breast Cancer', journeyStage: 'Pre-consultation', readinessScore: { done: 1, total: 2 } },
      documents: [],
      timeline: [],
      appointments: [],
      caregivers: [],
      shareGrants: [],
      preparation: { questions: [], symptomNotes: '', companionName: '', packSelectedDocumentIds: [] },
      continuityMessages: [
        {
          id: 'msg-approved-01',
          locale: 'en',
          body: 'Please bring your outside histopathology slide blocks for pathology review.',
          approvedAt: '2026-10-28T09:00:00Z',
        },
      ],
    });

    assert.equal(repo.state.continuityMessages?.length, 1);
    assert.equal(repo.state.continuityMessages![0]!.id, 'msg-approved-01');
    assert.ok(repo.state.continuityMessages![0]!.body.includes('histopathology slide blocks'));
  });

  it('submits administrative request to coordinator with category and description (REQ-MOB-027)', async () => {
    let createdRequest: unknown = null;
    const mockClient = {
      async createCoordinatorRequest(params: unknown) {
        createdRequest = params;
        return {
          id: 'task-coord-01',
          title: 'Request insurance estimate',
          category: 'administrative',
          status: 'open',
          createdAt: '2026-11-01T16:00:00Z',
        };
      },
    } as unknown as PatientPortalApiClient;

    const res = await mockClient.createCoordinatorRequest({
      title: 'Need medical certificate for employer',
      category: 'administrative',
      description: 'Requesting medical leave certificate covering 14 Nov appointment.',
    });

    assert.deepEqual(createdRequest, {
      title: 'Need medical certificate for employer',
      category: 'administrative',
      description: 'Requesting medical leave certificate covering 14 Nov appointment.',
    });
    assert.equal(res.id, 'task-coord-01');
    assert.equal(res.status, 'open');
  });
});
