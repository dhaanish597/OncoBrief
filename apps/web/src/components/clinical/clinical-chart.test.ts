import { describe, it, expect } from 'vitest';
import { areUnitsComparable } from './ObservationChart';
import { canonicalizeAnalyte, parseReferenceRange, parseSourceFlag } from '@oncobrief/domain';

describe('Clinical Chart Unit Compatibility', () => {
  it('treats identical units as comparable', () => {
    expect(areUnitsComparable('g/dL', 'g/dL')).toBe(true);
    expect(areUnitsComparable('mg/dL', 'mg/dL')).toBe(true);
    expect(areUnitsComparable('U/L', 'U/L')).toBe(true);
  });

  it('treats clinically synonymous units as comparable', () => {
    expect(areUnitsComparable('g/dL', 'gm/dL')).toBe(true);
    expect(areUnitsComparable('/uL', 'cells/mcl')).toBe(true);
    expect(areUnitsComparable('/uL', 'cells/cu.mm')).toBe(true);
    expect(areUnitsComparable('mg/dL', 'mg%')).toBe(true);
    expect(areUnitsComparable('U/L', 'IU/L')).toBe(true);
  });

  it('detects incompatible units that cannot share a single numeric scale', () => {
    expect(areUnitsComparable('g/dL', 'mg/dL')).toBe(false);
    expect(areUnitsComparable('g/dL', 'mmol/L')).toBe(false);
    expect(areUnitsComparable('/uL', '%')).toBe(false);
    expect(areUnitsComparable('U/L', 'ng/mL')).toBe(false);
  });
});

describe('Dynamic Analyte Catalog & Fallback', () => {
  it('maps known haematology test aliases correctly', () => {
    const hb = canonicalizeAnalyte('Hb');
    expect(hb.key).toBe('haemoglobin');
    expect(hb.category).toBe('hematology');
    expect(hb.isNumeric).toBe(true);

    const wbc = canonicalizeAnalyte('Total Leucocyte Count');
    expect(wbc.key).toBe('wbc');
    expect(wbc.category).toBe('hematology');

    const plt = canonicalizeAnalyte('PLT');
    expect(plt.key).toBe('platelets');
  });

  it('maps biochemistry analytes correctly', () => {
    const creat = canonicalizeAnalyte('S. Creatinine');
    expect(creat.key).toBe('creatinine');
    expect(creat.category).toBe('biochemistry');

    const bili = canonicalizeAnalyte('Total Bilirubin');
    expect(bili.key).toBe('bilirubin_total');
  });

  it('generates clean fallback for newly extracted novel test names without crashing', () => {
    const novelTest = canonicalizeAnalyte('Soluble Transferrin Receptor');
    expect(novelTest.key).toBe('soluble_transferrin_receptor');
    expect(novelTest.label).toBe('Soluble Transferrin Receptor');
    expect(novelTest.category).toBe('other');
  });
});

describe('Reference Range and Abnormality Parsing', () => {
  it('parses standard range boundaries', () => {
    const parsed = parseReferenceRange('12.0 - 15.5 g/dL');
    expect(parsed?.low).toBe(12.0);
    expect(parsed?.high).toBe(15.5);
  });

  it('parses upper and lower bounds', () => {
    const upper = parseReferenceRange('< 30');
    expect(upper?.high).toBe(30);

    const lower = parseReferenceRange('> 10');
    expect(lower?.low).toBe(10);
  });

  it('parses source flags accurately', () => {
    expect(parseSourceFlag('H')).toBe('H');
    expect(parseSourceFlag('HIGH')).toBe('H');
    expect(parseSourceFlag('L')).toBe('L');
    expect(parseSourceFlag('CRITICAL')).toBe('CRITICAL');
    expect(parseSourceFlag('NORMAL')).toBe('NORMAL');
    expect(parseSourceFlag(null)).toBeUndefined();
  });
});
