import type { FactValue } from './fact-value.js';

/**
 * The closed `fact_type` vocabulary (architecture §4.2).
 *
 * Every entry is either an administrative attribute or a verbatim
 * transcription of text that already exists in the source document. The
 * `.as_written` suffix is load-bearing: it states that the system copied a
 * string because the document said it, and did not compute, validate or
 * interpret it.
 *
 * Adding an entry requires a new decision record (docs/decisions/README.md).
 */
export const FACT_TYPES = [
  'document.date',
  'document.issuing_facility',
  'document.type_as_written',
  'procedure.recorded',
  'medication.recorded',
  'appointment.recorded',
  'diagnosis_text.as_written',
  'stage_text.as_written',
  'lab_result.as_written',
  'imaging.recorded',
  'radiation.recorded',
  'chemotherapy_cycle.recorded',
  'referral.recorded',
  'followup.recorded',
  'consent.recorded',
  'identifier.mrn',
  'identifier.abha',
] as const;

export type FactType = (typeof FACT_TYPES)[number];

const FACT_TYPE_SET: ReadonlySet<string> = new Set(FACT_TYPES);

export function isFactType(value: string): value is FactType {
  return FACT_TYPE_SET.has(value);
}

export function assertFactType(value: string): FactType {
  if (!isFactType(value)) {
    throw new Error(`unknown_fact_type:${value}`);
  }
  return value;
}

/**
 * The `value_json.kind` a fact type must carry. Used by the promoter and the
 * extractor to reject a structurally impossible candidate before it can reach
 * the ledger.
 */
export const FACT_TYPE_VALUE_KIND: Record<FactType, FactValue['kind']> = {
  'document.date': 'date',
  'document.issuing_facility': 'facility',
  'document.type_as_written': 'text',
  'procedure.recorded': 'procedure',
  'medication.recorded': 'medication',
  'appointment.recorded': 'appointment',
  'diagnosis_text.as_written': 'text',
  'stage_text.as_written': 'text',
  'lab_result.as_written': 'lab',
  'imaging.recorded': 'procedure',
  'radiation.recorded': 'procedure',
  'chemotherapy_cycle.recorded': 'cycle',
  'referral.recorded': 'text',
  'followup.recorded': 'date',
  'consent.recorded': 'date',
  'identifier.mrn': 'identifier',
  'identifier.abha': 'identifier',
};

/**
 * Human-facing label. Deliberately neutral and administrative — a label is a
 * display string, never a clinical interpretation.
 */
export const FACT_TYPE_LABEL: Record<FactType, string> = {
  'document.date': 'Document date',
  'document.issuing_facility': 'Issuing facility',
  'document.type_as_written': 'Document type',
  'procedure.recorded': 'Procedure recorded',
  'medication.recorded': 'Medication recorded',
  'appointment.recorded': 'Appointment recorded',
  'diagnosis_text.as_written': 'Diagnosis text (as written)',
  'stage_text.as_written': 'Stage text (as written)',
  'lab_result.as_written': 'Lab result (as written)',
  'imaging.recorded': 'Imaging recorded',
  'radiation.recorded': 'Radiation recorded',
  'chemotherapy_cycle.recorded': 'Chemotherapy cycle recorded',
  'referral.recorded': 'Referral recorded',
  'followup.recorded': 'Follow-up date recorded',
  'consent.recorded': 'Consent recorded',
  'identifier.mrn': 'MRN',
  'identifier.abha': 'ABHA',
};

/**
 * The conflict-grouping qualifier (architecture §8.1).
 *
 * Two facts can only contradict each other if they describe the same thing.
 * `slot_key = fact_type + '|' + qualifier`, and the qualifier is fact-type
 * specific. Facts that share `(patient_id, slot_key)` are comparison
 * candidates; nothing else is ever compared.
 */
export function slotQualifier(factType: FactType, value: FactValue): string {
  switch (factType) {
    case 'document.date':
    case 'followup.recorded':
    case 'consent.recorded':
      return 'document';
    case 'document.issuing_facility':
      return 'facility';
    case 'document.type_as_written':
      return 'type';
    case 'procedure.recorded':
      return value.kind === 'procedure'
        ? `proc:${value.code ?? normalizeKey(value.name)}`
        : 'procedure';
    case 'medication.recorded':
      return value.kind === 'medication' ? `drug:${normalizeKey(value.name)}` : 'medication';
    case 'appointment.recorded':
      return 'appointment';
    case 'diagnosis_text.as_written':
      return 'diagnosis';
    case 'stage_text.as_written':
      return 'stage';
    case 'lab_result.as_written':
      return value.kind === 'lab' ? `lab:${normalizeKey(value.name)}` : 'lab';
    case 'imaging.recorded':
      return value.kind === 'procedure' ? `imaging:${normalizeKey(value.name)}` : 'imaging';
    case 'radiation.recorded':
      return 'radiation';
    case 'chemotherapy_cycle.recorded':
      return value.kind === 'cycle' ? `cycle:${normalizeKey(value.label)}` : 'cycle';
    case 'referral.recorded':
      return 'referral';
    case 'identifier.mrn':
      // An MRN is assigned per issuing facility, so two facilities legitimately
      // use different MRNs for the same patient. Scoping the slot by facility
      // keeps same-facility agreement visible without manufacturing a
      // cross-facility "conflict" that no human should have to resolve.
      return value.kind === 'identifier' ? `id:mrn:${value.scope ?? 'unscoped'}` : 'id:mrn';
    case 'identifier.abha':
      return 'id:abha';
  }
}

export function makeSlotKey(factType: FactType, value: FactValue): string {
  return `${factType}|${slotQualifier(factType, value)}`;
}

function normalizeKey(input: string): string {
  return input.trim().toLowerCase().replace(/\s+/g, ' ');
}
