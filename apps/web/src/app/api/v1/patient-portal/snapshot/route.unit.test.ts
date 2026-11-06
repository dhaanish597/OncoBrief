import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getPatientPortalSnapshot, type PatientPortalSnapshot } from '@oncobrief/db';
import { requirePatientPortalSession } from '@/lib/patient-session';
import { GET } from './route';

vi.mock('@oncobrief/db', () => ({ getPatientPortalSnapshot: vi.fn() }));
vi.mock('@/lib/patient-session', () => ({
  requirePatientPortalSession: vi.fn(),
  NO_CACHE_HEADERS: { 'Cache-Control': 'no-store' },
}));

const snapshot: PatientPortalSnapshot = {
  patient: {
    id: 'patient-1', displayName: 'Synthetic patient', demoCode: 'DEMO-001',
    mrn: null, stage: null, diagnosis: null, primaryLanguage: 'en-IN',
    primaryClinicianName: null,
  },
  readiness: null,
  documents: [{
    id: 'document-1', originalFilename: 'source.txt', documentType: null,
    documentDate: null, issuingFacility: null, pageCount: 1,
    clinicianStatus: 'uploaded', patientReviewStatus: null,
    reviewedAt: null, duplicateStatus: 'unique',
  }],
  appointments: [{
    id: 'appointment-1', scheduledStart: '2026-11-06T10:00:00Z',
    scheduledEnd: '2026-11-06T10:30:00Z', roomLabel: '',
    appointmentType: 'consultation', status: 'cancelled', clinicianName: null,
  }],
  timeline: [{
    id: 'timeline-1', factType: 'appointment', valueText: 'A normalized display value',
    displayDate: null, state: 'extracted', documentId: 'document-1',
    evidenceFactId: 'fact-1', verbatimQuote: 'Original documented statement',
    sourcePage: 3, sourceSpanId: 'span-3', sourceDocumentName: 'source.txt',
    documentVersion: 2, extractionMethod: 'ocr', extractorName: 'synthetic-test-extractor',
    extractorVersion: 'test-v1', extractedAt: '2026-11-06T10:00:00Z',
    reviewerId: null, reviewedAt: null,
  }, {
    id: 'timeline-2', factType: 'appointment', valueText: 'Imported value without source span',
    displayDate: null, state: 'conflicting', documentId: 'document-1',
    evidenceFactId: 'fact-2', verbatimQuote: null, sourcePage: null,
    sourceSpanId: null, sourceDocumentName: null, documentVersion: null,
    extractionMethod: null, extractorName: null, extractorVersion: null,
    extractedAt: null, reviewerId: null, reviewedAt: null,
  }], missingDocumentTasks: [], continuityMessages: [],
  caregivers: [], shareGrants: [], preparation: null,
};

beforeEach(() => {
  vi.mocked(getPatientPortalSnapshot).mockResolvedValue(snapshot);
  vi.mocked(requirePatientPortalSession).mockResolvedValue({
    ok: true,
    session: {
      sessionId: 'session-1', orgId: 'org-1', patientId: 'patient-1',
      actorRole: 'patient', caregiverContactId: null, grantedScopes: ['documents', 'appointments'],
      expiresAt: new Date('2026-11-07'), tokenHash: 'synthetic-hash',
    },
  });
});

describe('patient snapshot source fidelity', () => {
  it('does not invent identity, document metadata, verification, or appointment details', async () => {
    const response = await GET(new Request('http://localhost/api/v1/patient-portal/snapshot'));
    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    const body = await response.json();
    expect(body.patient.mrn).toBeNull();
    expect(body.documents[0]).toMatchObject({
      filename: 'source.txt', clinicianStatus: 'uploaded',
      mimeType: null, byteSize: null, sha256Hex: null, recordOrigin: null,
    });
    expect(body.appointments[0]).toMatchObject({
      clinicianName: null, department: '', tokenNumber: null, canConfirmAttendance: false,
    });
  });
});


describe('patient timeline provenance', () => {
  it('preserves actual evidence state, source quote, page, version, and extractor details', async () => {
    const response = await GET(new Request('http://localhost/api/v1/patient-portal/snapshot'));
    const body = await response.json();
    expect(body.timeline[0]).toMatchObject({
      title: 'A normalized display value', state: 'extracted', evidenceFactId: 'fact-1',
      sourceDocumentId: 'document-1', quote: 'Original documented statement',
      sourcePage: 3, sourceSpanId: 'span-3', sourceDocumentName: 'source.txt',
      documentVersion: 2, extractionMethod: 'ocr', extractorName: 'synthetic-test-extractor',
      extractorVersion: 'test-v1', extractedAt: '2026-11-06T10:00:00Z',
      reviewerId: null, reviewedAt: null,
    });
    expect(body.timeline[1]).toMatchObject({
      state: 'conflicting', quote: null, sourcePage: null, sourceSpanId: null,
      sourceDocumentName: null, documentVersion: null, extractionMethod: null,
      extractorName: null, extractorVersion: null, extractedAt: null,
      reviewerId: null, reviewedAt: null,
    });
  });
});
