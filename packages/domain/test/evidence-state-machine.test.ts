import { describe, expect, it } from 'vitest';
import {
  EVIDENCE_STATES,
  LEDGER_ACTIONS,
  transition,
  type EvidenceStateValue,
  type LedgerAction,
  type Role,
} from '../src/index.js';

const CLINICIAN: Role = 'clinician';
const SYSTEM = { actorKind: 'system' as const };
const HUMAN = { actorKind: 'human' as const, actorRole: CLINICIAN };

interface LegalCase {
  from: EvidenceStateValue | null;
  action: LedgerAction;
  to: EvidenceStateValue;
  actor: 'human' | 'system';
  reason?: string;
  resolutionKind?: 'retain_both' | 'mark_superseded' | 'corrected';
}

/**
 * Architecture §7's table, transcribed. If the implementation and this table
 * diverge, one of them is wrong and the build fails.
 */
const LEGAL: LegalCase[] = [
  { from: null, action: 'fact_extracted', to: 'extracted', actor: 'system' },

  { from: 'extracted', action: 'fact_verified', to: 'verified', actor: 'human' },
  { from: 'extracted', action: 'fact_rejected', to: 'rejected', actor: 'human', reason: 'wrong patient' },
  { from: 'extracted', action: 'fact_corrected', to: 'corrected', actor: 'human', reason: 'typo in date' },
  { from: 'extracted', action: 'fact_flagged_conflicting', to: 'conflicting', actor: 'system' },
  { from: 'extracted', action: 'fact_superseded', to: 'superseded', actor: 'human', reason: 'replaced by rescan' },

  { from: 'verified', action: 'fact_flagged_conflicting', to: 'conflicting', actor: 'system' },
  { from: 'verified', action: 'fact_corrected', to: 'corrected', actor: 'human', reason: 'value misread' },
  { from: 'verified', action: 'fact_rejected', to: 'rejected', actor: 'human', reason: 'not this patient' },
  { from: 'verified', action: 'fact_superseded', to: 'superseded', actor: 'human', reason: 'newer record' },

  { from: 'conflicting', action: 'conflict_resolved', to: 'verified', actor: 'human', reason: 'retain both', resolutionKind: 'retain_both' },
  { from: 'conflicting', action: 'conflict_resolved', to: 'superseded', actor: 'human', reason: 'this one loses', resolutionKind: 'mark_superseded' },
  { from: 'conflicting', action: 'conflict_resolved', to: 'corrected', actor: 'human', reason: 'both wrong', resolutionKind: 'corrected' },
  { from: 'conflicting', action: 'fact_superseded', to: 'superseded', actor: 'human', reason: 'superseded' },

  { from: 'rejected', action: 'fact_reinstated', to: 'extracted', actor: 'human', reason: 'rejection mistaken' },
];

describe('evidence state machine — legal transitions', () => {
  for (const c of LEGAL) {
    it(`${c.from ?? '∅'} --${c.action}(${c.actor})--> ${c.to}`, () => {
      const actor = c.actor === 'system' ? SYSTEM : HUMAN;
      const result = transition({
        from: c.from,
        action: c.action,
        ...actor,
        reason: c.reason,
        resolutionKind: c.resolutionKind,
      });
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.to).toBe(c.to);
    });
  }
});

describe('evidence state machine — illegal combinations', () => {
  const legalKeys = new Set(
    LEGAL.map((c) => `${c.from ?? 'NULL'}|${c.action}|${c.actor}`),
  );

  const froms: (EvidenceStateValue | null)[] = [null, ...EVIDENCE_STATES];

  for (const from of froms) {
    for (const action of LEDGER_ACTIONS) {
      for (const actor of ['human', 'system'] as const) {
        const key = `${from ?? 'NULL'}|${action}|${actor}`;
        if (legalKeys.has(key)) continue;
        it(`rejects ${key}`, () => {
          const result = transition({
            from,
            action,
            actorKind: actor,
            actorRole: CLINICIAN,
            reason: 'a sufficiently long reason',
            resolutionKind: 'retain_both',
          });
          expect(result.ok).toBe(false);
        });
      }
    }
  }
});

describe('evidence state machine — guard specifics', () => {
  it('a system actor cannot verify', () => {
    const r = transition({ from: 'extracted', action: 'fact_verified', actorKind: 'system' });
    expect(r).toMatchObject({ ok: false, code: 'actor_kind_mismatch' });
  });

  it('a human cannot append fact_extracted', () => {
    const r = transition({ from: null, action: 'fact_extracted', actorKind: 'human', actorRole: CLINICIAN });
    expect(r).toMatchObject({ ok: false, code: 'actor_kind_mismatch' });
  });

  it('rejection requires a reason', () => {
    const r = transition({ from: 'extracted', action: 'fact_rejected', actorKind: 'human', actorRole: CLINICIAN });
    expect(r).toMatchObject({ ok: false, code: 'reason_required' });
  });

  it('a reason of only whitespace is not a reason', () => {
    const r = transition({
      from: 'extracted',
      action: 'fact_corrected',
      actorKind: 'human',
      actorRole: CLINICIAN,
      reason: '   ',
    });
    expect(r).toMatchObject({ ok: false, code: 'reason_required' });
  });

  it('conflict_resolved requires a resolution kind', () => {
    const r = transition({
      from: 'conflicting',
      action: 'conflict_resolved',
      actorKind: 'human',
      actorRole: CLINICIAN,
      reason: 'resolved it',
    });
    expect(r).toMatchObject({ ok: false, code: 'resolution_kind_required' });
  });

  it('a coordinator cannot resolve a conflict (lacks conflict:resolve)', () => {
    const r = transition({
      from: 'conflicting',
      action: 'conflict_resolved',
      actorKind: 'human',
      actorRole: 'coordinator',
      reason: 'looks fine',
      resolutionKind: 'retain_both',
    });
    expect(r).toMatchObject({ ok: false, code: 'permission_denied' });
  });

  it('an org_admin cannot verify evidence', () => {
    const r = transition({
      from: 'extracted',
      action: 'fact_verified',
      actorKind: 'human',
      actorRole: 'org_admin',
    });
    expect(r).toMatchObject({ ok: false, code: 'permission_denied' });
  });

  it('an auditor cannot verify evidence', () => {
    const r = transition({
      from: 'extracted',
      action: 'fact_verified',
      actorKind: 'human',
      actorRole: 'auditor',
    });
    expect(r).toMatchObject({ ok: false, code: 'permission_denied' });
  });

  it('corrected is terminal', () => {
    const r = transition({
      from: 'corrected',
      action: 'fact_verified',
      actorKind: 'human',
      actorRole: CLINICIAN,
    });
    expect(r.ok).toBe(false);
  });

  it('superseded is terminal', () => {
    const r = transition({
      from: 'superseded',
      action: 'fact_reinstated',
      actorKind: 'human',
      actorRole: CLINICIAN,
      reason: 'bring it back',
    });
    expect(r.ok).toBe(false);
  });
});
