/**
 * Minimal, dependency-free PDF writer for synthetic test documents.
 *
 * OncoBrief's synthetic fixtures are text, but Amazon Textract accepts only
 * PDF/TIFF/PNG/JPEG. This builds a small valid PDF (Helvetica text objects with
 * a correct cross-reference table) so the real pipeline can be exercised on a
 * multipage document without pulling a PDF library into the bundle.
 *
 * The content is purely synthetic administrative text. Never real patient data.
 */

function escapeText(s: string): string {
  return s
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)')
    .replace(/[^\x20-\x7E]/g, ' ');
}

function contentStream(lines: string[]): string {
  const parts = ['BT', '/F1 11 Tf', '12 TL', '72 720 Td'];
  lines.forEach((line, i) => {
    if (i > 0) parts.push('T*');
    parts.push(`(${escapeText(line)}) Tj`);
  });
  parts.push('ET');
  return parts.join('\n');
}

/**
 * Build a PDF with one page per entry of `pages`. Returns the bytes; the caller
 * uploads them to object storage.
 */
export function buildSyntheticPdf(pages: string[][]): Buffer {
  const objects: string[] = [];
  const pageCount = Math.max(1, pages.length);
  const fontObjNum = 3;
  const pageObjNums: number[] = [];
  const contentObjNums: number[] = [];

  for (let i = 0; i < pageCount; i += 1) {
    pageObjNums.push(4 + i * 2);
    contentObjNums.push(5 + i * 2);
  }

  objects[1] = `<< /Type /Catalog /Pages 2 0 R >>`;
  objects[2] = `<< /Type /Pages /Kids [${pageObjNums.map((n) => `${n} 0 R`).join(' ')}] /Count ${pageCount} >>`;
  objects[fontObjNum] = `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>`;

  for (let i = 0; i < pageCount; i += 1) {
    const stream = contentStream(pages[i] ?? []);
    objects[pageObjNums[i]!] =
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] ` +
      `/Resources << /Font << /F1 ${fontObjNum} 0 R >> >> /Contents ${contentObjNums[i]} 0 R >>`;
    objects[contentObjNums[i]!] = `<< /Length ${Buffer.byteLength(stream, 'latin1')} >>\nstream\n${stream}\nendstream`;
  }

  const maxObj = 3 + pageCount * 2;
  let pdf = '%PDF-1.4\n%\xE2\xE3\xCF\xD3\n';
  const offsets: number[] = [];
  for (let n = 1; n <= maxObj; n += 1) {
    offsets[n] = Buffer.byteLength(pdf, 'latin1');
    pdf += `${n} 0 obj\n${objects[n]}\nendobj\n`;
  }

  const xrefOffset = Buffer.byteLength(pdf, 'latin1');
  pdf += `xref\n0 ${maxObj + 1}\n`;
  pdf += `0000000000 65535 f \n`;
  for (let n = 1; n <= maxObj; n += 1) {
    pdf += `${String(offsets[n]).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${maxObj + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;

  return Buffer.from(pdf, 'latin1');
}
