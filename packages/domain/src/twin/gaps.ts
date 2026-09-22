import type { DocumentType } from '../vocab/document-types.js';

/**
 * Gap evaluation — omission as a first-class, queryable entity
 * (architecture §9.2).
 *
 * Pure function: `evaluateGaps(checklistItems, documents)`. Deterministic, no
 * LLM, exhaustively testable. Because gaps are rows rather than a rendered
 * count, a missing document can be *the source link on a task* — which is what
 * turns "the record is incomplete" into "someone is retrieving it by Thursday."
 */

export type RequirementKind = 'required' | 'expected' | 'optional';
export type GapStatus = 'missing' | 'partial' | 'satisfied' | 'waived';

export interface ChecklistItemDef {
  id: string;
  code: string;
  label: string;
  requiredDocumentType: DocumentType;
  requirementKind: RequirementKind;
  ordinal: number;
  rationale: string;
}

export interface DocumentForGap {
  id: string;
  documentType: DocumentType | null;
  documentDate: string | null;
  typeConfirmed: boolean;
}

export interface ExistingGap {
  checklistItemId: string;
  status: GapStatus;
  waivedBy: string | null;
  waivedReason: string | null;
}

export interface EvaluatedGap {
  checklistItemId: string;
  status: GapStatus;
  satisfiedByDocumentId: string | null;
  /** Set when the item is `missing` and at least one unconfirmed doc could be it. */
  candidateDocumentId: string | null;
}

export function evaluateGaps(
  items: readonly ChecklistItemDef[],
  documents: readonly DocumentForGap[],
  existingGaps: readonly ExistingGap[] = [],
): EvaluatedGap[] {
  const byItem = new Map(existingGaps.map((g) => [g.checklistItemId, g]));

  return items.map((item) => {
    const existing = byItem.get(item.id);
    // A human waiver is preserved; gap evaluation never overrides it.
    if (existing?.status === 'waived') {
      return {
        checklistItemId: item.id,
        status: 'waived' as const,
        satisfiedByDocumentId: null,
        candidateDocumentId: null,
      };
    }

    const matching = documents.filter((d) => d.documentType === item.requiredDocumentType);
    const confirmed = matching.filter((d) => d.typeConfirmed);

    if (confirmed.length > 0) {
      const chosen = pickMostRecent(confirmed);
      return {
        checklistItemId: item.id,
        status: 'satisfied' as const,
        satisfiedByDocumentId: chosen.id,
        candidateDocumentId: null,
      };
    }

    if (matching.length > 0) {
      // A document is present but its type has not been human-confirmed, so it
      // cannot count toward the requirement yet. This is `partial`, not
      // `satisfied` — and not `missing`, because the paper is there.
      return {
        checklistItemId: item.id,
        status: 'partial' as const,
        satisfiedByDocumentId: null,
        candidateDocumentId: pickMostRecent(matching).id,
      };
    }

    return {
      checklistItemId: item.id,
      status: 'missing' as const,
      satisfiedByDocumentId: null,
      candidateDocumentId: null,
    };
  });
}

function pickMostRecent(docs: readonly DocumentForGap[]): DocumentForGap {
  return [...docs].sort((a, b) => {
    const ad = a.documentDate ?? '0000-00-00';
    const bd = b.documentDate ?? '0000-00-00';
    if (ad !== bd) return bd.localeCompare(ad);
    return a.id.localeCompare(b.id);
  })[0]!;
}
