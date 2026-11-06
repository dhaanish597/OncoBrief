import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ConnectedPatientRepository } from '../src/repository';
import type { PatientPortalSnapshotResponse } from '../src/api-client';

test('connected snapshot preserves unavailable document metadata and handles undated evidence', () => {
  const snapshot: PatientPortalSnapshotResponse = {
    patient: { id: 'p1', displayName: 'Synthetic Patient', mrn: null },
    summary: { diagnosis: '', journeyStage: '', readinessScore: { done: 0, total: 0 } },
    documents: [{ id: 'd1', filename: 'record', documentDate: null, issuingFacility: null,
      mimeType: null, byteSize: null, sha256Hex: null, recordOrigin: null,
      clinicianStatus: 'uploaded', patientReviewStatus: 'unreviewed' }],
    timeline: [{ id: 'e1', title: 'Documented fact', date: null, category: 'note', sourceDocumentId: 'd1', quote: 'Documented fact' }],
    appointments: [{ id: 'a1', scheduledStart: '2026-11-06T10:00:00Z', scheduledEnd: '2026-11-06T10:30:00Z',
      status: 'scheduled', clinicianName: null, department: null, tokenNumber: null, canConfirmAttendance: true }],
    continuityMessages: [], caregivers: [], shareGrants: [],
  };
  const repo = new ConnectedPatientRepository();
  repo.hydrateSnapshot(snapshot);
  assert.equal(repo.state.documents[0]?.mimeType, null);
  assert.equal(repo.state.documents[0]?.size, null);
  assert.equal(repo.state.documents[0]?.addedAt, null);
  assert.equal(repo.state.documents[0]?.category, 'other');
  assert.equal(repo.state.ledger[0]?.date, '');
  assert.equal(repo.state.mrn, '');
  assert.equal(repo.state.appointments?.[0]?.clinicianName, null);
  assert.equal(repo.state.appointments?.[0]?.department, null);
});

test('connected timeline retains real provenance and never promotes unverified or conflicting facts', () => {
  const snapshot: PatientPortalSnapshotResponse = {
    patient: { id: 'p1', displayName: 'Synthetic Patient', mrn: null },
    summary: { diagnosis: '', journeyStage: '', readinessScore: { done: 0, total: 0 } },
    documents: [], appointments: [], continuityMessages: [], caregivers: [], shareGrants: [],
    timeline: ['extracted', 'conflicting', 'verified', 'corrected', 'rejected', 'superseded'].map((state) => ({
      id: state, evidenceFactId: `fact-${state}`, state, title: 'Structured value', date: null,
      category: 'note', sourceDocumentId: 'd1', quote: 'Actual verbatim source text',
      sourcePage: 3, sourceSpanId: 'span-1', documentVersion: 4,
      extractionMethod: 'ocr', extractorName: 'source-ocr', extractorVersion: '2',
      extractedAt: '2026-11-05T10:00:00Z', reviewerId: 'reviewer-1', reviewedAt: '2026-11-06T10:00:00Z',
      sourceDocumentName: 'Source report',
    })),
  };
  const repo = new ConnectedPatientRepository();
  repo.hydrateSnapshot(snapshot);
  assert.equal(repo.state.ledger.find((e) => e.id === 'extracted')?.status, 'extracted');
  assert.equal(repo.state.ledger.find((e) => e.id === 'conflicting')?.status, 'conflicting');
  assert.equal(repo.state.ledger.find((e) => e.id === 'verified')?.status, 'clinician-confirmed');
  assert.equal(repo.state.ledger.find((e) => e.id === 'corrected')?.status, 'clinician-confirmed');
  assert.equal(repo.state.ledger.find((e) => e.id === 'rejected'), undefined);
  assert.equal(repo.state.ledger.find((e) => e.id === 'superseded'), undefined);
  const source = repo.state.ledger[0]!.source;
  assert.equal(source.quote, 'Actual verbatim source text');
  assert.equal(source.page, 3);
  assert.equal(source.version, '4');
  assert.equal(source.method, 'ocr');
  assert.equal(source.evidenceFactId, 'fact-extracted');
  assert.equal(source.spanId, 'span-1');
  assert.equal(source.extractorName, 'source-ocr');
  assert.equal(source.extractorVersion, '2');
  assert.equal(source.extractedAt, '2026-11-05T10:00:00Z');
  assert.equal(source.documentName, 'Source report');
  assert.equal(source.reviewer, 'reviewer-1');
  assert.equal(source.reviewedAt, '2026-11-06T10:00:00Z');
});

test('legacy or incomplete connected provenance stays explicitly unavailable', () => {
  const repo = new ConnectedPatientRepository();
  repo.hydrateSnapshot({ patient: { id: 'p1', displayName: 'Synthetic Patient', mrn: null },
    summary: { diagnosis: '', journeyStage: '', readinessScore: { done: 0, total: 0 } },
    documents: [], appointments: [], continuityMessages: [], caregivers: [], shareGrants: [],
    timeline: [{ id: 'e1', title: 'Unverified value', date: null, category: 'note', sourceDocumentId: 'd1', quote: null }],
  });
  const event = repo.state.ledger[0]!;
  assert.equal(event.status, 'extracted');
  assert.equal(event.source.quote, null);
  assert.equal(event.source.page, null);
  assert.equal(event.source.version, null);
  assert.equal(event.source.method, null);
  assert.equal(event.source.confidence, null);
});
