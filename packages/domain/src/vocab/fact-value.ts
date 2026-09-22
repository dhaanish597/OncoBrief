/**
 * Closed value shapes for evidence facts.
 *
 * Every `evidence_fact.value_json` conforms to one of these. There is
 * deliberately no shape for a computed stage, a risk score, an urgency or a
 * treatment recommendation — the schema has nowhere to put a clinical
 * inference (architecture §18.1).
 */

export type FactValue =
  | { kind: 'date'; date: string }
  | { kind: 'text'; text: string }
  | { kind: 'facility'; name: string }
  | { kind: 'identifier'; system: string; value: string; scope?: string }
  | { kind: 'medication'; name: string; doseText?: string }
  | { kind: 'procedure'; name: string; code?: string }
  | { kind: 'appointment'; date: string; detailText?: string }
  | { kind: 'lab'; name: string; valueText: string; unitText?: string }
  | { kind: 'cycle'; label: string };

export type FactValueKind = FactValue['kind'];

export const FACT_VALUE_KINDS: readonly FactValueKind[] = [
  'date',
  'text',
  'facility',
  'identifier',
  'medication',
  'procedure',
  'appointment',
  'lab',
  'cycle',
] as const;

/** A short human-readable rendering of a value, used in chips and the packet. */
export function renderFactValue(value: FactValue): string {
  switch (value.kind) {
    case 'date':
      return value.date;
    case 'text':
      return value.text;
    case 'facility':
      return value.name;
    case 'identifier':
      return `${value.system}: ${value.value}`;
    case 'medication':
      return value.doseText ? `${value.name} (${value.doseText})` : value.name;
    case 'procedure':
      return value.code ? `${value.name} [${value.code}]` : value.name;
    case 'appointment':
      return value.detailText ? `${value.date} — ${value.detailText}` : value.date;
    case 'lab':
      return value.unitText ? `${value.name}: ${value.valueText} ${value.unitText}` : `${value.name}: ${value.valueText}`;
    case 'cycle':
      return value.label;
  }
}
