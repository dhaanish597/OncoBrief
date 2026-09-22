/**
 * Provenance-atom normalisation (architecture §5.2).
 *
 * Both the linked spans and the `verbatim_quote` are normalised identically
 * before the substring assertion, so that OCR artefact differences in
 * whitespace or dash rendering do not produce spurious mismatches — and so that
 * the check itself is deterministic and testable.
 */

/** Unicode NFKC, dash unification, quote unification, whitespace collapse, trim. */
export function normalizeForComparison(input: string): string {
  return input
    .normalize('NFKC')
    // All dash/hyphen variants -> ASCII hyphen.
    .replace(/[\u2010\u2011\u2012\u2013\u2014\u2015\u2212\uFE58\uFE63\uFF0D]/g, '-')
    // Curly quotes/apostrophes -> ASCII.
    .replace(/[\u2018\u2019\u201A\u201B\u2032]/g, "'")
    .replace(/[\u201C\u201D\u201E\u201F\u2033]/g, '"')
    // Non-breaking and other exotic spaces -> ASCII space.
    .replace(/[\u00A0\u1680\u2000-\u200A\u202F\u205F\u3000]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
