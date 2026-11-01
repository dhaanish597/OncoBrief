import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ConnectedPatientRepository } from '../src/repository';
import type { PatientPortalApiClient } from '../src/api-client';

describe('MOB-012: ConnectedPatientRepository', () => {
  it('initializes in disconnected unauthenticated state', () => {
    const repo = new ConnectedPatientRepository();
    assert.equal(repo.mode, 'connected');
    assert.equal(repo.isAuthenticated, false);
    assert.equal(repo.state.mode, 'connected');
    assert.equal(repo.state.patientName, '');
    assert.equal(repo.state.documents.length, 0);
  });

  it('hydrates patient snapshot on successful sign-in', async () => {
    const mockClient = {
      async createSession() {
        return {
          token: 'sess_test_123',
          patient: {
            id: 'pat-1',
            displayName: 'Meenakshi Sundaram',
            mrn: 'MRN-2026-001',
          },
          organization: { id: 'org-1', slug: 'rci', name: 'Regional Cancer Institute' },
          actorRole: 'patient',
          grantedScopes: ['appointments', 'documents', 'reminders', 'preparation'],
        };
      },
      async getSnapshot() {
        return {
          patient: {
            id: 'pat-1',
            displayName: 'Meenakshi Sundaram',
            mrn: 'MRN-2026-001',
            dateOfBirth: '1968-05-12',
          },
          summary: {
            diagnosis: 'Invasive Ductal Carcinoma',
            journeyStage: 'Neoadjuvant Paclitaxel Cycle 3',
            readinessScore: { done: 3, total: 4 },
          },
          documents: [
            {
              id: 'doc-1',
              filename: 'referral-letter.pdf',
              documentDate: '2026-01-14',
              issuingFacility: 'District Hospital Tirunelveli',
              mimeType: 'application/pdf',
              byteSize: 1024,
              sha256Hex: 'abcd1234',
              clinicianStatus: 'verified',
              patientReviewStatus: 'confirmed_by_patient',
              recordOrigin: 'clinical_upload',
            },
          ],
          timeline: [
            {
              id: 'ev-1',
              title: 'Initial Biopsy',
              date: '2026-01-14',
              category: 'pathology',
              sourceDocumentId: 'doc-1',
              quote: 'Invasive ductal carcinoma grade 2',
            },
          ],
          appointments: [],
          continuityMessages: [],
          preparation: {
            questions: [],
            symptomNotes: '',
            companionName: '',
            packSelectedDocumentIds: [],
          },
          caregivers: [],
          shareGrants: [],
        };
      },
    } as unknown as PatientPortalApiClient;

    const repo = new ConnectedPatientRepository({ client: mockClient });
    await repo.signIn({
      hospitalSlug: 'rci',
      identifier: 'DEMO-001',
      otp: '123456',
    });

    assert.equal(repo.isAuthenticated, true);
    assert.equal(repo.state.patientName, 'Meenakshi Sundaram');
    assert.equal(repo.state.mrn, 'MRN-2026-001');
    assert.equal(repo.state.diagnosis, 'Invasive Ductal Carcinoma');
    assert.equal(repo.state.documents.length, 1);
    assert.equal(repo.state.documents[0]!.clinicianVerified, true);
    assert.equal(repo.state.documents[0]!.patientReviewed, true);
  });

  it('clears all sensitive patient data on signOut() (prevent cross-patient data bleed)', async () => {
    const mockClient = {
      async revokeSession() {
        return { ok: true };
      },
    } as unknown as PatientPortalApiClient;

    const repo = new ConnectedPatientRepository({ client: mockClient });
    repo.state.patientName = 'Sensitive Patient Data';
    repo.state.mrn = 'SENSITIVE-MRN';
    repo.state.documents = [{ id: 'doc-1', name: 'Private Record' } as never];
    (repo as { sessionToken?: string | null }).sessionToken = 'token_secret';

    await repo.signOut();

    assert.equal(repo.isAuthenticated, false);
    assert.equal(repo.state.patientName, '');
    assert.equal(repo.state.mrn, '');
    assert.equal(repo.state.documents.length, 0);
    assert.equal((repo as { sessionToken?: string | null }).sessionToken, null);
  });

  it('queues actions in sync queue and applies optimistic state', async () => {
    const mockClient = {
      async executeMutation() {
        return { ok: true };
      },
    } as unknown as PatientPortalApiClient;

    const repo = new ConnectedPatientRepository({ client: mockClient });
    repo.state.documents = [
      {
        id: 'doc-1',
        name: 'test.pdf',
        patientReviewed: false,
        clinicianVerified: false,
      } as never,
    ];

    repo.apply({ type: 'review', id: 'doc-1' });

    // Optimistic state
    assert.equal(repo.state.documents[0]!.patientReviewed, true);
    // Verified status remains FALSE (patient cannot elevate clinician verification)
    assert.equal(repo.state.documents[0]!.clinicianVerified, false);
  });

  it('rejects invalid or corrupted responses without crashing', async () => {
    const mockClient = {
      async getSnapshot() {
        throw new Error('corrupted_json');
      },
    } as unknown as PatientPortalApiClient;

    const repo = new ConnectedPatientRepository({ client: mockClient });
    await assert.rejects(async () => {
      await repo.refreshSnapshot();
    }, /corrupted_json/);
    assert.equal(repo.error, 'network');
  });
});
