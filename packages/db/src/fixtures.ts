import { createHash } from 'node:crypto';
import type { OcrSpanDraft } from '@oncobrief/ports';

/**
 * Deterministic demo fixtures (architecture §25.2).
 *
 * The data is engineered to contain the problem: DEMO-001 is a fragmented
 * referral whose documents **disagree about the surgery date**, DEMO-002 shows
 * a verified fact reopened by a later document, DEMO-003 is ready. Every row is
 * badged `is_demo_fixture`. No real patient data is used.
 *
 * Spans are derived deterministically from the page text: each line becomes a
 * line-level span with a geometry band computed from its index. That is a
 * legitimate deterministic OCR adapter output, not fabricated provenance — the
 * quote a fact cites is always literally present in this text.
 */

export interface FixtureDoc {
  filename: string;
  mimeType: string;
  recordOrigin: 'internal_hospital' | 'external_hospital' | 'diagnostic_lab' | 'imaging_centre' | 'patient_upload';
  issuingFacility: string | null;
  documentDate: string | null;
  sourceKind: 'upload' | 'scan' | 'fax_pdf' | 'photo';
  /** Near-duplicate group id; documents sharing one are flagged for review. */
  duplicateGroup?: string;
  pages: string[];
}

export function lineSpans(plainText: string): OcrSpanDraft[] {
  const lines = plainText.split('\n');
  const spans: OcrSpanDraft[] = [];
  let charStart = 0;
  lines.forEach((line, i) => {
    const text = line.trim();
    const rawStart = charStart;
    charStart += line.length + 1;
    if (text.length === 0) return;
    const leading = line.length - line.trimStart().length;
    const y = Math.min(0.04 + i * 0.055, 0.94);
    const width = Math.min(0.9, Math.max(0.05, text.length * 0.008));
    spans.push({
      granularity: 'line',
      index: spans.length,
      text,
      charStart: rawStart + leading,
      charEnd: rawStart + leading + text.length,
      bbox: { x: 0.05, y, w: width, h: 0.035 },
      confidence: 0.97,
    });
  });
  return spans;
}

export function page(text: string) {
  const trimmed = text.trim();
  return { plainText: trimmed, spans: lineSpans(trimmed) };
}

export function fixtureBytes(text: string): Buffer {
  return Buffer.from(text, 'utf8');
}

export function sha256HexOf(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

// ---------------------------------------------------------------------------
// DEMO-001 — fragmented referral across 4 facilities, with a contradiction
// ---------------------------------------------------------------------------
export const DEMO_001_DOCS: FixtureDoc[] = [
  {
    filename: 'referral-letter.pdf',
    mimeType: 'application/pdf',
    recordOrigin: 'external_hospital',
    issuingFacility: 'Sunrise Multispeciality Hospital',
    documentDate: '2025-05-02',
    sourceKind: 'upload',
    pages: [
      `Sunrise Multispeciality Hospital
Department of Surgical Oncology
Date: 2 May 2025
MRN: SUN-448120
Patient referred to Regional Cancer Institute for further management.
She underwent surgery at our centre.
Please review the histopathology report and plan adjuvant therapy.
Appointment on 5 August 2025 at Surgical Oncology OPD.
Records office contact: +91 00000 00000`,
    ],
  },
  {
    filename: 'histopathology-report.pdf',
    mimeType: 'application/pdf',
    recordOrigin: 'diagnostic_lab',
    issuingFacility: 'Meridian Diagnostics Laboratory',
    documentDate: '2025-06-16',
    sourceKind: 'upload',
    pages: [
      `Meridian Diagnostics Laboratory
Histopathology Report
Date: 16 June 2025
MRN: SUN-448120
ABHA: 12-3456-7890-1234
Specimen: Left breast
Modified radical mastectomy performed on 12 June 2025
Diagnosis: Invasive ductal carcinoma, grade 2
Stage as documented: pT2N1M0
The specimen was received in formalin on 13 June 2025.
Tamoxifen 20 mg daily advised to be started after review.`,
    ],
  },
  {
    filename: 'discharge-summary.pdf',
    mimeType: 'application/pdf',
    recordOrigin: 'internal_hospital',
    issuingFacility: 'Regional Cancer Institute',
    documentDate: '2025-07-05',
    sourceKind: 'upload',
    pages: [
      `Regional Cancer Institute
Discharge Summary
Date: 5 July 2025
MRN: RCI-2025-0031
Modified radical mastectomy performed on 3 July 2025
Uneventful recovery, discharged in stable condition
Follow-up on 20 August 2025 in Surgical Oncology OPD.
Bring prior imaging and the histopathology slides at the next visit.`,
    ],
  },
  {
    filename: 'ct-chest-fax.pdf',
    mimeType: 'application/pdf',
    recordOrigin: 'imaging_centre',
    issuingFacility: 'Northgate Imaging Centre',
    documentDate: '2025-06-20',
    sourceKind: 'fax_pdf',
    duplicateGroup: 'ct-chest',
    pages: [
      `Northgate Imaging Centre
Computed tomography report
Date: 20 June 2025
MRN: SUN-448120
CT scan of thorax performed.
No significant abnormality identified in the imaged field.
Report issued to the referring clinician.`,
    ],
  },
  {
    filename: 'ct-chest-refax.pdf',
    mimeType: 'application/pdf',
    recordOrigin: 'imaging_centre',
    issuingFacility: 'Northgate Imaging Centre',
    documentDate: '2025-06-20',
    sourceKind: 'fax_pdf',
    duplicateGroup: 'ct-chest',
    pages: [
      `Northgate Imaging Centre
Computed tomography report
Date: 20 June 2025
MRN: SUN-448120
CT scan of thorax performed.
No significant abnormality identified in the imaged field.
Report issued to the referring clinician.
Refaxed copy 2`,
    ],
  },
  {
    filename: 'prescription-photo.jpg',
    mimeType: 'image/jpeg',
    recordOrigin: 'patient_upload',
    issuingFacility: null,
    documentDate: '2025-07-06',
    sourceKind: 'photo',
    pages: [
      `Prescription
Date: 6 July 2025
MRN: RCI-2025-0031
Tamoxifen 20 mg once daily for five years.
Ondansetron 4 mg as required.
Review in Surgical Oncology OPD.`,
    ],
  },
  {
    filename: 'chemotherapy-sheet.pdf',
    mimeType: 'application/pdf',
    recordOrigin: 'internal_hospital',
    issuingFacility: 'Regional Cancer Institute',
    documentDate: '2025-07-28',
    sourceKind: 'scan',
    pages: [
      `Regional Cancer Institute
Chemotherapy administration record
Date: 28 July 2025
MRN: RCI-2025-0031
Cycle 1 chemotherapy administered.
Doxorubicin and Cyclophosphamide given.
Next chemotherapy cycle scheduled on 18 August 2025.`,
    ],
  },
  {
    filename: 'cbc-report.pdf',
    mimeType: 'application/pdf',
    recordOrigin: 'diagnostic_lab',
    issuingFacility: 'Meridian Diagnostics Laboratory',
    documentDate: '2025-07-26',
    sourceKind: 'upload',
    pages: [
      `Meridian Diagnostics Laboratory
Laboratory Report
Date: 26 July 2025
MRN: SUN-448120
Haemoglobin: 10.2 g/dL
Total leucocyte count: 4200 /uL
Platelet count: 185000 /uL
Report reviewed by the treating team.`,
    ],
  },
  {
    filename: 'appointment-letter.pdf',
    mimeType: 'application/pdf',
    recordOrigin: 'internal_hospital',
    issuingFacility: 'Regional Cancer Institute',
    documentDate: '2025-07-30',
    sourceKind: 'upload',
    pages: [
      `Regional Cancer Institute
Appointment letter
Date: 30 July 2025
MRN: RCI-2025-0031
Appointment on 5 August 2025 with the Surgical Oncology team.
Please bring the previous imaging reports and blood investigation reports.
Consent form to be completed at the records desk before the visit.`,
    ],
  },
];

// ---------------------------------------------------------------------------
// DEMO-002 — staleness: a settled fact reopened by a later document
// ---------------------------------------------------------------------------
export const DEMO_002_DOCS: FixtureDoc[] = [
  {
    filename: 'opd-note-june.pdf',
    mimeType: 'application/pdf',
    recordOrigin: 'internal_hospital',
    issuingFacility: 'Regional Cancer Institute',
    documentDate: '2025-06-10',
    sourceKind: 'upload',
    pages: [
      `Regional Cancer Institute
Outpatient note
Date: 10 June 2025
MRN: RCI-2025-0044
Appointment on 15 July 2025 with the medical oncology team.
Patient advised to continue current medication.`,
    ],
  },
  {
    filename: 'opd-note-july.pdf',
    mimeType: 'application/pdf',
    recordOrigin: 'internal_hospital',
    issuingFacility: 'Regional Cancer Institute',
    documentDate: '2025-07-14',
    sourceKind: 'upload',
    pages: [
      `Regional Cancer Institute
Outpatient note
Date: 14 July 2025
MRN: RCI-2025-0044
Appointment on 22 July 2025 with the medical oncology team.
Previous appointment rescheduled at patient request.`,
    ],
  },
];

// ---------------------------------------------------------------------------
// DEMO-003 — ready
// ---------------------------------------------------------------------------
export const DEMO_003_DOCS: FixtureDoc[] = [
  {
    filename: 'referral-complete.pdf',
    mimeType: 'application/pdf',
    recordOrigin: 'external_hospital',
    issuingFacility: 'Sunrise Multispeciality Hospital',
    documentDate: '2025-04-01',
    sourceKind: 'upload',
    pages: [
      `Sunrise Multispeciality Hospital
Referral note
Date: 1 April 2025
MRN: READY-1001
Patient referred to Regional Cancer Institute.
Appointment on 15 May 2025 at Surgical Oncology OPD.`,
    ],
  },
  {
    filename: 'pathology-complete.pdf',
    mimeType: 'application/pdf',
    recordOrigin: 'diagnostic_lab',
    issuingFacility: 'Meridian Diagnostics Laboratory',
    documentDate: '2025-04-05',
    sourceKind: 'upload',
    pages: [
      `Meridian Diagnostics Laboratory
Histopathology Report
Date: 5 April 2025
MRN: READY-1001
Diagnosis: Invasive ductal carcinoma.
Stage as documented: pT1N0M0`,
    ],
  },
  {
    filename: 'radiology-complete.pdf',
    mimeType: 'application/pdf',
    recordOrigin: 'imaging_centre',
    issuingFacility: 'Northgate Imaging Centre',
    documentDate: '2025-04-08',
    sourceKind: 'upload',
    pages: [
      `Northgate Imaging Centre
Computed tomography report
Date: 8 April 2025
MRN: READY-1001
Computed tomography of the thorax performed.`,
    ],
  },
  {
    filename: 'treatment-summary-complete.pdf',
    mimeType: 'application/pdf',
    recordOrigin: 'internal_hospital',
    issuingFacility: 'Regional Cancer Institute',
    documentDate: '2025-04-20',
    sourceKind: 'upload',
    pages: [
      `Regional Cancer Institute
Treatment summary
Date: 20 April 2025
MRN: READY-1001
Surgical treatment completed.`,
    ],
  },
  {
    filename: 'insurance-authorization.pdf',
    mimeType: 'application/pdf',
    recordOrigin: 'patient_upload',
    issuingFacility: null,
    documentDate: '2025-04-25',
    sourceKind: 'upload',
    pages: [
      `Insurance authorization
Date: 25 April 2025
MRN: READY-1001
Treatment authorization approved.`,
    ],
  },
  {
    filename: 'consent-form.pdf',
    mimeType: 'application/pdf',
    recordOrigin: 'internal_hospital',
    issuingFacility: 'Regional Cancer Institute',
    documentDate: '2025-04-26',
    sourceKind: 'upload',
    pages: [
      `Regional Cancer Institute
Consent form
Date: 26 April 2025
MRN: READY-1001
Consent obtained for records processing.`,
    ],
  },
];
