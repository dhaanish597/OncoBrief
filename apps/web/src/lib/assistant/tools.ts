import type { Querier } from '@oncobrief/db';
import {
  getTimeline,
  getProvenance,
  getConflict,
  listConflicts,
  listTasks,
  listRecordMap,
  getPageSpans,
  listDocuments,
} from '@oncobrief/db';

export interface ToolResult<T> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface EvidenceSearchResult {
  evidenceFactId: string;
  factType: string;
  valueText: string;
  displayDate: string | null;
  state: string;
  documentId: string;
  documentName: string;
  pageNumber: number | null;
  confidenceBand: string;
  extractorKind: string;
  extractorName: string;
  extractorVersion: string;
  verbatimQuote: string;
  reviewerName: string | null;
  reviewedAt: string | null;
}

export interface MissingDocumentResult {
  id: string;
  label: string;
  requirementKind: string;
  status: string;
  rationale: string;
  requiredDocumentType: string;
  satisfiedByDocumentId: string | null;
  candidateDocumentId: string | null;
}

export interface ContinuityItem {
  id: string;
  title: string;
  detail: string | null;
  taskKind: string;
  status: string;
  dueOn: string | null;
  originKind: string;
  origin: {
    evidenceFactId: string | null;
    recordGapId: string | null;
    conflictSetId: string | null;
    documentId: string | null;
  };
  assigneeName: string | null;
  creatorName: string | null;
  createdAt: string;
}

/**
 * All tools receive an already-authorised Querier. None of them accept a
 * patientId from the model as proof of authorisation — the caller binds the
 * patient from the authenticated request context.
 */

export async function searchEvidence(
  q: Querier,
  patientId: string,
  query: string,
): Promise<ToolResult<EvidenceSearchResult[]>> {
  try {
    const timeline = await getTimeline(q, patientId);
    const lowerQuery = query.toLowerCase().trim();

    const tokens = lowerQuery
      .split(/\s+/)
      .map((t) => t.replace(/[^a-z0-9]/g, ''))
      .filter((t) => t.length > 2)
      .filter((t) => !['the', 'and', 'for', 'with', 'show', 'what', 'find', 'latest', 'report'].includes(t));

    const scored = timeline
      .map((row) => {
        let score = 0;
        const haystack = `${row.factType} ${row.valueText} ${row.verbatimQuote} ${row.documentName}`.toLowerCase();
        for (const token of tokens) {
          if (haystack.includes(token)) score += 1;
        }
        return { row, score };
      })
      .filter((r) => r.score > 0)
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        // Active verified/extracted evidence ranks ahead of conflicting and historical (superseded/corrected/rejected) evidence
        const stateRank = (s: string) =>
          s === 'verified' ? 3 : s === 'extracted' ? 2 : s === 'conflicting' ? 1 : 0;
        const rankDiff = stateRank(b.row.state) - stateRank(a.row.state);
        if (rankDiff !== 0) return rankDiff;
        // Within equal relevance, prefer the most recent recording.
        return (b.row.displayDate ?? '').localeCompare(a.row.displayDate ?? '');
      });

    const results = scored.slice(0, 12).map((s) => s.row);

    // If no timeline facts matched, check whether an uploaded document exists
    // (e.g. an uploaded document with zero extracted facts).
    if (results.length === 0 && tokens.length > 0) {
      const allDocs = await listDocuments(q, patientId);
      const matchingDocs = allDocs.filter((d) => {
        const docHaystack = `${d.filename} ${d.documentType ?? ''} ${d.issuingFacility ?? ''}`.toLowerCase();
        return tokens.some((token) => docHaystack.includes(token));
      });
      if (matchingDocs.length > 0) {
        return {
          success: true,
          data: matchingDocs.slice(0, 6).map((d) => ({
            evidenceFactId: d.id,
            factType: 'document.uploaded',
            valueText: `${d.filename} (${d.documentType ? d.documentType.replaceAll('_', ' ') : 'unclassified'}) — uploaded record, status: ${d.ingestStatus}, ${d.factCount} extracted facts`,
            displayDate: d.documentDate,
            state: d.typeConfirmed ? 'verified' : 'extracted',
            documentId: d.id,
            documentName: d.filename,
            pageNumber: d.pageCount ? 1 : null,
            confidenceBand: d.typeConfidence ?? 'high',
            extractorKind: 'system',
            extractorName: 'document.registry',
            extractorVersion: 'v1',
            verbatimQuote: `Uploaded document: ${d.filename} (status: ${d.ingestStatus})`,
            reviewerName: null,
            reviewedAt: null,
          })),
        };
      }
    }

    return {
      success: true,
      data: results.map((r) => ({
        evidenceFactId: r.evidenceFactId,
        factType: r.factType,
        valueText: r.valueText,
        displayDate: r.displayDate,
        state: r.state,
        documentId: r.documentId,
        documentName: r.documentName,
        pageNumber: r.pageNumber,
        confidenceBand: r.confidenceBand,
        extractorKind: r.extractorKind,
        extractorName: r.extractorName,
        extractorVersion: r.extractorVersion,
        verbatimQuote: r.verbatimQuote,
        reviewerName: r.reviewerName,
        reviewedAt: r.reviewedAt,
      })),
    };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Failed to search evidence' };
  }
}

export async function getEvidenceDetail(
  q: Querier,
  evidenceFactId: string,
): Promise<ToolResult<EvidenceSearchResult | null>> {
  try {
    const provenance = await getProvenance(q, evidenceFactId);
    if (!provenance) return { success: true, data: null };

    const verified = provenance.history.find((h) => h.action === 'fact_verified');
    return {
      success: true,
      data: {
        evidenceFactId: provenance.fact.id,
        factType: provenance.fact.factType,
        valueText: provenance.fact.valueText,
        displayDate: provenance.fact.observedOn,
        state: provenance.state,
        documentId: provenance.fact.documentId,
        documentName: provenance.fact.documentName,
        pageNumber: provenance.spans[0]?.pageNumber ?? null,
        confidenceBand: provenance.fact.confidenceBand,
        extractorKind: provenance.fact.extractorKind,
        extractorName: provenance.fact.extractorName,
        extractorVersion: provenance.fact.extractorVersion,
        verbatimQuote: provenance.fact.verbatimQuote,
        reviewerName: verified?.actorName ?? null,
        reviewedAt: verified?.occurredAt ?? null,
      },
    };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Failed to get evidence detail' };
  }
}

export async function findDocument(
  q: Querier,
  patientId: string,
  documentName: string,
): Promise<ToolResult<EvidenceSearchResult[]>> {
  try {
    const timeline = await getTimeline(q, patientId);
    const lowerName = documentName.toLowerCase();
    const results = timeline
      .filter((row) => row.documentName.toLowerCase().includes(lowerName))
      .slice(0, 12)
      .map((r) => ({
        evidenceFactId: r.evidenceFactId,
        factType: r.factType,
        valueText: r.valueText,
        displayDate: r.displayDate,
        state: r.state,
        documentId: r.documentId,
        documentName: r.documentName,
        pageNumber: r.pageNumber,
        confidenceBand: r.confidenceBand,
        extractorKind: r.extractorKind,
        extractorName: r.extractorName,
        extractorVersion: r.extractorVersion,
        verbatimQuote: r.verbatimQuote,
        reviewerName: r.reviewerName,
        reviewedAt: r.reviewedAt,
      }));

    if (results.length > 0) {
      return { success: true, data: results };
    }

    // An uploaded document with zero extracted facts is still a present document;
    // do not treat it as absent when searched by name.
    const allDocs = await listDocuments(q, patientId);
    const matchingDocs = allDocs.filter(
      (d) =>
        d.filename.toLowerCase().includes(lowerName) ||
        (d.documentType && d.documentType.toLowerCase().includes(lowerName)),
    );
    if (matchingDocs.length > 0) {
      return {
        success: true,
        data: matchingDocs.slice(0, 6).map((d) => ({
          evidenceFactId: d.id,
          factType: 'document.uploaded',
          valueText: `${d.filename} (${d.documentType ? d.documentType.replaceAll('_', ' ') : 'unclassified'}) — uploaded record, status: ${d.ingestStatus}, ${d.factCount} extracted facts`,
          displayDate: d.documentDate,
          state: d.typeConfirmed ? 'verified' : 'extracted',
          documentId: d.id,
          documentName: d.filename,
          pageNumber: d.pageCount ? 1 : null,
          confidenceBand: d.typeConfidence ?? 'high',
          extractorKind: 'system',
          extractorName: 'document.registry',
          extractorVersion: 'v1',
          verbatimQuote: `Uploaded document: ${d.filename} (status: ${d.ingestStatus})`,
          reviewerName: null,
          reviewedAt: null,
        })),
      };
    }

    return { success: true, data: [] };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Failed to find document' };
  }
}

export async function getSourceText(
  q: Querier,
  documentId: string,
  pageNumber: number,
): Promise<ToolResult<{ plainText: string; spans: { id: string; text: string; pageNumber: number }[] } | null>> {
  try {
    const page = await getPageSpans(q, documentId, pageNumber);
    if (!page) return { success: true, data: null };
    return {
      success: true,
      data: {
        plainText: page.plainText,
        spans: page.spans.map((s) => ({ id: s.id, text: s.text, pageNumber })),
      },
    };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Failed to get source text' };
  }
}

export async function getMissingDocuments(
  q: Querier,
  patientId: string,
): Promise<ToolResult<MissingDocumentResult[]>> {
  try {
    const recordMap = await listRecordMap(q, patientId);
    return {
      success: true,
      data: recordMap.gaps
        .filter((g) => g.status === 'missing' || g.status === 'partial')
        .map((g) => ({
          id: g.id,
          label: g.label,
          requirementKind: g.requirementKind,
          status: g.status,
          rationale: g.rationale,
          requiredDocumentType: g.requiredDocumentType,
          satisfiedByDocumentId: g.satisfiedByDocumentId,
          candidateDocumentId: g.candidateDocumentId,
        })),
    };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Failed to get missing documents' };
  }
}

export async function getContinuityItems(
  q: Querier,
  patientId: string,
): Promise<ToolResult<ContinuityItem[]>> {
  try {
    const tasks = await listTasks(q, patientId);
    return { success: true, data: tasks };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Failed to get continuity items' };
  }
}

export async function getCaseContext(
  q: Querier,
  patientId: string,
): Promise<
  ToolResult<{
    evidenceCount: number;
    unverifiedCount: number;
    conflictingCount: number;
    missingRequiredCount: number;
    openTasksCount: number;
    documentCount: number;
    readinessBand: string | null;
  }>
> {
  try {
    const timeline = await getTimeline(q, patientId);
    const recordMap = await listRecordMap(q, patientId);
    const allDocs = await listDocuments(q, patientId);

    return {
      success: true,
      data: {
        evidenceCount: timeline.length,
        unverifiedCount: timeline.filter((t) => t.state === 'extracted').length,
        conflictingCount: timeline.filter((t) => t.state === 'conflicting').length,
        missingRequiredCount: recordMap.gaps.filter(
          (g) => g.status === 'missing' && g.requirementKind === 'required',
        ).length,
        openTasksCount: timeline.filter((t) => t.state === 'extracted').length,
        documentCount: allDocs.length,
        readinessBand: recordMap.readiness?.band ?? null,
      },
    };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Failed to get case context' };
  }
}

export async function getConflictingEvidence(
  q: Querier,
  patientId: string,
): Promise<
  ToolResult<{
    conflicts: {
      id: string;
      factType: string;
      members: {
        valueText: string;
        documentId: string;
        documentName: string;
        pageNumber: number | null;
        state: string;
        evidenceFactId: string;
        verbatimQuote: string;
        confidenceBand: string;
        extractorKind: string;
        extractorName: string;
        reviewerName: string | null;
      }[];
    }[];
  }>
> {
  try {
    const conflicts = await listConflicts(q, patientId, 'open');
    const detailed = [];
    for (const c of conflicts) {
      const detail = await getConflict(q, patientId, c.id);
      detailed.push({
        id: c.id,
        factType: c.factType,
        members: (detail?.members ?? []).map((m) => ({
          valueText: m.valueText,
          documentId: m.documentId,
          documentName: m.documentName,
          pageNumber: m.pageNumber,
          state: m.state,
          evidenceFactId: m.factId,
          verbatimQuote: m.verbatimQuote,
          confidenceBand: m.confidenceBand,
          extractorKind: m.extractorKind,
          extractorName: m.extractorName,
          reviewerName: m.reviewerName,
        })),
      });
    }
    return { success: true, data: { conflicts: detailed } };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Failed to get conflicting evidence' };
  }
}

/** Latest evidence whose type, value or document relates to a keyword. */
export async function getLatestEvidenceByType(
  q: Querier,
  patientId: string,
  typeContains: string,
): Promise<ToolResult<EvidenceSearchResult[]>> {
  try {
    const timeline = await getTimeline(q, patientId);
    const lower = typeContains.toLowerCase();
    const matches = timeline.filter((r) => {
      const haystack = `${r.factType} ${r.valueText} ${r.verbatimQuote} ${r.documentName}`.toLowerCase();
      return haystack.includes(lower);
    });
    const sorted = matches.sort((a, b) => {
      const da = a.displayDate ?? '';
      const db = b.displayDate ?? '';
      return db.localeCompare(da);
    });
    return {
      success: true,
      data: sorted.slice(0, 6).map((r) => ({
        evidenceFactId: r.evidenceFactId,
        factType: r.factType,
        valueText: r.valueText,
        displayDate: r.displayDate,
        state: r.state,
        documentId: r.documentId,
        documentName: r.documentName,
        pageNumber: r.pageNumber,
        confidenceBand: r.confidenceBand,
        extractorKind: r.extractorKind,
        extractorName: r.extractorName,
        extractorVersion: r.extractorVersion,
        verbatimQuote: r.verbatimQuote,
        reviewerName: r.reviewerName,
        reviewedAt: r.reviewedAt,
      })),
    };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Failed to get latest evidence' };
  }
}
