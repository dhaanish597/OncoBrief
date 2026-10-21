import { normalizeForComparison } from './normalize';
import { DOCUMENT_TYPE_LABEL } from '../vocab/document-types';

/**
 * Verbatim-span validation — the central safety gate (architecture §5.2).
 *
 * No `evidence_fact` may be inserted unless this deterministic check passes:
 *   1. Stage A (Quote-in-Span Verification):
 *      - Concatenate the linked spans' text in ordinal order.
 *      - Confirm normalized verbatimQuote is an exact contiguous substring.
 *      - Confirm all linked spans exist and compute bbox union and min confidence.
 *   2. Stage B (Value-in-Quote Deterministic Entailment):
 *      - Date entailment: ISO date YYYY-MM-DD matches ISO, numeric, or localized month name.
 *      - Numeric/Lab entailment: Exact numeric token and stated unit appear in quote.
 *      - String/Facility entailment: >= 75% of significant tokens appear in quote or vocab synonym matches.
 *   3. Confidence Routing:
 *      - If Stage A or B fails -> { valid: false, stageFailed: 'STAGE_A' | 'STAGE_B', reason }
 *      - If valid and minOcrConfidence < 0.85 -> { valid: true, recommendedState: 'needs_review' }
 *      - If valid and minOcrConfidence >= 0.85 -> { valid: true, recommendedState: 'extracted' }
 */

export interface SpanForValidation {
  id: string;
  documentId: string;
  pageId?: string;
  pageNumber?: number;
  lineIndex?: number;
  spanIndex?: number;
  text: string;
  bbox?: { x: number; y: number; w: number; h: number };
  ocrConfidence?: number | null;
}

export type SpanValidationError =
  | { code: 'no_spans' }
  | { code: 'empty_quote' }
  | { code: 'cross_page' }
  | { code: 'cross_document' }
  | { code: 'span_mismatch'; normalizedQuote: string; normalizedSpans: string };

export type SpanValidationResult =
  | { ok: true; concatenated: string }
  | { ok: false; error: SpanValidationError };

export function validateSpans(
  quote: string,
  spans: readonly SpanForValidation[],
): SpanValidationResult {
  if (spans.length === 0) return { ok: false, error: { code: 'no_spans' } };
  if (quote.trim().length === 0) return { ok: false, error: { code: 'empty_quote' } };

  const first = spans[0]!;
  for (const s of spans) {
    if (s.documentId !== first.documentId) {
      return { ok: false, error: { code: 'cross_document' } };
    }
    if (first.pageId && s.pageId && s.pageId !== first.pageId) {
      return { ok: false, error: { code: 'cross_page' } };
    }
  }

  const concatenated = spans.map((s) => s.text).join(' ');
  const normalizedSpans = normalizeForComparison(concatenated);
  const normalizedQuote = normalizeForComparison(quote);

  if (!normalizedSpans.includes(normalizedQuote)) {
    return {
      ok: false,
      error: { code: 'span_mismatch', normalizedQuote, normalizedSpans },
    };
  }

  return { ok: true, concatenated };
}

export function isSpanMismatch(
  result: SpanValidationResult,
): result is { ok: false; error: { code: 'span_mismatch'; normalizedQuote: string; normalizedSpans: string } } {
  return !result.ok && result.error.code === 'span_mismatch';
}

// --- Stage B Deterministic Value Entailment ---

const MONTH_NAMES: Record<string, string[]> = {
  '01': ['jan', 'january'],
  '02': ['feb', 'february'],
  '03': ['mar', 'march'],
  '04': ['apr', 'april'],
  '05': ['may'],
  '06': ['jun', 'june'],
  '07': ['jul', 'july'],
  '08': ['aug', 'august'],
  '09': ['sep', 'sept', 'september'],
  '10': ['oct', 'october'],
  '11': ['nov', 'november'],
  '12': ['dec', 'december'],
};

const STOP_WORDS = new Set(['the', 'and', 'for', 'with', 'from', 'this', 'that', 'was', 'were', 'has', 'have', 'had', 'are']);

export function verifyDateInQuote(isoDate: string, quote: string): boolean {
  const normQuote = normalizeForComparison(quote).toLowerCase();
  const trimmed = isoDate.trim();

  // 1. Direct ISO match: 2026-05-14
  if (normQuote.includes(trimmed.toLowerCase())) return true;

  const match = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return false;

  const year = match[1]!;
  const month = match[2]!;
  const day = match[3]!;
  const dInt = parseInt(day, 10);
  const mInt = parseInt(month, 10);

  // 2. Numeric formats: DD/MM/YYYY, DD-MM-YYYY, DD.MM.YYYY, YYYY/MM/DD
  const numericVariants = [
    `${day}/${month}/${year}`,
    `${dInt}/${mInt}/${year}`,
    `${day}-${month}-${year}`,
    `${dInt}-${mInt}-${year}`,
    `${day}.${month}.${year}`,
    `${dInt}.${mInt}.${year}`,
    `${year}/${month}/${day}`,
    `${year}-${month}-${day}`,
  ];

  for (const v of numericVariants) {
    if (normQuote.includes(v.toLowerCase())) return true;
  }

  // 3. Month name formats: 14 May 2026, May 14, 2026, 14-May-2026
  const monthVariants = MONTH_NAMES[month] ?? [];
  for (const mName of monthVariants) {
    const namedVariants = [
      `${day} ${mName} ${year}`,
      `${dInt} ${mName} ${year}`,
      `${mName} ${day}, ${year}`,
      `${mName} ${dInt}, ${year}`,
      `${mName} ${day} ${year}`,
      `${mName} ${dInt} ${year}`,
      `${day}-${mName}-${year}`,
      `${dInt}-${mName}-${year}`,
    ];
    for (const v of namedVariants) {
      if (normQuote.includes(v.toLowerCase())) return true;
    }
  }

  return false;
}

export function verifyLabValueInQuote(
  value: unknown,
  quote: string,
): boolean {
  const normQuote = normalizeForComparison(quote);

  let numStr = '';
  let unitStr = '';

  if (typeof value === 'object' && value !== null) {
    const valObj = value as Record<string, unknown>;
    if (valObj['value'] !== undefined) numStr = String(valObj['value']).trim();
    if (valObj['numeric'] !== undefined) numStr = String(valObj['numeric']).trim();
    if (valObj['unit'] !== undefined) unitStr = String(valObj['unit']).trim();
  } else if (typeof value === 'string' || typeof value === 'number') {
    const str = String(value).trim();
    const match = str.match(/^([\d.,]+)\s*(.*)$/);
    if (match) {
      numStr = match[1] ?? '';
      unitStr = match[2] ?? '';
    } else {
      numStr = str;
    }
  }

  if (!numStr) return false;

  // Verify numeric token exists
  if (!normQuote.includes(numStr)) {
    return false;
  }

  // If unit is specified, verify unit token exists in quote
  if (unitStr) {
    const normUnit = normalizeForComparison(unitStr);
    if (!normQuote.includes(normUnit)) {
      return false;
    }
  }

  return true;
}

export function verifyTokensOrVocabInQuote(
  value: string,
  quote: string,
): boolean {
  const normQuote = normalizeForComparison(quote).toLowerCase();
  const normVal = normalizeForComparison(value).toLowerCase();

  // Direct substring match
  if (normQuote.includes(normVal)) return true;

  // Registered document/procedure vocab match
  for (const [code, label] of Object.entries(DOCUMENT_TYPE_LABEL)) {
    if (normVal === code.toLowerCase() || normVal === (label as string).toLowerCase()) {
      if (normQuote.includes((label as string).toLowerCase()) || normQuote.includes(code.replace(/_/g, ' '))) {
        return true;
      }
    }
  }

  // Tokenize significant alphanumeric words (>= 3 chars, excluding stop words)
  const tokens = normVal
    .split(/[^a-z0-9]+/i)
    .filter((w) => w.length >= 3 && !STOP_WORDS.has(w));

  if (tokens.length === 0) {
    return normQuote.includes(normVal);
  }

  let matched = 0;
  for (const t of tokens) {
    if (normQuote.includes(t)) matched++;
  }

  return matched / tokens.length >= 0.75;
}

export interface CandidateProvenanceInput {
  factType?: string;
  value: unknown;
  verbatimQuote: string;
  spanIds: string[];
}

export interface CandidateValidationOutput {
  valid: boolean;
  stageFailed?: 'STAGE_A' | 'STAGE_B';
  reason?: string;
  recommendedState?: 'extracted' | 'needs_review';
  bboxUnion?: { x: number; y: number; w: number; h: number };
  minOcrConfidence?: number;
}

/**
 * Two-stage safety gate with deterministic entailment and confidence routing.
 * (Asgari et al., 2025; Huang et al., 2024; Gero et al., 2023)
 */
export function validateCandidateProvenance(
  candidate: CandidateProvenanceInput,
  availableSpans: readonly SpanForValidation[],
): CandidateValidationOutput {
  // --- STAGE A: Quote-in-Span Verification ---
  if (!candidate.spanIds || candidate.spanIds.length === 0) {
    return { valid: false, stageFailed: 'STAGE_A', reason: 'No spanIds linked' };
  }

  const spanMap = new Map<string, SpanForValidation>();
  for (const s of availableSpans) spanMap.set(s.id, s);

  const linkedSpans: SpanForValidation[] = [];
  for (const id of candidate.spanIds) {
    const s = spanMap.get(id);
    if (!s) {
      return { valid: false, stageFailed: 'STAGE_A', reason: `Linked span ${id} not found` };
    }
    linkedSpans.push(s);
  }

  // Order spans by pageNumber, lineIndex / spanIndex
  linkedSpans.sort((a, b) => {
    const pA = a.pageNumber ?? 1;
    const pB = b.pageNumber ?? 1;
    if (pA !== pB) return pA - pB;
    const lA = a.lineIndex ?? a.spanIndex ?? 0;
    const lB = b.lineIndex ?? b.spanIndex ?? 0;
    return lA - lB;
  });

  const quote = candidate.verbatimQuote?.trim() ?? '';
  if (!quote) {
    return { valid: false, stageFailed: 'STAGE_A', reason: 'Empty verbatimQuote' };
  }

  const concatenated = linkedSpans.map((s) => s.text).join(' ');
  const normSpans = normalizeForComparison(concatenated);
  const normQuote = normalizeForComparison(quote);

  if (!normSpans.includes(normQuote)) {
    return { valid: false, stageFailed: 'STAGE_A', reason: 'verbatimQuote is not a substring of linked text spans' };
  }

  // Compute union bounding box and min OCR confidence
  let minConf = 1.0;
  let minX = 1;
  let minY = 1;
  let maxX = 0;
  let maxY = 0;
  let hasBbox = false;

  for (const s of linkedSpans) {
    if (s.ocrConfidence !== undefined && s.ocrConfidence !== null) {
      if (s.ocrConfidence < minConf) minConf = s.ocrConfidence;
    }
    if (s.bbox) {
      hasBbox = true;
      minX = Math.min(minX, s.bbox.x);
      minY = Math.min(minY, s.bbox.y);
      maxX = Math.max(maxX, s.bbox.x + s.bbox.w);
      maxY = Math.max(maxY, s.bbox.y + s.bbox.h);
    }
  }

  const bboxUnion = hasBbox
    ? {
        x: Number(minX.toFixed(4)),
        y: Number(minY.toFixed(4)),
        w: Number(Math.max(0.01, maxX - minX).toFixed(4)),
        h: Number(Math.max(0.01, maxY - minY).toFixed(4)),
      }
    : undefined;

  // --- STAGE B: Value-in-Quote Deterministic Entailment ---
  const val = candidate.value;
  const isDateValue =
    typeof val === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(val.trim());
  const isLabValue =
    (typeof val === 'object' && val !== null && ('value' in val || 'unit' in val)) ||
    (typeof val === 'string' && /^\d+(\.\d+)?\s*[a-zA-Z/%]+$/.test(val.trim()));

  if (isDateValue) {
    const dateOk = verifyDateInQuote(val as string, quote);
    if (!dateOk) {
      return { valid: false, stageFailed: 'STAGE_B', reason: `Date value "${val}" not entailed in quote "${quote}"` };
    }
  } else if (isLabValue) {
    const labOk = verifyLabValueInQuote(val, quote);
    if (!labOk) {
      return { valid: false, stageFailed: 'STAGE_B', reason: `Lab value not entailed in quote "${quote}"` };
    }
  } else if (typeof val === 'string' && val.trim().length > 0) {
    const tokenOk = verifyTokensOrVocabInQuote(val, quote);
    if (!tokenOk) {
      return { valid: false, stageFailed: 'STAGE_B', reason: `String value tokens not entailed in quote "${quote}"` };
    }
  }

  // --- Confidence Routing ---
  const recommendedState = minConf < 0.85 ? 'needs_review' : 'extracted';

  return {
    valid: true,
    recommendedState,
    bboxUnion,
    minOcrConfidence: minConf,
  };
}
