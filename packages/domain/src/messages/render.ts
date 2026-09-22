import type { EvidenceStateValue } from '../evidence/state';

/**
 * Administrative message rendering and the verified-source approval gate
 * (architecture §19.2–19.3).
 *
 * Messages are rendered from approved templates. Every substituted value is
 * traced. **A variable whose backing fact is not in state `verified` or
 * `corrected` blocks approval.** This is the property that makes patient
 * messaging safe: the system cannot tell a patient something the record has
 * not confirmed.
 *
 * Template bodies are administrative only. No template may contain clinical
 * guidance.
 */

const VARIABLE_RE = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g;

export type RenderError =
  | { code: 'unknown_variable'; name: string }
  | { code: 'missing_variable'; name: string }
  | { code: 'unknown_placeholder_syntax'; snippet: string };

export type RenderResult =
  | { ok: true; body: string; used: string[] }
  | { ok: false; error: RenderError };

export function renderTemplate(
  bodyTemplate: string,
  allowedVariables: readonly string[],
  values: Record<string, string>,
): RenderResult {
  const allowed = new Set(allowedVariables);
  const used: string[] = [];

  // Detect stray single-brace placeholders ({name}) which are a template-authoring bug.
  const strayMatch = /(?<!\{)\{[a-zA-Z0-9_]+\}(?!\})/.exec(bodyTemplate);
  if (strayMatch) {
    return { ok: false, error: { code: 'unknown_placeholder_syntax', snippet: strayMatch[0] } };
  }

  let error: RenderError | null = null;
  const body = bodyTemplate.replace(VARIABLE_RE, (_full, name: string) => {
    if (error) return '';
    if (!allowed.has(name)) {
      error = { code: 'unknown_variable', name };
      return '';
    }
    const value = values[name];
    if (value === undefined) {
      error = { code: 'missing_variable', name };
      return '';
    }
    used.push(name);
    return value;
  });

  if (error) return { ok: false, error };
  return { ok: true, body, used };
}

/**
 * Literal (non-evidence) values are permitted only for a small, closed set of
 * hospital-authored administrative constants. This prevents a clinician
 * bypassing the verified-source gate by typing a clinical statement as a
 * "literal".
 */
export const ALLOWED_LITERAL_VARIABLES: readonly string[] = [
  'clinic_name',
  'hospital_name',
  'records_office_phone',
  'clinic_contact',
  'appointment_location',
];

export type VariableSource =
  | { kind: 'evidence'; variableName: string; evidenceFactId: string; state: EvidenceStateValue }
  | { kind: 'task'; variableName: string; adminTaskId: string; taskKind: string; taskStatus: string }
  | { kind: 'literal'; variableName: string; literalValue: string };

export type ApprovalGateResult = { ok: true } | { ok: false; blockers: string[] };

export function checkMessageApprovalGate(
  usedVariables: readonly string[],
  sources: readonly VariableSource[],
): ApprovalGateResult {
  const blockers: string[] = [];
  const byName = new Map(sources.map((s) => [s.variableName, s]));

  for (const name of usedVariables) {
    const src = byName.get(name);
    if (!src) {
      blockers.push(`Variable "${name}" has no recorded source.`);
      continue;
    }
    switch (src.kind) {
      case 'evidence':
        if (src.state !== 'verified' && src.state !== 'corrected') {
          blockers.push(
            `Variable "${name}" is backed by a fact in state "${src.state}", not verified/corrected.`,
          );
        }
        break;
      case 'task':
        if (src.taskStatus === 'cancelled') {
          blockers.push(`Variable "${name}" is backed by a cancelled task.`);
        }
        break;
      case 'literal':
        if (!ALLOWED_LITERAL_VARIABLES.includes(src.variableName)) {
          blockers.push(
            `Variable "${name}" is a literal but is not an allowed administrative constant.`,
          );
        }
        if (src.literalValue.trim().length === 0) {
          blockers.push(`Variable "${name}" has an empty literal value.`);
        }
        break;
    }
  }

  return blockers.length === 0 ? { ok: true } : { ok: false, blockers };
}
