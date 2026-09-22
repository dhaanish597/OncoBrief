/**
 * Closed document-type vocabulary (architecture §6.3).
 *
 * Classification is advisory. A `document_type` is never trusted for a
 * consequential action until a human has set `type_confirmed_by`.
 */
export const DOCUMENT_TYPES = [
  'pathology_report',
  'radiology_report',
  'discharge_summary',
  'prescription',
  'lab_report',
  'operative_note',
  'referral_letter',
  'insurance_authorization',
  'consent_form',
  'treatment_summary',
  'appointment_letter',
  'identity_document',
  'external_opinion',
  'other',
] as const;

export type DocumentType = (typeof DOCUMENT_TYPES)[number];

const SET: ReadonlySet<string> = new Set(DOCUMENT_TYPES);

export function isDocumentType(value: string): value is DocumentType {
  return SET.has(value);
}

export const DOCUMENT_TYPE_LABEL: Record<DocumentType, string> = {
  pathology_report: 'Pathology report',
  radiology_report: 'Radiology report',
  discharge_summary: 'Discharge summary',
  prescription: 'Prescription',
  lab_report: 'Laboratory report',
  operative_note: 'Operative note',
  referral_letter: 'Referral letter',
  insurance_authorization: 'Insurance authorization',
  consent_form: 'Consent form',
  treatment_summary: 'Treatment summary',
  appointment_letter: 'Appointment letter',
  identity_document: 'Identity document',
  external_opinion: 'External opinion',
  other: 'Other / unclassified',
};

export type RecordOrigin =
  | 'internal_hospital'
  | 'external_hospital'
  | 'diagnostic_lab'
  | 'imaging_centre'
  | 'patient_upload';

export const RECORD_ORIGIN_LABEL: Record<RecordOrigin, string> = {
  internal_hospital: 'Internal hospital',
  external_hospital: 'External hospital',
  diagnostic_lab: 'Diagnostic lab',
  imaging_centre: 'Imaging centre',
  patient_upload: 'Patient upload',
};
