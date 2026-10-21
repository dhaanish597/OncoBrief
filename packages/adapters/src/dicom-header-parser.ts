import type { OcrSpanDraft } from '@oncobrief/ports';

export interface DicomMetadata {
  transferSyntaxUid?: string;
  sopClassUid?: string;
  sopInstanceUid?: string;
  studyDate?: string;
  modality?: string;
  institutionName?: string;
  studyInstanceUid?: string;
  seriesInstanceUid?: string;
  patientName?: string;
  patientId?: string;
  patientBirthDate?: string;
  burnedInAnnotation?: string;
  burnedInPhiWarning: boolean;
  plainText: string;
  spans: OcrSpanDraft[];
}

function formatDicomDate(raw: string): string {
  const trimmed = raw.trim();
  if (/^\d{8}$/.test(trimmed)) {
    return `${trimmed.slice(0, 4)}-${trimmed.slice(4, 6)}-${trimmed.slice(6, 8)}`;
  }
  return trimmed;
}

export function parseDicomHeader(buffer: Buffer): DicomMetadata {
  if (buffer.length < 132) {
    throw new Error('invalid_dicom_file:buffer_too_small');
  }

  const magic = buffer.subarray(128, 132).toString('ascii');
  if (magic !== 'DICM') {
    throw new Error('invalid_dicom_file:missing_DICM_prefix');
  }

  let offset = 132;
  const tags: Record<string, string> = {};

  while (offset + 4 <= buffer.length) {
    const group = buffer.readUInt16LE(offset);
    const element = buffer.readUInt16LE(offset + 2);
    offset += 4;

    // Pixel data reached (7FE0, 0010): Stop parsing without interpreting pixels
    if (group === 0x7fe0) {
      break;
    }

    // Determine VR and Length
    let vr = '';
    let length = 0;
    let isExplicit = false;

    if (offset + 2 <= buffer.length) {
      const b0 = buffer[offset];
      const b1 = buffer[offset + 1];
      if (
        b0 !== undefined &&
        b1 !== undefined &&
        b0 >= 65 &&
        b0 <= 90 &&
        b1 >= 65 &&
        b1 <= 90
      ) {
        isExplicit = true;
        vr = String.fromCharCode(b0, b1);
        offset += 2;
      }
    }

    if (isExplicit) {
      if (['OB', 'OW', 'OF', 'OD', 'SQ', 'UC', 'UR', 'UT', 'UN'].includes(vr)) {
        offset += 2; // Reserved 2 bytes
        if (offset + 4 > buffer.length) break;
        length = buffer.readUInt32LE(offset);
        offset += 4;
      } else {
        if (offset + 2 > buffer.length) break;
        length = buffer.readUInt16LE(offset);
        offset += 2;
      }
    } else {
      // Implicit VR: 4-byte length
      if (offset + 4 > buffer.length) break;
      length = buffer.readUInt32LE(offset);
      offset += 4;
    }

    // Safety check on length
    if (length === 0xffffffff || length < 0 || offset + length > buffer.length) {
      break;
    }

    const valBytes = buffer.subarray(offset, offset + length);
    const value = valBytes.toString('utf8').replace(/\0+$/, '').trim();
    offset += length;

    const groupHex = group.toString(16).padStart(4, '0').toUpperCase();
    const elemHex = element.toString(16).padStart(4, '0').toUpperCase();
    const tagKey = `(${groupHex},${elemHex})`;

    tags[tagKey] = value;
  }

  const transferSyntaxUid = tags['(0002,0010)'];
  const sopClassUid = tags['(0008,0016)'];
  const sopInstanceUid = tags['(0008,0018)'];
  const rawStudyDate = tags['(0008,0020)'];
  const studyDate = rawStudyDate ? formatDicomDate(rawStudyDate) : undefined;
  const modality = tags['(0008,0060)'];
  const institutionName = tags['(0008,0080)'];
  const studyInstanceUid = tags['(0020,000D)'];
  const seriesInstanceUid = tags['(0020,000E)'];
  const burnedInAnnotation = tags['(0028,0301)'];

  // Scrub Group 0010 PHI
  const patientName = tags['(0010,0010)'] ? '[REDACTED_PHI]' : undefined;
  const patientId = tags['(0010,0020)'] ? '[REDACTED_PHI]' : undefined;
  const patientBirthDate = tags['(0010,0030)'] ? '[REDACTED_PHI]' : undefined;

  // Flag burned-in annotation warning
  const burnedInPhiWarning = burnedInAnnotation
    ? burnedInAnnotation.trim().toUpperCase() !== 'NO'
    : true;

  // Build administrative text lines
  const lines: string[] = [];
  if (modality) lines.push(`Modality: ${modality}`);
  if (studyDate) lines.push(`Study Date: ${studyDate}`);
  if (institutionName) lines.push(`Institution: ${institutionName}`);
  if (studyInstanceUid) lines.push(`Study Instance UID: ${studyInstanceUid}`);
  if (seriesInstanceUid) lines.push(`Series Instance UID: ${seriesInstanceUid}`);
  if (sopClassUid) lines.push(`SOP Class UID: ${sopClassUid}`);
  if (sopInstanceUid) lines.push(`SOP Instance UID: ${sopInstanceUid}`);
  if (transferSyntaxUid) lines.push(`Transfer Syntax UID: ${transferSyntaxUid}`);
  if (patientName) lines.push(`Patient: ${patientName}`);
  lines.push(`Burned-In PHI Warning: ${burnedInPhiWarning ? 'YES' : 'NO'}`);

  const plainText = lines.join('\n');
  const spans: OcrSpanDraft[] = [];
  let charCursor = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const charStart = charCursor;
    const charEnd = charStart + line.length;
    charCursor = charEnd + 1; // account for newline

    spans.push({
      granularity: 'line',
      index: i,
      text: line,
      charStart,
      charEnd,
      bbox: {
        x: 0.05,
        y: Number((0.05 + i * 0.035).toFixed(4)),
        w: 0.9,
        h: 0.03,
      },
      confidence: 1.0,
    });
  }

  return {
    transferSyntaxUid,
    sopClassUid,
    sopInstanceUid,
    studyDate,
    modality,
    institutionName,
    studyInstanceUid,
    seriesInstanceUid,
    patientName,
    patientId,
    patientBirthDate,
    burnedInAnnotation,
    burnedInPhiWarning,
    plainText,
    spans,
  };
}
