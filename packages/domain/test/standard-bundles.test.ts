import { describe, it, expect } from 'vitest';
import {
  validateFhirBundle,
  createTataMemorialDiagnosticBundle,
  createAiimsMCodeBundle,
} from '../src/fhir/standard-bundles';

describe('FHIR Bundle Validator and Oncology Standard Bundles', () => {
  it('rejects null or non-object payloads with an explicit error', () => {
    expect(validateFhirBundle(null)).toEqual({
      valid: false,
      error: 'Uploaded content is not a valid JSON object.',
    });
    expect(validateFhirBundle('string')).toEqual({
      valid: false,
      error: 'Uploaded content is not a valid JSON object.',
    });
    expect(validateFhirBundle([])).toEqual({
      valid: false,
      error: 'Uploaded content is not a valid JSON object.',
    });
  });

  it('rejects objects that are not FHIR Bundles', () => {
    const res = validateFhirBundle({ resourceType: 'Observation', status: 'final' });
    expect(res.valid).toBe(false);
    expect(res.error).toContain('Invalid resourceType "Observation". Expected FHIR R4 "Bundle".');
  });

  it('rejects bundles with missing or empty entry arrays', () => {
    const res = validateFhirBundle({ resourceType: 'Bundle', type: 'collection' });
    expect(res.valid).toBe(false);
    expect(res.error).toContain('FHIR Bundle entry array is missing or empty.');
  });

  it('creates and validates a standard Tata Memorial / ACTREC NRCeS ABDM bundle', () => {
    const bundle = createTataMemorialDiagnosticBundle('p-test-01');
    const val = validateFhirBundle(bundle);
    expect(val.valid).toBe(true);
    expect(val.bundleType).toBe('abdm_v650');
    expect(val.entryCount).toBeGreaterThan(3);

    const typed = bundle as { entry: Array<{ resource: { resourceType: string } }> };
    const types = typed.entry.map((e) => e.resource.resourceType);
    expect(types).toContain('Composition');
    expect(types).toContain('Organization');
    expect(types).toContain('DiagnosticReport');
    expect(types).toContain('Observation');
  });

  it('creates and validates a standard AIIMS HL7 mCODE STU4 bundle', () => {
    const bundle = createAiimsMCodeBundle('p-test-02');
    const val = validateFhirBundle(bundle);
    expect(val.valid).toBe(true);
    expect(val.bundleType).toBe('mcode_stu4');
    expect(val.entryCount).toBeGreaterThan(2);

    const typed = bundle as { entry: Array<{ resource: { resourceType: string } }> };
    const types = typed.entry.map((e) => e.resource.resourceType);
    expect(types).toContain('Organization');
    expect(types).toContain('Procedure');
    expect(types).toContain('Observation');
  });
});
