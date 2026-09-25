import { describe, expect, it } from 'vitest';
import { buildSyntheticPdf } from '../src/fixture-pdf';

/**
 * The synthetic PDF must be structurally valid — Textract rejects a malformed
 * cross-reference table silently (the job just fails), so the offsets are
 * asserted here rather than discovered during an expensive live run.
 */
describe('buildSyntheticPdf', () => {
  const pages = [
    ['SYNTHETIC DEMO CANCER CENTRE', 'Procedure Date: 12 January 2026'],
    ['Follow-up Appointment: 10 February 2026', 'Please bring the previous imaging report.'],
  ];

  it('emits a PDF header and EOF marker', () => {
    const pdf = buildSyntheticPdf(pages).toString('latin1');
    expect(pdf.startsWith('%PDF-1.4\n')).toBe(true);
    expect(pdf.trimEnd().endsWith('%%EOF')).toBe(true);
  });

  it('declares one page object per input page', () => {
    const pdf = buildSyntheticPdf(pages).toString('latin1');
    expect(pdf).toContain('/Type /Pages');
    expect(pdf).toMatch(/\/Count 2/);
    expect((pdf.match(/\/Type \/Page[^s]/g) ?? []).length).toBe(2);
  });

  it('writes a cross-reference entry pointing at each object', () => {
    const pdf = buildSyntheticPdf(pages).toString('latin1');
    const xrefStart = pdf.indexOf('xref\n');
    const startxref = Number(pdf.slice(pdf.indexOf('startxref') + 9).trim().split(/\s+/)[0]);
    expect(startxref).toBe(Buffer.byteLength(pdf.slice(0, xrefStart), 'latin1'));

    const lines = pdf.slice(xrefStart).split('\n').filter((l) => /^\d{10} \d{5} [nf] $/.test(l));
    // Objects 1..(3 + 2*pages) then the free entry.
    expect(lines.length).toBe(4 + pages.length * 2);
    lines.slice(1).forEach((line) => {
      const offset = Number(line.slice(0, 10));
      expect(pdf.slice(offset)).toMatch(/^\d+ 0 obj/);
    });
  });

  it('escapes parentheses so the content stream cannot break syntax', () => {
    const pdf = buildSyntheticPdf([['Report (final) \\ signed']]).toString('latin1');
    expect(pdf).toContain('\\(final\\)');
    expect(pdf).toContain('\\\\ signed');
  });
});
