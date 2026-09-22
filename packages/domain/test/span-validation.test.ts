import { describe, expect, it } from 'vitest';
import {
  normalizeForComparison,
  validateSpans,
  type SpanForValidation,
} from '../src/index.js';

const DOC = 'doc-1';
const PAGE = 'page-1';

function span(id: string, text: string, page = PAGE, doc = DOC): SpanForValidation {
  return { id, documentId: doc, pageId: page, text };
}

describe('normalizeForComparison', () => {
  it('collapses whitespace', () => {
    expect(normalizeForComparison('  Post   operative\n\nnote ')).toBe('Post operative note');
  });

  it('unifies dash variants', () => {
    expect(normalizeForComparison('2023\u20132024')).toBe('2023-2024');
    expect(normalizeForComparison('2023\u20142024')).toBe('2023-2024');
  });

  it('unifies curly quotes', () => {
    expect(normalizeForComparison('\u201Cfollow-up\u201D')).toBe('"follow-up"');
  });

  it('applies NFKC so compatibility variants fold', () => {
    expect(normalizeForComparison('\uFB01ne needle')).toBe('fine needle');
  });
});

describe('validateSpans', () => {
  it('accepts an exact substring', () => {
    const r = validateSpans('Needle biopsy', [span('s1', 'US guided Needle biopsy of right breast performed.')]);
    expect(r.ok).toBe(true);
  });

  it('accepts across whitespace and dash differences', () => {
    // quote has a non-breaking hyphen and collapsed spaces; span has ASCII.
    const r = validateSpans('Needle   biopsy  Follow\u2011up', [
      span('s1', 'Needle biopsy Follow-up documented.'),
    ]);
    expect(r.ok).toBe(true);
  });

  it('rejects a dash difference that changes the token structure', () => {
    // '12–June-2023' and '12 June 2023' normalise differently; the checker
    // must not paper over a structural difference.
    const r = validateSpans('12\u2013June-2023', [
      span('s1', 'Surgery completed on 12 June 2023 at 09:00.'),
    ]);
    expect(r.ok).toBe(false);
  });

  it('accepts a multi-span concatenation', () => {
    const r = validateSpans('Cycle 3 chemotherapy on 14 Aug', [
      span('s1', 'Cycle 3 chemotherapy'),
      span('s2', 'on 14 Aug 2023'),
    ]);
    expect(r.ok).toBe(true);
  });

  it('rejects a fabricated quote with span_mismatch', () => {
    const r = validateSpans('Patient has metastatic disease', [
      span('s1', 'Patient reviewed in the outpatient department.'),
    ]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('span_mismatch');
  });

  it('rejects a cross-page link', () => {
    const r = validateSpans('some text', [span('s1', 'some text', 'page-1'), span('s2', 'more', 'page-2')]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('cross_page');
  });

  it('rejects a cross-document link', () => {
    const r = validateSpans('some text', [span('s1', 'some text', PAGE, DOC), span('s2', 'more', PAGE, 'doc-2')]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('cross_document');
  });

  it('rejects an empty quote', () => {
    const r = validateSpans('   ', [span('s1', 'anything')]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('empty_quote');
  });

  it('rejects no spans', () => {
    const r = validateSpans('anything', []);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('no_spans');
  });

  it('rejects a plausible-but-absent number', () => {
    const r = validateSpans('CA 15-3 was 42', [span('s1', 'CA 15-3 was 32 U/mL')]);
    expect(r.ok).toBe(false);
  });
});
