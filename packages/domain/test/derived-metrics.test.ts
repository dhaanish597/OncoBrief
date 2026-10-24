import { describe, it, expect } from 'vitest';
import {
  calculateBMI,
  calculateBSADuBois,
  calculateBSAMosteller,
  canonicalizeAnalyte,
  areUnitsComparable,
  parseReferenceRange,
  parseSourceFlag,
} from '../src/index';

describe('Derived Clinical Metrics', () => {
  const heightInput = {
    value: 162,
    unit: 'cm',
    observedOn: '2025-06-16',
    sourceDocumentName: 'histopathology-report.pdf',
    sourcePageNumber: 1,
  };

  const weightInput = {
    value: 58,
    unit: 'kg',
    observedOn: '2025-07-28',
    sourceDocumentName: 'chemotherapy-sheet.pdf',
    sourcePageNumber: 1,
  };

  describe('calculateBMI', () => {
    it('calculates BMI correctly with valid metric inputs', () => {
      const res = calculateBMI(heightInput, weightInput);
      expect(res.derived).toBe(true);
      if (!res.derived) return;

      // 58 / (1.62^2) = 58 / 2.6244 = 22.0999 -> 22.1
      expect(res.value).toBe(22.1);
      expect(res.formattedValue).toBe('22.1 kg/m²');
      expect(res.unit).toBe('kg/m²');
      expect(res.inputs.height?.value).toBe(162);
      expect(res.inputs.weight?.value).toBe(58);
      expect(res.inputDates.heightDate).toBe('2025-06-16');
      expect(res.inputDates.weightDate).toBe('2025-07-28');
      expect(res.notes.length).toBeGreaterThan(0); // Note regarding asynchronous observation dates
    });

    it('returns missing_height when height is absent', () => {
      const res = calculateBMI(null, weightInput);
      expect(res.derived).toBe(false);
      if (res.derived) return;
      expect(res.reason).toBe('missing_height');
    });

    it('returns missing_weight when weight is absent', () => {
      const res = calculateBMI(heightInput, null);
      expect(res.derived).toBe(false);
      if (res.derived) return;
      expect(res.reason).toBe('missing_weight');
    });

    it('returns missing_both when both inputs are absent', () => {
      const res = calculateBMI(null, null);
      expect(res.derived).toBe(false);
      if (res.derived) return;
      expect(res.reason).toBe('missing_both');
    });

    it('rejects unphysiological values', () => {
      const res = calculateBMI({ ...heightInput, value: -10 }, weightInput);
      expect(res.derived).toBe(false);
      if (res.derived) return;
      expect(res.reason).toBe('invalid_values');
    });
  });

  describe('calculateBSADuBois', () => {
    it('calculates DuBois BSA accurately', () => {
      const res = calculateBSADuBois(heightInput, weightInput);
      expect(res.derived).toBe(true);
      if (!res.derived) return;

      // 0.007184 * 58^0.425 * 162^0.725
      // 58^0.425 = 5.6198
      // 162^0.725 = 39.8153
      // 0.007184 * 5.6198 * 39.8153 = 1.607 -> 1.61 m^2
      expect(res.value).toBe(1.61);
      expect(res.formattedValue).toBe('1.61 m²');
      expect(res.formula).toContain('0.007184');
      expect(res.methodName).toContain('DuBois');
    });
  });

  describe('calculateBSAMosteller', () => {
    it('calculates Mosteller BSA accurately', () => {
      const res = calculateBSAMosteller(heightInput, weightInput);
      expect(res.derived).toBe(true);
      if (!res.derived) return;

      // sqrt((162 * 58) / 3600) = sqrt(9396 / 3600) = sqrt(2.61) = 1.6155 -> 1.62 m^2
      expect(res.value).toBe(1.62);
      expect(res.formattedValue).toBe('1.62 m²');
      expect(res.methodName).toContain('Mosteller');
    });
  });
});

describe('Analyte Catalog & Normalization', () => {
  it('maps variant spellings and abbreviations to canonical analytes', () => {
    expect(canonicalizeAnalyte('Haemoglobin').key).toBe('haemoglobin');
    expect(canonicalizeAnalyte('hemoglobin').key).toBe('haemoglobin');
    expect(canonicalizeAnalyte('Hb').key).toBe('haemoglobin');
    expect(canonicalizeAnalyte('HGB').key).toBe('haemoglobin');

    expect(canonicalizeAnalyte('Total leucocyte count').key).toBe('wbc');
    expect(canonicalizeAnalyte('WBC').key).toBe('wbc');
    expect(canonicalizeAnalyte('TLC').key).toBe('wbc');

    expect(canonicalizeAnalyte('Platelet count').key).toBe('platelets');
    expect(canonicalizeAnalyte('Serum Creatinine').key).toBe('creatinine');
    expect(canonicalizeAnalyte('Total Bilirubin').key).toBe('bilirubin_total');
    expect(canonicalizeAnalyte('LDH').key).toBe('ldh');
    expect(canonicalizeAnalyte('ANC').key).toBe('anc');
    expect(canonicalizeAnalyte('CA 15-3').key).toBe('ca_15_3');
    expect(canonicalizeAnalyte('CEA').key).toBe('cea');
    expect(canonicalizeAnalyte('Height').key).toBe('height');
    expect(canonicalizeAnalyte('Weight').key).toBe('weight');
    expect(canonicalizeAnalyte('ECOG').key).toBe('ecog');
  });

  it('determines unit comparability correctly', () => {
    expect(areUnitsComparable('g/dL', 'g/dL')).toBe(true);
    expect(areUnitsComparable('g/dL', 'gm/dL')).toBe(true);
    expect(areUnitsComparable('/uL', 'cells/mcL')).toBe(true);
    expect(areUnitsComparable('/uL', 'cells/cu.mm')).toBe(true);

    expect(areUnitsComparable('g/dL', 'mmol/L')).toBe(false);
    expect(areUnitsComparable('mg/dL', 'U/L')).toBe(false);
    expect(areUnitsComparable('%', '/uL')).toBe(false);
  });

  it('parses source reference ranges', () => {
    const r1 = parseReferenceRange('12.0 - 15.0');
    expect(r1?.low).toBe(12.0);
    expect(r1?.high).toBe(15.0);

    const r2 = parseReferenceRange('Ref: 4,000 - 11,000 /uL');
    expect(r2?.low).toBe(4000);
    expect(r2?.high).toBe(11000);

    const r3 = parseReferenceRange('< 30 U/mL');
    expect(r3?.low).toBeUndefined();
    expect(r3?.high).toBe(30);
  });

  it('parses source flags', () => {
    expect(parseSourceFlag('H')).toBe('H');
    expect(parseSourceFlag('High')).toBe('H');
    expect(parseSourceFlag('[H]')).toBe('H');
    expect(parseSourceFlag('L')).toBe('L');
    expect(parseSourceFlag('Low')).toBe('L');
    expect(parseSourceFlag('Critical')).toBe('CRITICAL');
    expect(parseSourceFlag('Normal')).toBe('NORMAL');
    expect(parseSourceFlag(null)).toBeUndefined();
  });
});

describe('source input integrity', () => {
  it.each([calculateBMI, calculateBSADuBois, calculateBSAMosteller])('refuses missing or unknown units and nonfinite inputs', (calculate) => {
    for (const unit of ['', 'unknown']) {
      expect(calculate({ value: 170, unit, observedOn: null }, { value: 70, unit: 'kg', observedOn: null }).derived).toBe(false);
    }
    expect(calculate({ value: NaN, unit: 'cm', observedOn: null }, { value: 70, unit: 'kg', observedOn: null }).derived).toBe(false);
  });
});


it.each([
  ['Mean Corpuscular Haemoglobin', 'mch'],
  ['Mean Corpuscular Hemoglobin', 'mch'],
  ['Mean Corpuscular Haemoglobin Concentration', 'mchc'],
])('keeps the explicit CBC analyte %s distinct', (name, key) => {
  expect(canonicalizeAnalyte(name).key).toBe(key);
});
