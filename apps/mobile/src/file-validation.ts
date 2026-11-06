export function matchesSignature(bytes: Uint8Array, mime: string) {
  if (mime==='application/pdf') return [0x25,0x50,0x44,0x46,0x2d].every((n,i) => bytes[i]===n);
  if (mime==='image/jpeg') return bytes[0]===0xff && bytes[1]===0xd8 && bytes[2]===0xff;
  if (mime==='image/png') return [0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a].every((n,i) => bytes[i]===n);
  return false;
}

export interface ImportCandidate {
  name: string;
  mimeType: string;
  size: number;
  uri: string;
  date?: string;
  sha256?: string;
}

export interface ImportValidationResult {
  valid: boolean;
  error?: 'invalid_type' | 'invalid_size' | 'duplicate_document' | 'invalid_file';
  date?: string;
}

export function validateImportCandidate(candidate: ImportCandidate, existingDocuments: { name: string; size: number; sha256?: string }[] = []): ImportValidationResult {
  const types: Record<string, RegExp> = { 'application/pdf': /\.pdf$/i, 'image/jpeg': /\.jpe?g$/i, 'image/png': /\.png$/i };
  if (!candidate.size || candidate.size < 1 || candidate.size > 25 * 1024 * 1024) {
    return { valid: false, error: 'invalid_size' };
  }
  if (!candidate.mimeType || !types[candidate.mimeType]?.test(candidate.name)) {
    return { valid: false, error: 'invalid_type' };
  }
  const isDuplicate = existingDocuments.some(d => 
    (candidate.sha256 && d.sha256 && candidate.sha256 === d.sha256) ||
    (d.name === candidate.name && d.size === candidate.size)
  );
  if (isDuplicate) {
    return { valid: false, error: 'duplicate_document' };
  }
  const date = candidate.date && /^\d{4}-\d{2}-\d{2}$/.test(candidate.date)
    ? candidate.date
    : new Date().toISOString().slice(0, 10);
  return { valid: true, date };
}
