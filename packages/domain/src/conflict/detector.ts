import { compareFacts, isDocumentScopedFactType, isLongitudinalFactType, type ComparableFact, type ComparisonVerdict } from './comparators';
import { makeSlotKey, type FactType } from '../vocab/fact-types';

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
export const DETECTOR_VERSION = 'v2';

export function detectConflicts(facts: readonly ComparableFact[]): DetectedConflict[] {
  const groups = new Map<string, ComparableFact[]>();
  for (const f of facts) {
    // Document-scoped attributes describe one document; two documents may
    // legitimately disagree and that is not a contradiction.
    if (isDocumentScopedFactType(f.factType)) continue;
    const comparisonSlot = isLongitudinalFactType(f.factType) ? makeSlotKey(f.factType, f.value) : f.slotKey;
    const key = `${f.factType}\u0000${comparisonSlot}`;
    const arr = groups.get(key);
    if (arr) arr.push(f);
    else groups.set(key, [f]);
  }

  const out: DetectedConflict[] = [];
  for (const group of groups.values()) {
    if (group.length < 2) continue;

    const verdicts: PairVerdict[] = [];
    const edges = new Map<string, Set<string>>();
    for (let i = 0; i < group.length; i += 1) {
      for (let j = i + 1; j < group.length; j += 1) {
        const a = group[i]!;
        const b = group[j]!;
        const verdict = compareFacts(a, b);
        verdicts.push({ a: a.id, b: b.id, verdict });
        if (verdict === 'agree') continue;
        edges.set(a.id, new Set([...(edges.get(a.id) ?? []), b.id]));
        edges.set(b.id, new Set([...(edges.get(b.id) ?? []), a.id]));
      }
    }
    // Only facts connected by an actual disagreement/unknown comparison enter
    // a conflict. An unrelated serial observation must never be flagged.
    const visited = new Set<string>();
    for (const id of edges.keys()) {
      if (visited.has(id)) continue;
      const queue = [id];
      const members = new Set<string>();
      while (queue.length) {
        const next = queue.pop()!;
        if (members.has(next)) continue;
        members.add(next);
        visited.add(next);
        for (const neighbor of edges.get(next) ?? []) queue.push(neighbor);
      }
      const memberIds = [...members].sort();
      const pairs = verdicts.filter(v => members.has(v.a) && members.has(v.b));
      const first = group.find(f => f.id === id)!;
      out.push({
        factType: first.factType,
        slotKey: isLongitudinalFactType(first.factType) ? makeSlotKey(first.factType, first.value, first.observedOn) : first.slotKey,
        memberIds,
        memberFingerprint: memberIds.join(','),
        verdicts: pairs,
        reason: pairs.some(v => v.verdict === 'disagree') ? 'disagreement' : 'incomparable',
        detectorName: DETECTOR_NAME,
        detectorVersion: DETECTOR_VERSION,
      });
    }
  }

  return out;
}
