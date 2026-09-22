/**
 * The non-clinical boundary, made explicit (architecture §18.1).
 *
 * A guard function plus a forbidden-concept scanner. The scanner runs in tests
 * over the closed vocabularies and (via lint/CI) over user-facing string
 * tables, so a well-meaning "helpful" addition that reintroduces clinical
 * inference fails the build rather than passing review.
 */

/**
 * Concepts the product may never compute, store or display as system output.
 * Text transcribed verbatim from a document is exempt — the system is allowed
 * to quote "T2N1M0" if the document says it — which is why the forbidden
 * vocabulary is expressed as *system-authored concept names*, not as substrings
 * of patient data.
 */
export const FORBIDDEN_CONCEPT_PATTERNS: readonly { id: string; re: RegExp }[] = [
  { id: 'risk_score', re: bounded('risk[\\s_-]?score') },
  { id: 'prognosis', re: bounded('prognos(?:is|tic)') },
  { id: 'treatment_recommendation', re: bounded('treatment[\\s_-]?recommend\\w*') },
  { id: 'recommended_treatment', re: bounded('recommend(?:ed)?[\\s_-]?treat\\w*') },
  { id: 'clinical_decision_support', re: bounded('clinical[\\s_-]?decision[\\s_-]?support') },
  { id: 'staging_computed', re: bounded('stage[\\s._-](?:comput|calculat|deriv)\\w*') },
  { id: 'urgency_level', re: bounded('urgency[\\s_-]?(?:level|score)') },
  { id: 'triage', re: bounded('triage') },
  { id: 'diagnose_system', re: bounded('diagnos(?:e|is)[\\s_-]?(?:result|conclusion|engine)') },
  { id: 'next_step_suggestion', re: bounded('next[\\s_-]?step[\\s_-]?suggest') },
  { id: 'patient_status', re: bounded('patient[\\s_-]?status') },
  { id: 'acuity', re: bounded('acuity') },
];

/**
 * Word boundaries in JavaScript treat `_` as a word character, so
 * `\brisk\b` fails to match `risk_score`. These lookarounds treat underscore
 * and digits as separators, which is what a vocabulary identifier needs.
 */
function bounded(core: string): RegExp {
  return new RegExp(`(?<![a-z0-9])${core}(?![a-z0-9])`, 'i');
}

export interface BoundaryViolation {
  patternId: string;
  matched: string;
}

/** Scan a system-authored identifier or label for forbidden clinical concepts. */
export function scanForBoundaryViolation(text: string): BoundaryViolation[] {
  const out: BoundaryViolation[] = [];
  for (const { id, re } of FORBIDDEN_CONCEPT_PATTERNS) {
    const m = re.exec(text);
    if (m) out.push({ patternId: id, matched: m[0] });
  }
  return out;
}

/**
 * Assert that every system-authored string in a registry is boundary-clean.
 * Called from tests over the closed vocabularies.
 */
export function assertBoundaryClean(strings: Iterable<string>, source: string): void {
  const violations: string[] = [];
  for (const s of strings) {
    for (const v of scanForBoundaryViolation(s)) {
      violations.push(`${source}: "${s}" trips ${v.patternId} ("${v.matched}")`);
    }
  }
  if (violations.length > 0) {
    throw new Error(
      `clinical_boundary_violation:\n${violations.join('\n')}\n` +
        'If this is intentional, add a decision record (docs/decisions/) and update the guard.',
    );
  }
}

/** The legal statement of the boundary, surfaced verbatim in the UI `/about` page. */
export const NON_CLINICAL_BOUNDARY_STATEMENT =
  'OncoBrief organizes and retrieves documents. It does not diagnose, risk-score, ' +
  'interpret laboratory or radiology findings, assign stage, recommend treatment, ' +
  'suggest tests, determine urgency, or generate a care plan.';
