import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDemo, reduce, validateFile, type DocumentRecord } from '../src/domain';
import { validateImportCandidate } from '../src/file-validation';

test('import validation rejects duplicates by name and size (BUG-MOB-09 / REQ-MOB-016 / SEC-MOB-03)', () => {
  const existingDocs = [{ name: 'blood-count-14-october.pdf', size: 2048 }];

  const duplicateCandidate = {
    name: 'blood-count-14-october.pdf',
    mimeType: 'application/pdf',
    size: 2048,
    uri: 'file:///data/cache/dup.pdf'
  };

  const result = validateImportCandidate(duplicateCandidate, existingDocs);
  assert.equal(result.valid, false);
  assert.equal(result.error, 'duplicate_document');
});

test('import candidate validates date fallback to today (BUG-MOB-09)', () => {
  const s = createDemo();
  const validCandidate = {
    name: 'new-outside-report.pdf',
    mimeType: 'application/pdf',
    size: 2048,
    uri: 'file:///data/cache/new-outside-report.pdf'
  };

  const result = validateImportCandidate(validCandidate, s.documents);
  assert.equal(result.valid, true);
  assert.ok(result.date && /^\d{4}-\d{2}-\d{2}$/.test(result.date), 'Date must be formatted as YYYY-MM-DD');
});

test('import action fails closed on missing uri or invalid file (SEC-MOB-03)', () => {
  const s = createDemo();
  const invalidDoc: DocumentRecord = {
    id: 'sample-999',
    name: 'corrupt.pdf',
    category: 'other',
    date: '2026-10-28',
    facility: 'Local',
    mimeType: 'application/pdf',
    size: 0, // invalid size
    uri: '',
    version: 'local-original-v1',
    extraction: 'unavailable',
    patientReviewed: false,
    clinicianVerified: false,
    addedAt: '2026-10-28T10:00:00.000Z'
  };

  assert.throws(() => reduce(s, { type: 'import', document: invalidDoc }), /invalid_document/);
});
