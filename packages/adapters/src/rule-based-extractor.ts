import type { FactValue } from '@oncobrief/domain';
import type { CandidateDraft, ExtractionInput, ExtractionPort } from '@oncobrief/ports';

/**
 * Deterministic, rule-based extractor (ADR 0004).
 *
 * Dates, MRNs, ABHA ids, facility names, drug names from a controlled
 * vocabulary and section headers in Indian oncology reports are high-structure
 * targets where regex plus a dictionary outperforms a language model on cost,
 * latency, determinism and testability.
 *
 * Every candidate's `verbatimQuote` is the exact matched substring of a single
 * span, so the span-validation gate (§5.2) can only pass if the text really is
 * in the document. The extractor proposes; the promoter disposes.
 */

const MONTHS: Record<string, string> = {
  jan: '01', january: '01',
  feb: '02', february: '02',
  mar: '03', march: '03',
  apr: '04', april: '04',
  may: '05',
  jun: '06', june: '06',
  jul: '07', july: '07',
  aug: '08', august: '08',
  sep: '09', sept: '09', september: '09',
  oct: '10', october: '10',
  nov: '11', november: '11',
  dec: '12', december: '12',
};

const DATE_WORD = /(\d{1,2})[\s\u00A0-]+([A-Za-z]{3,9})[\s\u00A0,-]+(\d{4})/;
const DATE_SLASH = /(\d{1,2})\/(\d{1,2})\/(\d{4})/;
const DATE_ISO = /(\d{4})-(\d{2})-(\d{2})/;

export function parseDateToken(token: string): string | null {
  let m = DATE_WORD.exec(token);
  if (m) {
    const month = MONTHS[m[2]!.toLowerCase()];
    if (!month) return null;
    return `${m[3]}-${month}-${m[1]!.padStart(2, '0')}`;
  }
  m = DATE_SLASH.exec(token);
  if (m) return `${m[3]}-${m[2]!.padStart(2, '0')}-${m[1]!.padStart(2, '0')}`;
  m = DATE_ISO.exec(token);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  return null;
}

const DATE_PATTERN_SRC =
  String.raw`\d{1,2}[\s\u00A0-]+(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t|tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)[\s\u00A0,-]+\d{4}` +
  String.raw`|\d{1,2}\/\d{1,2}\/\d{4}` +
  String.raw`|\d{4}-\d{2}-\d{2}`;

const MEDICATIONS = [
  'Tamoxifen', 'Letrozole', 'Anastrozole', 'Exemestane',
  'Trastuzumab', 'Pertuzumab', 'Docetaxel', 'Paclitaxel',
  'Doxorubicin', 'Epirubicin', 'Cyclophosphamide', 'Carboplatin',
  'Cisplatin', 'Fluorouracil', '5-Fluorouracil', 'Capecitabine',
  'Methotrexate', 'Rituximab', 'Bevacizumab', 'Imatinib',
  'Gemcitabine', 'Vinorelbine', 'Etoposide', 'Prednisolone',
  'Dexamethasone', 'Ondansetron', 'Filgrastim',
];

const PROCEDURES = [
  'Modified radical mastectomy', 'Radical mastectomy', 'Mastectomy',
  'Lumpectomy', 'Wide local excision', 'Excision biopsy', 'Core biopsy',
  'Incision biopsy', 'FNAC', 'Fine needle aspiration', 'Sentinel lymph node biopsy',
  'Axillary lymph node dissection', 'Lymph node dissection', 'Resection',
  'Port placement', 'Oophorectomy', 'Hysterectomy',
  'Chemotherapy', 'Radiotherapy', 'Radiation therapy',
  'Computed tomography', 'CT scan', 'MRI', 'PET-CT', 'PET scan',
  'Mammography', 'Ultrasound', 'Ultrasonography',
];

const FACILITY_RE = /\b([A-Z][A-Za-z.'&-]*(?:\s+[A-Z][A-Za-z.'&-]*){0,4}\s+(?:Hospital|Institute|Centre|Center|Clinic|Laboratory|Labs|Diagnostics))\b/;

function slug(input: string): string {
  return input.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

export class RuleBasedExtractor implements ExtractionPort {
  readonly name = 'rule';
  readonly version = 'v2';

  async extract(input: ExtractionInput): Promise<CandidateDraft[]> {
    const out: CandidateDraft[] = [];
    const seen = new Set<string>();

    const push = (draft: CandidateDraft) => {
      const key = `${draft.factType}\u0000${draft.verbatimQuote}`;
      if (seen.has(key)) return;
      seen.add(key);
      out.push(draft);
    };

    for (const span of input.spans) {
      const text = span.text;

      // --- identifiers -----------------------------------------------------
      const mrn = /\bMRN[:#\s]*([A-Za-z0-9][A-Za-z0-9/-]{2,})\b/.exec(text);
      if (mrn) {
        push({
          factType: 'identifier.mrn',
          value: {
            kind: 'identifier',
            system: 'mrn',
            value: mrn[1]!,
            ...(input.issuingFacility ? { scope: slug(input.issuingFacility) } : {}),
          },
          verbatimQuote: mrn[0]!,
          spanIds: [span.id],
          confidenceRaw: 0.95,
          extractorName: this.name,
          extractorVersion: this.version,
        });
      }

      const abha = /\bABHA[:#\s]*(\d{2}-\d{4}-\d{4}-\d{4})\b/.exec(text);
      if (abha) {
        push({
          factType: 'identifier.abha',
          value: { kind: 'identifier', system: 'abha', value: abha[1]! },
          verbatimQuote: abha[0]!,
          spanIds: [span.id],
          confidenceRaw: 0.97,
          extractorName: this.name,
          extractorVersion: this.version,
        });
      }

      // --- document date (labelled) ---------------------------------------
      const labelledDate = new RegExp(
        String.raw`\bDate(?:\s+of\s+[A-Za-z ]{2,24})?[:\s]+(${DATE_PATTERN_SRC})`,
        'i',
      ).exec(text);
      if (labelledDate) {
        const iso = parseDateToken(labelledDate[1]!);
        if (iso) {
          push({
            factType: 'document.date',
            value: { kind: 'date', date: iso },
            verbatimQuote: labelledDate[0]!,
            spanIds: [span.id],
            confidenceRaw: 0.93,
            extractorName: this.name,
            extractorVersion: this.version,
            observedOn: iso,
          });
        }
      }

      // --- follow-up / appointment ----------------------------------------
      const followup = new RegExp(
        String.raw`\b(?:follow[\s-]?up|review|next visit)\s+(?:on|dated|scheduled on)\s+(${DATE_PATTERN_SRC})`,
        'i',
      ).exec(text);
      if (followup) {
        const iso = parseDateToken(followup[1]!);
        if (iso) {
          push({
            factType: 'followup.recorded',
            value: { kind: 'date', date: iso },
            verbatimQuote: followup[0]!,
            spanIds: [span.id],
            confidenceRaw: 0.9,
            extractorName: this.name,
            extractorVersion: this.version,
            observedOn: iso,
          });
        }
      }

      const appointment = new RegExp(
        String.raw`\bappointment\s+(?:on|dated|scheduled on)\s+(${DATE_PATTERN_SRC})`,
        'i',
      ).exec(text);
      if (appointment) {
        const iso = parseDateToken(appointment[1]!);
        if (iso) {
          push({
            factType: 'appointment.recorded',
            value: { kind: 'appointment', date: iso },
            verbatimQuote: appointment[0]!,
            spanIds: [span.id],
            confidenceRaw: 0.9,
            extractorName: this.name,
            extractorVersion: this.version,
            observedOn: iso,
          });
        }
      }

      // --- procedures (keyword) -------------------------------------------
      for (const proc of PROCEDURES) {
        const idx = text.toLowerCase().indexOf(proc.toLowerCase());
        if (idx === -1) continue;
        const observed = parseDateToken(text) ?? input.documentDate ?? null;
        push({
          factType: 'procedure.recorded',
          value: { kind: 'procedure', name: proc },
          verbatimQuote: text.slice(idx, idx + proc.length),
          spanIds: [span.id],
          confidenceRaw: 0.85,
          extractorName: this.name,
          extractorVersion: this.version,
          observedOn: observed,
        });
        break;
      }

      // --- medications (controlled vocabulary) ----------------------------
      for (const drug of MEDICATIONS) {
        const idx = text.toLowerCase().indexOf(drug.toLowerCase());
        if (idx === -1) continue;
        // Capture an adjacent dose if one is written next to the name.
        const dose = /(\d+(?:\.\d+)?\s?(?:mg|mcg|g|IU))/.exec(text.slice(idx));
        push({
          factType: 'medication.recorded',
          value: { kind: 'medication', name: drug, ...(dose ? { doseText: dose[1]! } : {}) },
          verbatimQuote: text.slice(idx, idx + drug.length),
          spanIds: [span.id],
          confidenceRaw: 0.88,
          extractorName: this.name,
          extractorVersion: this.version,
          observedOn: input.documentDate,
        });
      }

      // --- issuing facility ------------------------------------------------
      const facility = FACILITY_RE.exec(text);
      if (facility) {
        push({
          factType: 'document.issuing_facility',
          value: { kind: 'facility', name: facility[1]! },
          verbatimQuote: facility[0]!,
          spanIds: [span.id],
          confidenceRaw: 0.8,
          extractorName: this.name,
          extractorVersion: this.version,
        });
      }

      // --- lab result as written -------------------------------------------
      const lab = /\b([A-Z][A-Za-z0-9 /-]{2,28}?)\s*[:=]\s*([<>]?\d+(?:\.\d+)?)\s*([A-Za-z/%\u00B5]{0,6})\b/.exec(
        text,
      );
      if (lab && !/^(Date|MRN|ABHA|Age|Phone|Contact)$/i.test(lab[1]!.trim())) {
        const unit = lab[3]?.trim();
        const value: FactValue = {
          kind: 'lab',
          name: lab[1]!.trim(),
          valueText: lab[2]!,
          ...(unit ? { unitText: unit } : {}),
        };
        push({
          factType: 'lab_result.as_written',
          value,
          verbatimQuote: lab[0]!,
          spanIds: [span.id],
          confidenceRaw: 0.72,
          extractorName: this.name,
          extractorVersion: this.version,
          observedOn: input.documentDate,
        });
      }
    }

    return out;
  }
}
