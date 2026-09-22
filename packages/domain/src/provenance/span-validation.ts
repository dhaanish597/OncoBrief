import { normalizeForComparison } from './normalize';

/**
 * Verbatim-span validation — the central safety gate (architecture §5.2).
 *
 * No `evidence_fact` may be inserted unless this deterministic check passes:
 *   1. Concatenate the linked spans' text in ordinal order.
 *   2. Normalise both sides identically.
 *   3. Assert the normalised quote is a contiguous substring of the
 *      normalised concatenation.
 *   4. Assert every linked span belongs to the same document and one page.
 *
 * Failure means the candidate is written to `extraction_candidate` with
 * `rejected_reason = 'span_mismatch'` and never reaches the ledger. This is
 * the mechanism that makes a hallucinated value structurally unable to become
 * evidence: a fabricated value has no substring anchor in the OCR text.
 */

export interface SpanForValidation {
  id: string;
  documentId: string;
  pageId: string;
  text: string;
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
    if (s.pageId !== first.pageId) {
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
