import { describe, expect, it } from 'vitest';
import { redactMetadata } from '../src/services/audit';
describe('recursive audit privacy', () => {
  it('redacts nested arrays and short text and note payloads', () => {
    const safe = redactMetadata({ text: 'Patient PHI', note: 'Medical note', list: [{ phone: '+91 9999999999', nested: [{ patientAbha: 'patient@abdm' }] }], error: new Error('Secret provider response'), count: 2 });
    expect(safe).toEqual({ text: '<redacted>', note: '<redacted>', list: [{ phone: '<redacted>', nested: [{ patientAbha: '<redacted>' }] }], error: '<redacted>', count: 2 });
  });
});
