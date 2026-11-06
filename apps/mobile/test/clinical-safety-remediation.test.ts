import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as selectors from '../src/patient-selectors';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const mobileDir = path.resolve(__dirname, '..');

test('patient-selectors does not classify lab values into below/within/above categories (BUG-MOB-04)', () => {
  const selectorsContent = fs.readFileSync(path.join(mobileDir, 'src/patient-selectors.ts'), 'utf8');

  // Must not compute location: 'below' | 'above' | 'within'
  assert.ok(
    !selectorsContent.includes("'below'") &&
    !selectorsContent.includes("'above'") &&
    !selectorsContent.includes("'within'"),
    'patient-selectors.ts must not classify observations into below/above/within normative locations'
  );

  // If referencePosition exists or is replaced by referenceRange, it must not return location
  if ('referencePosition' in selectors) {
    const fn = (selectors as any).referencePosition;
    const sampleObs: selectors.LabObservation = {
      id: 'o1',
      test: 'haemoglobin',
      value: 10.5,
      unit: 'g/dL',
      date: '2026-10-24',
      documentId: 'd1',
      documentName: 'Lab Report',
      facility: 'Lab A',
      quote: '10.5 g/dL',
      page: 1,
      version: 'v1',
      status: 'extracted',
      patientReviewed: false,
      category: 'blood',
      reference: { low: 12.0, high: 15.5, unit: 'g/dL' }
    };
    const res = fn(sampleObs);
    assert.equal(res?.location, undefined, 'referencePosition must not compute or return location property');
  }
});

test('laboratory.tsx renders verbatim reference intervals without classification labels or gauge slider', () => {
  const labContent = fs.readFileSync(path.join(mobileDir, 'src/laboratory.tsx'), 'utf8');

  // Must not reference range.location or t(range.location)
  assert.ok(
    !labContent.includes('range.location') && !labContent.includes('t(range.location)'),
    'laboratory.tsx must not display range.location (within/below/above)'
  );

  // Must not render normal/abnormal position slider gauge
  assert.ok(
    !labContent.includes('range.fraction'),
    'laboratory.tsx must not render a position gauge slider on reference intervals'
  );
});

test('wellbeing components always contain non-monitored safety disclaimers', () => {
  const wellbeingContent = fs.readFileSync(path.join(mobileDir, 'src/wellbeing-workspace.tsx'), 'utf8');
  assert.ok(
    wellbeingContent.includes("t('urgentInfo')") || wellbeingContent.includes("t('wellbeingInfo')"),
    'Wellbeing workspace must display non-monitored safety disclaimer'
  );
});
