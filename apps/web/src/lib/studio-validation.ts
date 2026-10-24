import 'server-only';
import { generateStudioDraft, revalidateStudioMarkdownCitations, validateDeidentification, type StudioArtifactKind } from '@oncobrief/domain';
import { getPatient, getTimeline, listConflicts, listRecordMap, listTasks, searchGuidelineSpans, type ValidatedSession, type StudioArtifactRecord } from '@oncobrief/db';

export async function loadStudioDraftInput(
  q: Parameters<typeof getTimeline>[0], s: ValidatedSession,
  patientId: string, kind: StudioArtifactKind, includeUnverifiedInPreview = false,
  bindings?: { citedFactIds: string[]; citedGuidelineIds: string[]; createdAt?: string },
) {
  const patient = await getPatient(q, patientId);
  if (!patient) throw new Error('patient_not_found');
  const timeline = await getTimeline(q, patientId);
  const conflicts = await listConflicts(q, patientId, 'open');
  const gaps = await listRecordMap(q, patientId);
  const tasks = await listTasks(q, patientId);
  const guidelines = await searchGuidelineSpans(q, s.orgId, 'oncology', { maxResults: 100 });
  // Persisted IDs, never the current timeline position, define citation labels.
  const boundFacts = bindings ? bindings.citedFactIds.map((id) => {
    const fact = timeline.find((item) => item.evidenceFactId === id);
    if (!fact) throw new Error('studio_source_withdrawn_or_unavailable');
    return fact;
  }) : timeline;
  const boundGuidelines = bindings ? bindings.citedGuidelineIds.flatMap((id) => {
    const spans = guidelines.filter((item) => item.guidelineDocumentId === id);
    if (spans.length === 0) throw new Error('studio_guideline_unavailable');
    return spans;
  }) : guidelines;
  return {
    kind,
    documentDate: bindings?.createdAt,
    patient: { id: patient.id, displayName: patient.displayName,
      mrn: patient.demoCode, facilityName: 'Regional Cancer Institute' },
    facts: boundFacts.map((t) => ({
      evidenceFactId: t.evidenceFactId, factType: t.factType, valueText: t.valueText,
      verbatimQuote: t.verbatimQuote, observedOn: t.observedOn, displayDate: t.displayDate,
      documentId: t.documentId, documentName: t.documentName, pageNumber: t.pageNumber,
      state: t.state as 'extracted' | 'verified' | 'corrected' | 'conflicting' | 'rejected' | 'superseded',
    })),
    guidelines: boundGuidelines.map((g) => ({
      spanId: g.spanId, guidelineDocumentId: g.guidelineDocumentId,
      guidelineCode: g.guidelineCode, guidelineTitle: g.guidelineTitle, issuingBody: g.issuingBody,
      versionLabel: g.versionLabel, publicationDate: g.publicationDate, pageNumber: g.pageNumber,
      sectionHeading: g.sectionHeading, verbatimText: g.verbatimText,
    })),
    conflicts: conflicts.map((c) => ({ conflictSetId: c.id, factType: c.factType,
      memberValues: (c.memberValueTexts || []).map((valueText) => ({ valueText, documentName: 'Document in record', pageNumber: 1 })),
      reason: c.detectionReason })),
    gaps: gaps.gaps.map((g) => ({ recordGapId: g.id, label: g.label, requirementKind: g.requirementKind, status: g.status })),
    tasks: tasks.map((t) => ({ taskId: t.id, title: t.title, status: t.status, dueOn: t.dueOn })),
    includeUnverifiedInPreview,
  };
}

export function validateBoundStudioBody(
  markdownBody: string, input: Awaited<ReturnType<typeof loadStudioDraftInput>>,
  bindings: { citedFactIds: string[]; citedGuidelineIds: string[]; title?: string },
) {
  const template = generateStudioDraft(input);
  if (bindings.title !== undefined && bindings.title !== template.title) throw new Error('studio_title_not_grounded');
  // Guidelines are document-bound, with the exact authorized quote retained in
  // the regenerated template. Repeated spans from one document share a label.
  const guidelineDocuments = bindings.citedGuidelineIds.map((id) => input.guidelines.find((g) => g.guidelineDocumentId === id)!);
  const validation = revalidateStudioMarkdownCitations(markdownBody, input.facts, guidelineDocuments, template.markdownBody);
  if (!validation.valid) throw new Error(`cannot_approve_ungrounded_claims: ${[...validation.invalidCitations, ...validation.unverifiedFactIds, ...validation.ungroundedClaims].join('; ')}`);
  // Retain complete immutable bindings; removing all citations cannot turn an
  // evidence-bearing document into an unscoped export.
  if (validation.citedFactIds.length !== bindings.citedFactIds.length ||
      validation.citedGuidelineIds.length !== bindings.citedGuidelineIds.length) {
    throw new Error('studio_citation_bindings_changed: regenerate the document to change its source set');
  }
}

export async function assertStudioArtifactContentSafe(
  q: Parameters<typeof getTimeline>[0], s: ValidatedSession, artifact: StudioArtifactRecord,
): Promise<void> {
  const input = await loadStudioDraftInput(q, s, artifact.patientId, artifact.artifactKind, false, artifact);
  validateBoundStudioBody(artifact.markdownBody, input, artifact);
  if (artifact.isDeidentified && !validateDeidentification(artifact.markdownBody, input.patient).isValid) {
    throw new Error('cannot_approve_privacy_leak');
  }
}
