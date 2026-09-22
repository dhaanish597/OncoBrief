import { can, type Role } from '../policy/rbac';
import type { EvidenceStateValue, LedgerAction, ResolutionKind } from './state';

/**
 * The transition guard (architecture §7.2).
 *
 * A single total function, pure, no database, no clock, no I/O. Every legal
 * cell of architecture §7's table plus every *illegal* combination is a unit
 * test. Illegal transitions are rejected before any write and the API returns
 * `409 invalid_transition` with the guard code.
 *
 * The guard also enforces the human-only rule structurally: no `system` actor
 * can append a verification, correction, rejection or conflict resolution.
 */

export type GuardError =
  | 'unknown_from_state'
  | 'no_such_transition'
  | 'actor_kind_mismatch'
  | 'reason_required'
  | 'resolution_kind_required'
  | 'unknown_resolution_kind'
  | 'permission_denied'
  | 'terminal_state';

export interface GuardInput {
  from: EvidenceStateValue | null;
  action: LedgerAction;
  actorKind: 'human' | 'system';
  actorRole?: Role;
  reason?: string;
  resolutionKind?: ResolutionKind;
}

export type GuardResult =
  | { ok: true; to: EvidenceStateValue }
  | { ok: false; code: GuardError; message: string };

const DESCRIPTION =
  'Never silently overwrite source evidence. Corrections preserve the original ' +
  'value and are recorded as a new fact pointing back at it.';

interface Rule {
  from: EvidenceStateValue | null;
  action: LedgerAction;
  to: EvidenceStateValue;
  actor: 'human' | 'system';
  /** Minimum reason length, or 0 when a reason is not required. */
  minReason: number;
  /** When set, the action is only legal for this resolution outcome. */
  resolutionKind?: ResolutionKind;
  /** When set, the human must hold this permission. */
  permission?: 'evidence:verify' | 'evidence:correct' | 'evidence:reject' | 'conflict:resolve';
}

const RULES: readonly Rule[] = [
  // First insertion. Only after span validation passes.
  { from: null, action: 'fact_extracted', to: 'extracted', actor: 'system', minReason: 0 },

  // extracted
  {
    from: 'extracted',
    action: 'fact_verified',
    to: 'verified',
    actor: 'human',
    minReason: 0,
    permission: 'evidence:verify',
  },
  {
    from: 'extracted',
    action: 'fact_rejected',
    to: 'rejected',
    actor: 'human',
    minReason: 3,
    permission: 'evidence:reject',
  },
  {
    from: 'extracted',
    action: 'fact_corrected',
    to: 'corrected',
    actor: 'human',
    minReason: 3,
    permission: 'evidence:correct',
  },
  { from: 'extracted', action: 'fact_flagged_conflicting', to: 'conflicting', actor: 'system', minReason: 0 },
  { from: 'extracted', action: 'fact_superseded', to: 'superseded', actor: 'human', minReason: 3 },

  // verified — a later document may reopen a settled fact (staleness).
  { from: 'verified', action: 'fact_flagged_conflicting', to: 'conflicting', actor: 'system', minReason: 0 },
  {
    from: 'verified',
    action: 'fact_corrected',
    to: 'corrected',
    actor: 'human',
    minReason: 3,
    permission: 'evidence:correct',
  },
  {
    from: 'verified',
    action: 'fact_rejected',
    to: 'rejected',
    actor: 'human',
    minReason: 3,
    permission: 'evidence:reject',
  },
  { from: 'verified', action: 'fact_superseded', to: 'superseded', actor: 'human', minReason: 3 },

  // conflicting — human-only resolution. The system has no opinion.
  {
    from: 'conflicting',
    action: 'conflict_resolved',
    to: 'verified',
    actor: 'human',
    minReason: 3,
    resolutionKind: 'retain_both',
    permission: 'conflict:resolve',
  },
  {
    from: 'conflicting',
    action: 'conflict_resolved',
    to: 'superseded',
    actor: 'human',
    minReason: 3,
    resolutionKind: 'mark_superseded',
    permission: 'conflict:resolve',
  },
  {
    from: 'conflicting',
    action: 'conflict_resolved',
    to: 'corrected',
    actor: 'human',
    minReason: 3,
    resolutionKind: 'corrected',
    permission: 'conflict:resolve',
  },
  { from: 'conflicting', action: 'fact_superseded', to: 'superseded', actor: 'human', minReason: 3 },

  // rejected — undo a mistaken rejection.
  {
    from: 'rejected',
    action: 'fact_reinstated',
    to: 'extracted',
    actor: 'human',
    minReason: 3,
    permission: 'evidence:reject',
  },
];

export function transition(input: GuardInput): GuardResult {
  const { from, action, actorKind, reason, resolutionKind } = input;

  if (from !== null && !isKnownState(from)) {
    return { ok: false, code: 'unknown_from_state', message: `unknown state: ${from}` };
  }

  const candidates = RULES.filter((r) => r.from === from && r.action === action);
  if (candidates.length === 0) {
    return {
      ok: false,
      code: 'no_such_transition',
      message: `No transition for ${action} from ${from ?? '∅'}. ${DESCRIPTION}`,
    };
  }

  // conflict_resolved has three legal targets disambiguated by resolutionKind.
  let rule: Rule | undefined;
  if (action === 'conflict_resolved') {
    if (!resolutionKind) {
      return {
        ok: false,
        code: 'resolution_kind_required',
        message: 'conflict_resolved requires a resolutionKind.',
      };
    }
    rule = candidates.find((r) => r.resolutionKind === resolutionKind);
    if (!rule) {
      return {
        ok: false,
        code: 'unknown_resolution_kind',
        message: `resolutionKind ${resolutionKind} is not legal from ${from ?? '∅'}.`,
      };
    }
  } else {
    rule = candidates[0];
    if (!rule) {
      return {
        ok: false,
        code: 'no_such_transition',
        message: `No transition for ${action} from ${from ?? '∅'}. ${DESCRIPTION}`,
      };
    }
  }

  if (rule.actor !== actorKind) {
    return {
      ok: false,
      code: 'actor_kind_mismatch',
      message: `${action} requires a ${rule.actor} actor, not ${actorKind}.`,
    };
  }

  if (rule.permission) {
    if (actorKind !== 'human' || !input.actorRole || !can(input.actorRole, rule.permission)) {
      return {
        ok: false,
        code: 'permission_denied',
        message: `Actor lacks ${rule.permission}.`,
      };
    }
  }

  if (rule.minReason > 0 && (reason ?? '').trim().length < rule.minReason) {
    return {
      ok: false,
      code: 'reason_required',
      message: `${action} requires a reason of at least ${rule.minReason} characters.`,
    };
  }

  return { ok: true, to: rule.to };
}

function isKnownState(value: string): value is EvidenceStateValue {
  return (
    value === 'extracted' ||
    value === 'verified' ||
    value === 'conflicting' ||
    value === 'corrected' ||
    value === 'rejected' ||
    value === 'superseded'
  );
}

/** Every rule, exported so the test can assert the full table. */
export function transitionRules(): readonly Rule[] {
  return RULES;
}
