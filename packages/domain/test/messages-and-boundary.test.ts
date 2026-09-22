import { describe, expect, it } from 'vitest';
import {
  checkMessageApprovalGate,
  renderTemplate,
  normalizeForComparison,
  assertBoundaryClean,
  scanForBoundaryViolation,
  FACT_TYPES,
  FACT_TYPE_LABEL,
  TASK_KINDS,
  TASK_KIND_LABEL,
  DOCUMENT_TYPES,
  DOCUMENT_TYPE_LABEL,
  EVIDENCE_STATE_LABEL,
  PACKET_SECTION_LABEL,
  READINESS_BAND_LABEL,
  type VariableSource,
} from '../src/index.js';

describe('renderTemplate', () => {
  it('renders allowed variables', () => {
    const r = renderTemplate('Your appointment is on {{appointment_date}}.', ['appointment_date'], {
      appointment_date: '12 June 2025',
    });
    expect(r).toEqual({ ok: true, body: 'Your appointment is on 12 June 2025.', used: ['appointment_date'] });
  });

  it('rejects an unknown variable', () => {
    const r = renderTemplate('Take {{drug_name}}.', ['appointment_date'], { drug_name: 'X' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('unknown_variable');
  });

  it('rejects a missing value', () => {
    const r = renderTemplate('On {{date}}.', ['date'], {});
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('missing_variable');
  });

  it('rejects stray single-brace placeholders', () => {
    const r = renderTemplate('On {date}.', ['date'], { date: 'x' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('unknown_placeholder_syntax');
  });
});

describe('message approval gate', () => {
  const verified: VariableSource = {
    kind: 'evidence',
    variableName: 'appointment_date',
    evidenceFactId: 'f1',
    state: 'verified',
  };
  const corrected: VariableSource = {
    kind: 'evidence',
    variableName: 'appointment_date',
    evidenceFactId: 'f2',
    state: 'corrected',
  };
  const extracted: VariableSource = {
    kind: 'evidence',
    variableName: 'appointment_date',
    evidenceFactId: 'f3',
    state: 'extracted',
  };
  const conflicting: VariableSource = {
    kind: 'evidence',
    variableName: 'appointment_date',
    evidenceFactId: 'f4',
    state: 'conflicting',
  };

  it('allows a verified source', () => {
    expect(checkMessageApprovalGate(['appointment_date'], [verified])).toEqual({ ok: true });
  });

  it('allows a corrected source', () => {
    expect(checkMessageApprovalGate(['appointment_date'], [corrected])).toEqual({ ok: true });
  });

  it('blocks an extracted source', () => {
    const r = checkMessageApprovalGate(['appointment_date'], [extracted]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.blockers.join(' ')).toContain('extracted');
  });

  it('blocks a conflicting source', () => {
    const r = checkMessageApprovalGate(['appointment_date'], [conflicting]);
    expect(r.ok).toBe(false);
  });

  it('blocks a variable with no recorded source', () => {
    const r = checkMessageApprovalGate(['appointment_date'], []);
    expect(r.ok).toBe(false);
  });

  it('allows an allow-listed literal', () => {
    const src: VariableSource = { kind: 'literal', variableName: 'records_office_phone', literalValue: '+91 00000 00000' };
    expect(checkMessageApprovalGate(['records_office_phone'], [src])).toEqual({ ok: true });
  });

  it('blocks a non-allow-listed literal', () => {
    const src: VariableSource = { kind: 'literal', variableName: 'clinical_note', literalValue: 'start chemo' };
    const r = checkMessageApprovalGate(['clinical_note'], [src]);
    expect(r.ok).toBe(false);
  });
});

describe('clinical boundary guard', () => {
  const allSystemStrings = [
    ...FACT_TYPES,
    ...Object.values(FACT_TYPE_LABEL),
    ...TASK_KINDS,
    ...Object.values(TASK_KIND_LABEL),
    ...DOCUMENT_TYPES,
    ...Object.values(DOCUMENT_TYPE_LABEL),
    ...Object.values(EVIDENCE_STATE_LABEL),
    ...Object.values(PACKET_SECTION_LABEL),
    ...Object.values(READINESS_BAND_LABEL),
  ];

  it('the closed vocabularies contain no forbidden clinical concept', () => {
    expect(() => assertBoundaryClean(allSystemStrings, 'vocabularies')).not.toThrow();
  });

  it('detects a risk score concept', () => {
    expect(scanForBoundaryViolation('patient_risk_score')).toHaveLength(1);
  });

  it('detects a prognosis concept', () => {
    expect(scanForBoundaryViolation('prognosis_estimate')).toHaveLength(1);
  });

  it('detects urgency and triage concepts', () => {
    expect(scanForBoundaryViolation('urgency_level')).toHaveLength(1);
    expect(scanForBoundaryViolation('auto_triage')).toHaveLength(1);
  });

  it('detects treatment recommendation concepts', () => {
    expect(scanForBoundaryViolation('recommended_treatment')).toHaveLength(1);
    expect(scanForBoundaryViolation('treatment_recommendation')).toHaveLength(1);
  });
});

describe('normalisation is shared with span validation', () => {
  it('is stable for already-normal text', () => {
    const s = 'Follow-up on 12 June 2025';
    expect(normalizeForComparison(normalizeForComparison(s))).toBe(normalizeForComparison(s));
  });
});
