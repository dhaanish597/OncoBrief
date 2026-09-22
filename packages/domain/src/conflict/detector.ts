import { compareFacts, type ComparableFact, type ComparisonVerdict } from './comparators.js';
import type { FactType } from '../vocab/fact-types.js';

/**
 * Deterministic conflict detection (architecture §8.2).
 *
 * Runs after every ingestion completes and on demand. It is idempotent —
 * re-running never creates a second conflict set for the same member set,
 * because `member_fingerprint` is a deterministic function of the member ids.
 */

export interface PairVerdict {
  a: string;
  b: string;
  verdict: ComparisonVerdict;
}

export interface DetectedConflict {
  factType: FactType;
  slotKey: string;
  memberIds: string[];
  memberFingerprint: string;
  verdicts: PairVerdict[];
  reason: 'disagreement' | 'incomparable';
  detectorName: string;
  detectorVersion: string;
}

export const DETECTOR_NAME = 'slot-comparator';
export const DETECTOR_VERSION = 'v1';

export function detectConflicts(facts: readonly ComparableFact[]): DetectedConflict[] {
  const groups = new Map<string, ComparableFact[]>();
  for (const f of facts) {
    const key = `${f.factType}\u0000${f.slotKey}`;
    const arr = groups.get(key);
    if (arr) arr.push(f);
    else groups.set(key, [f]);
  }

  const out: DetectedConflict[] = [];
  for (const group of groups.values()) {
    if (group.length < 2) continue;

    const verdicts: PairVerdict[] = [];
    let hasDisagreement = false;
    let hasIncomparable = false;

    for (let i = 0; i < group.length; i += 1) {
      for (let j = i + 1; j < group.length; j += 1) {
        const a = group[i]!;
        const b = group[j]!;
        const verdict = compareFacts(a, b);
        verdicts.push({ a: a.id, b: b.id, verdict });
        if (verdict === 'disagree') hasDisagreement = true;
        if (verdict === 'incomparable') hasIncomparable = true;
      }
    }

    if (!hasDisagreement && !hasIncomparable) continue;

    const memberIds = group.map((f) => f.id).sort();
    out.push({
      factType: group[0]!.factType,
      slotKey: group[0]!.slotKey,
      memberIds,
      memberFingerprint: memberIds.join(','),
      verdicts,
      reason: hasDisagreement ? 'disagreement' : 'incomparable',
      detectorName: DETECTOR_NAME,
      detectorVersion: DETECTOR_VERSION,
    });
  }

  return out;
}
