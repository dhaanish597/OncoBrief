import { toIsoDate, parseReferenceRange, parseSourceFlag, type FactValue } from '@oncobrief/domain';
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
    return toIsoDate(`${m[3]}-${month}-${m[1]!.padStart(2, '0')}`);
  }
  m = DATE_SLASH.exec(token);
  if (m) return toIsoDate(`${m[3]}-${m[2]!.padStart(2, '0')}-${m[1]!.padStart(2, '0')}`);
  m = DATE_ISO.exec(token);
  if (m) return toIsoDate(`${m[1]}-${m[2]}-${m[3]}`);
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
  'Amlodipine', 'Metformin', 'Atorvastatin',
];

const PROCEDURES = [
  'Modified radical mastectomy', 'Radical mastectomy', 'Mastectomy',
  'Lumpectomy', 'Wide local excision', 'Excision biopsy', 'Core biopsy',
  'Incision biopsy', 'FNAC', 'Fine needle aspiration', 'Sentinel lymph node biopsy',
  'Axillary lymph node dissection', 'Lymph node dissection', 'Resection',
  'Port placement', 'Oophorectomy', 'Hysterectomy',
  'Chemotherapy', 'Radiotherapy', 'Radiation therapy',
  'Computed tomography', 'CT scan', 'MRI', 'PET-CT', 'PET scan',
  'Mammography', 'Ultrasound', 'Ultrasonography', 'IHC', 'Histopathology',
];

const FACILITY_RE =
  /\b([A-Z][A-Za-z.'&-]*(?:\s+[A-Z][A-Za-z.'&-]*){0,4}\s+(?:Hospital|Institute|Centre|Center|Clinic|Laboratory|Labs|Diagnostics|HOSPITAL|INSTITUTE|CENTRE|CENTER|CLINIC|LABORATORY|LABS|DIAGNOSTICS))\b/;

function slug(input: string): string {
  return input.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

export class RuleBasedExtractor implements ExtractionPort {
  readonly name = 'rule';
  readonly version = 'v3';

  async extract(input: ExtractionInput): Promise<CandidateDraft[]> {
    const out: CandidateDraft[] = [];
    const seen = new Set<string>();

    const push = (draft: CandidateDraft) => {
      const key = `${draft.factType}\u0000${draft.verbatimQuote}\u0000${draft.observedOn ?? ''}\u0000${JSON.stringify(draft.value)}`;
      if (seen.has(key)) return;
      seen.add(key);
      out.push(draft);
    };

    // Upload metadata can be undated. Use an explicit report/collection date
    // on the same source page, never the upload time or an unrelated page.
    const datesByPage = new Map<string, Set<string>>();
    for (const span of input.spans) {
      if (!/^(?:report\s+date|specimen\s+date|collection\s+date|date)\s*:/i.test(span.text.trim())) continue;
      const date = parseDateToken(span.text);
      if (!date) continue;
      const dates = datesByPage.get(span.pageId) ?? new Set<string>();
      dates.add(date);
      datesByPage.set(span.pageId, dates);
    }
    for (let spanIdx = 0; spanIdx < input.spans.length; spanIdx++) {
      const span = input.spans[spanIdx]!;
      const text = span.text;
      const dates = datesByPage.get(span.pageId);
      const sourceDate = dates?.size === 1 ? [...dates][0]! : input.documentDate;

      // --- identifiers -----------------------------------------------------
      const mrn = /\bMRN[:#\s]*([A-Za-z0-9][A-Za-z0-9/-]{2,})\b/i.exec(text);
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
      } else if (/\bMRN[:#\s]*$/i.test(text.trim())) {
        const nextSpan = input.spans[spanIdx + 1];
        if (nextSpan) {
          const nextMrn = /^\s*([A-Za-z0-9][A-Za-z0-9/-]{2,})\b/.exec(nextSpan.text);
          if (nextMrn) {
            push({
              factType: 'identifier.mrn',
              value: {
                kind: 'identifier',
                system: 'mrn',
                value: nextMrn[1]!,
                ...(input.issuingFacility ? { scope: slug(input.issuingFacility) } : {}),
              },
              verbatimQuote: nextMrn[1]!,
              spanIds: [nextSpan.id],
              confidenceRaw: 0.95,
              extractorName: this.name,
              extractorVersion: this.version,
            });
          }
        }
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
        String.raw`\b(?:Date|Specimen\s*Date|Report\s*Date|Collection\s*Date|Date\s*of\s*Presentation)(?:\s+of\s+[A-Za-z ]{2,24})?[:\s]+(${DATE_PATTERN_SRC})`,
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

      // Explicit pending items and instructions are transcribed, never inferred.
      let hasAdministrativeInstruction = false;
      const investigation = String.raw`(?:IHC|immunohistochemistry|PET-CT|MRI|CT scan|biopsy|histopathology|tumou?r marker|ultrasound|mammography|blood investigation)(?:s)?(?:\s+report)?`;
      const pending = new RegExp(String.raw`\b(?:(?:pending|awaiting|advised|scheduled for|to undergo)\s+${investigation}|${investigation}\s+(?:is\s+)?pending)\b`, 'gi');
      const instruction = /\b(?:please bring|bring|return with|carry)\s+[^.;\n]{5,180}/gi;
      for (const [pattern, factType] of [[pending, 'pending_investigation.recorded'], [instruction, 'instruction.recorded']] as const) {
        for (const match of text.matchAll(pattern)) {
          // Negated phrases are not affirmative instructions or pending work.
          const prefix = text.slice(0, match.index).split(/[.;\n]/).at(-1) ?? '';
          if (/\b(?:no|not|without|never|denies)\b/i.test(prefix)) continue;
          const quote = match[0].trim();
          hasAdministrativeInstruction = true;
          push({ factType, value: { kind: 'text', text: quote }, verbatimQuote: quote,
            spanIds: [span.id], confidenceRaw: 0.85, extractorName: this.name,
            extractorVersion: this.version, observedOn: sourceDate });
        }
      }

      // --- procedures (keyword) -------------------------------------------
      for (const proc of hasAdministrativeInstruction || /\b(?:scheduled|pending|awaiting|advised|to undergo)\b/i.test(text) ? [] : PROCEDURES) {
        const idx = text.toLowerCase().indexOf(proc.toLowerCase());
        if (idx === -1) continue;
        const observed = parseDateToken(text) ?? sourceDate ?? null;
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
        const dose = /^\s*(\d+(?:\.\d+)?\s?(?:mg|mcg|g|IU))\b/.exec(text.slice(idx + drug.length));
        push({
          factType: 'medication.recorded',
          value: { kind: 'medication', name: drug, ...(dose ? { doseText: dose[1]! } : {}) },
          verbatimQuote: text.slice(idx, idx + drug.length + (dose?.[0].length ?? 0)),
          spanIds: [span.id],
          confidenceRaw: 0.88,
          extractorName: this.name,
          extractorVersion: this.version,
          observedOn: parseDateToken(text) ?? sourceDate,
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

      // --- patient baseline demographics (Age, Sex, Height, Weight) --------
      const ageSex = /\b(\d{1,3})\s*(?:Y(?:ears?)?|yrs?)?\s*[/|]\s*(Female|Male|F|M)\b/i.exec(text);
      if (ageSex) {
        const ageNum = parseInt(ageSex[1]!, 10);
        const sexStr = ageSex[2]!;
        if (Number.isFinite(ageNum) && ageNum > 0 && ageNum < 125) {
          push({
            factType: 'lab_result.as_written',
            value: { kind: 'lab', name: 'Age', valueText: String(ageNum), numericValue: ageNum, unitText: 'Years' },
            verbatimQuote: ageSex[1]!,
            spanIds: [span.id],
            confidenceRaw: 0.92,
            extractorName: this.name,
            extractorVersion: this.version,
            observedOn: sourceDate ?? null,
          });
        }
        push({
          factType: 'lab_result.as_written',
          value: { kind: 'lab', name: 'Sex', valueText: sexStr },
          verbatimQuote: ageSex[2]!,
          spanIds: [span.id],
          confidenceRaw: 0.92,
          extractorName: this.name,
          extractorVersion: this.version,
          observedOn: sourceDate,
        });
      }

      const explicitSex = /\b(?:Sex|Gender)\s*[:=]\s*(Female|Male|Other)\b/i.exec(text);
      if (explicitSex) {
        push({
          factType: 'lab_result.as_written',
          value: { kind: 'lab', name: 'Sex', valueText: explicitSex[1]!.trim() },
          verbatimQuote: explicitSex[0]!,
          spanIds: [span.id],
          confidenceRaw: 0.95,
          extractorName: this.name,
          extractorVersion: this.version,
          observedOn: sourceDate ?? null,
        });
      }

      const explicitAge = /\bAge\s*[:=]\s*(\d{1,3})(?:\s*(?:Years?|yrs?|Y))?\b/i.exec(text);
      if (explicitAge) {
        const ageNum = parseInt(explicitAge[1]!, 10);
        if (Number.isFinite(ageNum) && ageNum > 0 && ageNum < 125) {
          push({
            factType: 'lab_result.as_written',
            value: { kind: 'lab', name: 'Age', valueText: String(ageNum), numericValue: ageNum, unitText: 'Years' },
            verbatimQuote: explicitAge[0]!,
            spanIds: [span.id],
            confidenceRaw: 0.95,
            extractorName: this.name,
            extractorVersion: this.version,
            observedOn: sourceDate ?? null,
          });
        }
      }

      const htMatch = /\b(?:Height|Ht)\s*[:=]\s*(\d+(?:\.\d+)?)\s*(cm|m|in)?\b/i.exec(text);
      if (htMatch) {
        const val = parseFloat(htMatch[1]!);
        const unit = htMatch[2];
        push({
          factType: 'vital_sign.as_written',
          value: { kind: 'lab', name: 'Height', valueText: htMatch[1]!, numericValue: val, ...(unit ? { unitText: unit } : {}) },
          verbatimQuote: htMatch[0]!,
          spanIds: [span.id],
          confidenceRaw: 0.95,
          extractorName: this.name,
          extractorVersion: this.version,
          observedOn: sourceDate ?? null,
        });
      }

      const wtMatch = /\b(?:Weight|Wt)\s*[:=]\s*(\d+(?:\.\d+)?)\s*(kg|lbs?)?\b/i.exec(text);
      if (wtMatch) {
        const val = parseFloat(wtMatch[1]!);
        const unit = wtMatch[2];
        push({
          factType: 'vital_sign.as_written',
          value: { kind: 'lab', name: 'Weight', valueText: wtMatch[1]!, numericValue: val, ...(unit ? { unitText: unit } : {}) },
          verbatimQuote: wtMatch[0]!,
          spanIds: [span.id],
          confidenceRaw: 0.95,
          extractorName: this.name,
          extractorVersion: this.version,
          observedOn: sourceDate ?? null,
        });
      }

      // --- categorical observations (blood group, allergies, ecog, biomarkers) ----
      const bloodGroup = /\b(?:Blood\s*(?:Group|Type)(?:\s*(?:and|&)\s*Rh)?)\s*[:=]\s*([ABOab0][\s+-]?(?:Rh\s*)?(?:Positive|Negative|\+ve|-ve|\+|-|[A-Za-z()+\s]+?))\s*(?:\||$)/i.exec(
        text,
      );
      if (bloodGroup) {
        push({
          factType: 'lab_result.as_written',
          value: { kind: 'lab', name: 'Blood Group and Rh', valueText: bloodGroup[1]!.trim() },
          verbatimQuote: bloodGroup[0]!.replace(/\s*\|$/, '').trim(),
          spanIds: [span.id],
          confidenceRaw: 0.95,
          extractorName: this.name,
          extractorVersion: this.version,
          observedOn: sourceDate ?? null,
        });
      }

      const ecog = /\bECOG(?:\s*(?:Performance\s*Status|PS))?\s*[:=]\s*(?:ECOG\s*(?:PS\s*)?)?([0-4])\b/i.exec(text);
      if (ecog) {
        const num = parseInt(ecog[1]!, 10);
        push({
          factType: 'lab_result.as_written',
          value: {
            kind: 'lab',
            name: 'ECOG Performance Status',
            valueText: ecog[1]!.trim(),
            numericValue: Number.isFinite(num) ? num : undefined,
          },
          verbatimQuote: ecog[0]!,
          spanIds: [span.id],
          confidenceRaw: 0.95,
          extractorName: this.name,
          extractorVersion: this.version,
          observedOn: sourceDate ?? null,
        });
      }

      const allergy = /\b(?:Allerg(?:ies|y))\s*[:=]\s*([A-Za-z0-9 ,/()+-]+?)\s*(?:\||$)/i.exec(text);
      if (allergy) {
        push({
          factType: 'lab_result.as_written',
          value: { kind: 'lab', name: 'Documented Allergies', valueText: allergy[1]!.trim() },
          verbatimQuote: allergy[0]!.replace(/\s*\|$/, '').trim(),
          spanIds: [span.id],
          confidenceRaw: 0.95,
          extractorName: this.name,
          extractorVersion: this.version,
          observedOn: sourceDate ?? null,
        });
      }

      const nkda = /\b(?:No\s+known\s+drug\s+allergies|NKDA)\b/i.exec(text);
      if (nkda && !allergy) {
        push({
          factType: 'lab_result.as_written',
          value: { kind: 'lab', name: 'Documented Allergies', valueText: nkda[0]!.trim() },
          verbatimQuote: nkda[0]!,
          spanIds: [span.id],
          confidenceRaw: 0.9,
          extractorName: this.name,
          extractorVersion: this.version,
          observedOn: sourceDate ?? null,
        });
      }

      const comorb = /\b(?:Relevant\s+)?(?:Comorbidit(?:ies|y)|Past\s+medical\s+history)\s*[:=]\s*([A-Za-z0-9 ,/()+-]+?)\s*(?:\||$)/i.exec(text);
      if (comorb) {
        push({
          factType: 'lab_result.as_written',
          value: { kind: 'lab', name: 'Relevant Comorbidities', valueText: comorb[1]!.trim() },
          verbatimQuote: comorb[0]!.replace(/\s*\|$/, '').trim(),
          spanIds: [span.id],
          confidenceRaw: 0.95,
          extractorName: this.name,
          extractorVersion: this.version,
          observedOn: sourceDate ?? null,
        });
      }

      // --- pathology diagnosis and staging text -------------------------
      const diagMatch = /^\s*(?:Diagnosis|Histological\s*Diagnosis|Histopathology\s*Diagnosis|Impression)\s*[:=]\s*(.+)$/i.exec(text);
      if (diagMatch && !/^(?:Stage|See|Refer|Tamoxifen|Please)/i.test(diagMatch[1]!.trim())) {
        push({
          factType: 'diagnosis_text.as_written',
          value: { kind: 'text', text: diagMatch[1]!.trim() },
          verbatimQuote: diagMatch[0]!,
          spanIds: [span.id],
          confidenceRaw: 0.92,
          extractorName: this.name,
          extractorVersion: this.version,
          observedOn: sourceDate ?? null,
        });
      }

      const stageMatch = /^\s*(?:Stage(?:\s*as\s*documented)?|Documented\s*Stage|Pathological\s*Stage)\s*[:=]\s*(.+)$/i.exec(text);
      if (stageMatch) {
        push({
          factType: 'stage_text.as_written',
          value: { kind: 'text', text: stageMatch[1]!.trim() },
          verbatimQuote: stageMatch[0]!,
          spanIds: [span.id],
          confidenceRaw: 0.92,
          extractorName: this.name,
          extractorVersion: this.version,
          observedOn: sourceDate ?? null,
        });
      }

      const erBiomarker = /\b(?:Estrogen\s+receptor(?:\s*\([^)]*\))?|ER)\s*[:=]\s*(Positive|Negative|Equivocal|Weakly\s+Positive|[\d.%]+)(?:\s*\([^)]*\))?/i.exec(text);
      if (erBiomarker) {
        const valText = erBiomarker[0]!.split(/[:=]/).slice(1).join(':').trim();
        push({
          factType: 'lab_result.as_written',
          value: { kind: 'lab', name: 'Estrogen Receptor (ER)', valueText: valText },
          verbatimQuote: erBiomarker[0]!,
          spanIds: [span.id],
          confidenceRaw: 0.9,
          extractorName: this.name,
          extractorVersion: this.version,
          observedOn: sourceDate ?? null,
        });
      }

      const prBiomarker = /\b(?:Progesterone\s+receptor(?:\s*\([^)]*\))?|PR)\s*[:=]\s*(Positive|Negative|Equivocal|Weakly\s+Positive|[\d.%]+)(?:\s*\([^)]*\))?/i.exec(text);
      if (prBiomarker) {
        const valText = prBiomarker[0]!.split(/[:=]/).slice(1).join(':').trim();
        push({
          factType: 'lab_result.as_written',
          value: { kind: 'lab', name: 'Progesterone Receptor (PR)', valueText: valText },
          verbatimQuote: prBiomarker[0]!,
          spanIds: [span.id],
          confidenceRaw: 0.9,
          extractorName: this.name,
          extractorVersion: this.version,
          observedOn: sourceDate ?? null,
        });
      }

      const her2Biomarker = /\b(?:HER2(?:\/neu)?)\s*[:=]\s*(Positive|Negative|Equivocal)(?:\s*\([^)]*\))?/i.exec(text);
      if (her2Biomarker) {
        const valText = her2Biomarker[0]!.split(/[:=]/).slice(1).join(':').trim();
        push({
          factType: 'lab_result.as_written',
          value: { kind: 'lab', name: 'HER2 / neu Receptor', valueText: valText },
          verbatimQuote: her2Biomarker[0]!,
          spanIds: [span.id],
          confidenceRaw: 0.9,
          extractorName: this.name,
          extractorVersion: this.version,
          observedOn: sourceDate ?? null,
        });
      }

      const ki67Biomarker = /\b(?:Ki[\s-]?67(?:\s*index|\s*labeling\s*index|\s*proliferation\s*index)?)\s*[:=]\s*([<>]?\s*\d+(?:\.\d+)?\s*%?(?:\s*\([^)]*\))?)/i.exec(text);
      if (ki67Biomarker) {
        const valText = ki67Biomarker[0]!.split(/[:=]/).slice(1).join(':').trim();
        const numMatch = /(\d+(?:\.\d+)?)/.exec(valText);
        const numericValue = numMatch ? parseFloat(numMatch[1]!) : undefined;
        push({
          factType: 'lab_result.as_written',
          value: { kind: 'lab', name: 'Ki-67 Proliferation Index', valueText: valText, numericValue, unitText: '%' },
          verbatimQuote: ki67Biomarker[0]!,
          spanIds: [span.id],
          confidenceRaw: 0.9,
          extractorName: this.name,
          extractorVersion: this.version,
          observedOn: sourceDate ?? null,
        });
      }

      // --- lab results and quantitative observations (with units, reference ranges, and flags) ---
      const isHeaderRow =
        /\b(?:TEST(?:\s+NAME)?|INVESTIGATION|PARAMETER)\b/i.test(text) &&
        /\b(?:RESULT|VALUE|OBSERVED)\b/i.test(text);

      if (!isHeaderRow && !htMatch && !wtMatch && !ecog && !ki67Biomarker) {
        // Try colon/equal separated first: Name: Value Unit (Ref) Flag
        let labMatch = /^\s*([A-Za-z0-9][A-Za-z0-9 /()+-]{1,45}?)\s*[:=]\s*([<>]?\s*[\d,]+(?:\.\d+)?(?:\/\d+(?:\.\d+)?)?)\s*([A-Za-z/%\u00B5^0-9]{0,12})?(?:\s*([([][^)\r\n]+[)\]]|[\d,]+(?:\.\d+)?\s*(?:-|to)\s*[\d,]+(?:\.\d+)?|<[\d,.]+|>[\d,.]+))?(?:\s+([A-Za-z*[\]]{1,10}))?/i.exec(
          text,
        );

        // Try tabular match (2 or more spaces separating columns)
        if (!labMatch) {
          labMatch = /^\s*([A-Za-z0-9][A-Za-z0-9 /()+-]{1,45}?)\s{2,}([<>]?\s*[\d,]+(?:\.\d+)?)\s+([A-Za-z/%\u00B5^0-9]{1,12})?(?:\s+([([][^)\r\n]+[)\]]|[\d,]+(?:\.\d+)?\s*(?:-|to)\s*[\d,]+(?:\.\d+)?|<[\d,.]+|>[\d,.]+))?(?:\s+([A-Za-z*[\]]{1,10}))?/i.exec(
            text,
          );
        }

        // Also fallback to inline regex for lines where test name is preceded by something or simple format
        if (!labMatch) {
          labMatch = /\b([A-Z][A-Za-z0-9 /()+-]{1,32}?)\s*[:=]\s*([<>]?\s*[\d,]+(?:\.\d+)?(?:\/\d+(?:\.\d+)?)?)\s*([A-Za-z/%\u00B5^0-9]{0,10})(?:\s*([([][^)\r\n]+[)\]]))?(?:\s*([A-Za-z*]{1,8}))?\b/.exec(
            text,
          );
        }

        if (
          labMatch &&
          !/^(Date|Specimen\s*Date|Report\s*Date|Collection\s*Date|Date\s*of\s*Presentation|Admission\s*Date|Discharge\s*Date|MRN|ABHA|Phone|Contact|Ref|Reference|Age|Sex|Gender|Patient|Doctor|Dr|Time|Sample|Page|Test\s*Name|Total Entries|Resource ID)$/i.test(
            labMatch[1]!.trim(),
          )
        ) {
          const rawName = labMatch[1]!.trim();
          const rawVal = labMatch[2]!.trim();
          const rawUnit = labMatch[3]?.trim();
          const rawRef = labMatch[4]?.trim();
          const rawFlag = labMatch[5]?.trim();

          const numVal = parseFloat(rawVal.replace(/,/g, '').replace(/[<>]/g, ''));
          const refRange = parseReferenceRange(rawRef);
          const flag = parseSourceFlag(rawFlag);

          const value: FactValue = {
            kind: 'lab',
            name: rawName,
            valueText: rawVal,
            ...(rawUnit ? { unitText: rawUnit } : {}),
            ...(Number.isFinite(numVal) ? { numericValue: numVal } : {}),
            ...(refRange ? { referenceRange: refRange } : {}),
            ...(flag ? { flag } : {}),
            ...(sourceDate ? { reportDate: sourceDate } : {}),
          };

          push({
            factType: /^(?:weight|height|blood pressure|pulse|heart rate|temperature|oxygen saturation|SpO2)$/i.test(rawName) ? 'vital_sign.as_written' : 'lab_result.as_written',
            value,
            verbatimQuote: labMatch[0]!,
            spanIds: [span.id],
            confidenceRaw: 0.85,
            extractorName: this.name,
            extractorVersion: this.version,
            observedOn: sourceDate ?? null,
          });
        }
      }
    }

    return out;
  }
}
