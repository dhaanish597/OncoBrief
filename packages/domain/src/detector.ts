import { detectConflicts } from './conflict/detector';
import type { ComparableFact } from './conflict/comparators';
import { makeSlotKey, type FactType } from './vocab/fact-types';
import type { FactValue } from './vocab/fact-value';
import type { ReviewState } from './evidence/state';

export interface GroundedEvidenceFact {
  id: string;
  patientId: string;
  documentId: string;
  factType: FactType;
  slotKey?: string;
  value: FactValue;
  observedOn?: string | Date | null;
  state: ReviewState | string;
  conflictGroupId?: string | null;
  spanIds?: string[];
  verbatimQuote?: string;
}

export interface ContradictionDetectionResult {
  facts: GroundedEvidenceFact[];
  conflictGroups: Array<{
    conflictGroupId: string;
    factType: FactType;
    memberIds: string[];
    reason: string;
  }>;
}

/**
 * Detects cross-document contradictions between facts without silently picking
 * a winner or allowing an LLM to overwrite them.
 * Both facts are preserved with their source links and marked as conflicting
 * with a shared conflictGroupId.
 */
export function detectCrossDocumentContradictions(
  facts: readonly GroundedEvidenceFact[],
): ContradictionDetectionResult {
  const comparable: ComparableFact[] = facts.map((f) => ({
    id: f.id,
    factType: f.factType,
    slotKey: f.slotKey ?? makeSlotKey(f.factType, f.value),
    value: f.value,
    observedOn: f.observedOn,
  }));

  const detected = detectConflicts(comparable);
  if (detected.length === 0) {
    return { facts: [...facts], conflictGroups: [] };
  }

  const conflictMap = new Map<string, string>();
  const conflictGroups: ContradictionDetectionResult['conflictGroups'] = [];

  for (let idx = 0; idx < detected.length; idx++) {
    const d = detected[idx]!;
    const conflictGroupId = `conflict-${d.memberIds.join('-')}`;
    conflictGroups.push({
      conflictGroupId,
      factType: d.factType,
      memberIds: d.memberIds,
      reason: d.reason,
    });
    for (const id of d.memberIds) {
      conflictMap.set(id, conflictGroupId);
    }
  }

  const updatedFacts = facts.map((f) => {
    const conflictGroupId = conflictMap.get(f.id);
    if (conflictGroupId) {
      return {
        ...f,
        state: 'conflicting' as ReviewState,
        conflictGroupId,
      };
    }
    return { ...f };
  });

  return { facts: updatedFacts, conflictGroups };
}

export * from './conflict/detector';
export * from './conflict/comparators';
