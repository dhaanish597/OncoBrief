import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDemo, reduce, readiness, records, timeline, type PersonaId } from '../src/domain';

test('createDemo("DEMO-001") returns Meenakshi Sundaram Breast Cancer oncology cohort (REQ-MOB-001)', () => {
  const s = createDemo('DEMO-001');

  assert.equal(s.personaId, 'DEMO-001');
  assert.equal(s.patientName, 'Meenakshi Sundaram');
  assert.equal(s.mrn, 'SUN-448120');
  assert.ok(s.diagnosis.toLowerCase().includes('breast'), 'Diagnosis must specify breast cancer');
  assert.ok(s.journeyStage.includes('AC-T') || s.journeyStage.includes('Chemotherapy'), 'Stage must reference AC-T or Chemo');

  // Verify oncology document categories
  const categories = s.documents.map(d => d.category);
  assert.ok(categories.includes('pathology'), 'Must include pathology document');
  assert.ok(categories.includes('laboratory'), 'Must include laboratory document');
  assert.ok(categories.includes('referral'), 'Must include referral document');

  // Check specific pathology report
  const pathDoc = s.documents.find(d => d.category === 'pathology');
  assert.ok(pathDoc, 'Pathology document must exist');
  assert.ok(pathDoc?.originalText?.includes('Invasive Ductal Carcinoma'), 'Pathology text must describe Invasive Ductal Carcinoma');
  assert.ok(pathDoc?.originalText?.includes('ER+'), 'Pathology text must specify receptor status');

  // Verify synthetic provenance
  for (const doc of s.documents) {
    assert.ok(doc.originalText?.includes('SYNTHETIC') || doc.originalText?.includes('Demo'), 'All docs must be explicitly synthetic');
    assert.ok(doc.facility && doc.facility.length > 0, 'Every doc must have an issuing facility');
  }
});

test('createDemo("DEMO-002") returns Rajeshwari Nair Ovarian Cancer cohort', () => {
  const s = createDemo('DEMO-002');

  assert.equal(s.personaId, 'DEMO-002');
  assert.equal(s.patientName, 'Rajeshwari Nair');
  assert.equal(s.mrn, 'NAI-882104');
  assert.ok(s.diagnosis.toLowerCase().includes('ovarian'), 'Diagnosis must specify ovarian carcinoma');

  // Must include CA-125 lab or imaging
  const hasCa125OrImaging = s.documents.some(d => d.name.includes('CA-125') || d.category === 'imaging');
  assert.ok(hasCa125OrImaging, 'DEMO-002 must contain CA-125 or imaging record');
});

test('createDemo("DEMO-003") returns Arjun Kulkarni Colon Cancer cohort', () => {
  const s = createDemo('DEMO-003');

  assert.equal(s.personaId, 'DEMO-003');
  assert.equal(s.patientName, 'Arjun Kulkarni');
  assert.equal(s.mrn, 'READY-1001');
  assert.ok(s.diagnosis.toLowerCase().includes('colon'), 'Diagnosis must specify colon cancer');
});

test('bilingual localization of oncology cohort persona strings (REQ-MOB-031)', () => {
  const s = createDemo('DEMO-001');

  assert.ok(s.patientNameTa && s.patientNameTa.length > 0, 'patientNameTa must be populated');
  assert.ok(s.diagnosisTa && s.diagnosisTa.length > 0, 'diagnosisTa must be populated');
  assert.ok(s.journeyStageTa && s.journeyStageTa.length > 0, 'journeyStageTa must be populated');

  // Verify Tamil Unicode range
  const tamilRegex = /[\u0B80-\u0BFF]/;
  assert.ok(tamilRegex.test(s.patientNameTa), 'patientNameTa must contain Tamil characters');
  assert.ok(tamilRegex.test(s.diagnosisTa), 'diagnosisTa must contain Tamil characters');

  // Verify ledger bilingual entries
  for (const entry of s.ledger) {
    assert.ok(entry.title && entry.title.length > 0, 'Ledger entry must have English title');
    assert.ok(entry.titleTa && entry.titleTa.length > 0, 'Ledger entry must have Tamil title');
    assert.ok(tamilRegex.test(entry.titleTa), `Ledger titleTa '${entry.titleTa}' must contain Tamil characters`);
  }
});

test('persona switching completely resets patient records with zero data bleed', () => {
  const s1 = createDemo('DEMO-001');
  assert.equal(s1.patientName, 'Meenakshi Sundaram');

  const now = '2026-11-01T10:00:00.000Z';
  const s2 = reduce(s1, { type: 'selectPersona', personaId: 'DEMO-002' }, now);

  assert.equal(s2.personaId, 'DEMO-002');
  assert.equal(s2.patientName, 'Rajeshwari Nair');
  assert.ok(!s2.documents.some(d => d.name.includes('Sunrise')), 'DEMO-002 must not contain DEMO-001 Sunrise documents');
});

test('readiness score only measures administrative preparation checklist (REQ-MOB-003)', () => {
  const s = createDemo('DEMO-001');
  const r = readiness(s);

  assert.ok(typeof r.done === 'number', 'readiness.done must be a number');
  assert.ok(typeof r.total === 'number', 'readiness.total must be a number');
  assert.ok(r.total > 0, 'readiness.total must be greater than zero');
  assert.ok(r.done <= r.total, 'readiness.done cannot exceed total');
});
