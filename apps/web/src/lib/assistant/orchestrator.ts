import { randomUUID } from 'node:crypto';
import {
  createAssistantQueryWorkflowGraph,
  type AssistantPendingActionProposal,
  type AssistantWorkflowGraphState,
  type GraphExecutionTraceStep,
} from '@oncobrief/domain';
import type { Querier } from '@oncobrief/db';
import { getPatient, getTimeline } from '@oncobrief/db';
import { chatCompletionWithRetry, NvidiaLlmError, isLlmConfigured } from '@oncobrief/adapters';
import { classifyIntent, detectSubIntents, type Intent, type SubIntent } from './classify';
import {
  searchEvidence,
  getEvidenceDetail,
  getMissingDocuments,
  getContinuityItems,
  getConflictingEvidence,
  getLatestEvidenceByType,
  searchGuidelines,
  type EvidenceSearchResult,
  type GuidelineSearchResult,
} from './tools';
import { matchSection, buildNavigationTarget, ONCOBRIEF_SECTIONS, type NavigationTarget } from './navigation';
import {
  ASSISTANT_SYSTEM_PROMPT,
  GUIDELINE_HEADER,
  buildUserPrompt,
  isEvidenceAnswerGrounded,
  findCitedEvidenceItems,
  findCitedGuidelineItems,
  validateAnswerCitations,
  type PromptEvidence,
  type PromptGuideline,
} from './prompt';

export interface SourceCard {
  evidenceFactId: string;
  documentId: string | null;
  documentName: string;
  pageNumber: number | null;
  factType: string;
  valueText: string;
  verbatimQuote: string;
  state: string;
  confidenceBand: string;
  extractorKind: string;
  extractorName: string;
  reviewerName: string | null;
  reviewedAt: string | null;
  href: string;
}

const UUID_REGEX = /\b[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\b/g;

/**
 * Strips raw internal database UUIDs, storage keys, and internal identifiers
 * from user-facing assistant prose to prevent implementation detail leakage.
 */
export function sanitizeUserFacingProse(text: string): string {
  let cleaned = text
    .replace(/\s*\(documentId=[^)]*\)/gi, '')
    .replace(/\bdocumentId=[0-9a-fA-F-]{36}\b/gi, '')
    .replace(/\s*\(evidenceFactId=[^)]*\)/gi, '')
    .replace(/\bevidenceFactId=[0-9a-fA-F-]{36}\b/gi, '')
    .replace(/\s*\(factId=[^)]*\)/gi, '')
    .replace(/\bfactId=[0-9a-fA-F-]{36}\b/gi, '')
    .replace(/\s*\(id=[^)]*\)/gi, '')
    .replace(/\b(?:with\s+)?id=[0-9a-fA-F-]{36}\b/gi, '')
    .replace(/\bid=[0-9a-fA-F-]{36}\b/gi, '')
    .replace(/\borg\/[0-9a-fA-F-]+\/patient\/[0-9a-fA-F-]+\/doc\/[0-9a-fA-F-]+\/[^\s)]+/gi, '[source-file]');

  cleaned = cleaned.replace(UUID_REGEX, '[record]');

  return cleaned
    .replace(/[^\S\r\n]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/\(\s*\)/g, '')
    .trim();
}

export interface NavigationSuggestion {
  action: NavigationTarget['action'];
  label: string;
  href: string;
}

export interface AssistantResponse {
  answer: string;
  intent: Intent;
  subIntents?: SubIntent[];
  grounded: boolean;
  sources: SourceCard[];
  navigation: NavigationSuggestion | null;
  conflict: boolean;
  suggestedQuestions: string[];
  requestId: string;
  executionTrace?: GraphExecutionTraceStep[];
  visitedNodes?: string[];
  pendingAction?: AssistantPendingActionProposal | null;
  providerMode?: 'deterministic' | 'nvidia-llm' | 'bedrock-llm' | 'hybrid';
}

export interface AssistantContext {
  patientId: string | null;
  route: string;
  selectedDocumentId?: string;
  selectedEvidenceId?: string;
  languageCode?: string;
  allowDeterministicFallbackOnError?: boolean;
}

export interface AssistantInput {
  message: string;
  context: AssistantContext;
  history?: { role: 'user' | 'assistant'; content: string }[];
}

const NO_EVIDENCE_ANSWER =
  "I couldn't find that information in the selected record set.";

/**
 * Deterministic evidence synthesis for when external LLM providers are
 * unconfigured or disabled. Adheres strictly to the Evidence Ledger:
 * quotes recorded values, attaches [E1], [E2] citations, never fabricates
 * or infers clinical facts.
 */
export function synthesizeDeterministicGroundedAnswer(
  intent: Intent,
  evidence: PromptEvidence[],
  message: string,
  conflict: boolean,
): string {
  const allItems = evidence.flatMap((e) => e.items);
  if (allItems.length === 0) {
    return `${NO_EVIDENCE_ANSWER}\n\nYou can check Evidence Journey \u2192 Sources, or Evidence Journey \u2192 Record Map.`;
  }

  if (intent === 'missing_documents_question' && evidence.length === 1) {
    const lines = [
      'Based on the authorized record checklist, the following requirements are currently outstanding:',
    ];
    allItems.forEach((item, idx) => {
      const label = item.documentName.replace(/^Record Checklist:\s*/i, '');
      const stateDesc = item.state === 'partial' ? 'in-flight / pending confirmation' : 'missing';
      const rationale = item.verbatimQuote ? ` (${item.verbatimQuote})` : '';
      lines.push(`- [E${idx + 1}] ${label}: ${stateDesc}${rationale}`);
    });
    lines.push('\nYou can review requirements and link documents in Evidence Journey \u2192 Record Map.');
    return lines.join('\n');
  }

  if (intent === 'continuity_question' && evidence.length === 1) {
    const lines = [
      'Based on the authorized record, here are the outstanding continuity and administrative tasks:',
    ];
    allItems.forEach((item, idx) => {
      const due = item.displayDate ? ` (due ${item.displayDate})` : '';
      lines.push(`- [E${idx + 1}] ${item.valueText}${due}`);
    });
    lines.push('\nYou can review tasks in Evidence Journey \u2192 Continuity.');
    return lines.join('\n');
  }

  const isConflictQuery =
    conflict ||
    /conflict|disagree|reconcil/i.test(message) ||
    allItems.some((i) => i.state === 'conflicting' || i.factType === 'conflict.member');

  if (isConflictQuery && evidence.length === 1) {
    const lines = ['Conflicting evidence identified in the authorized record:'];
    allItems.forEach((item, idx) => {
      const page = item.pageNumber ? ` page ${item.pageNumber}` : '';
      lines.push(
        `- [E${idx + 1}] ${item.documentName}${page}: recorded "${item.valueText}" (${item.verbatimQuote})`,
      );
    });
    lines.push(
      '\nNeither source has been chosen over the other. You can review and reconcile these records in Evidence Journey \u2192 Reconciliation.',
    );
    return lines.join('\n');
  }

  // General or multi-intent evidence synthesis
  const lines = ['Based on the authorized evidence for this patient:'];
  allItems.slice(0, 10).forEach((item, idx) => {
    const page = item.pageNumber ? ` page ${item.pageNumber}` : '';
    const date = item.displayDate ? ` recorded on ${item.displayDate}` : '';
    const reviewer = item.reviewerName ? `, verified by ${item.reviewerName}` : '';
    lines.push(`- [E${idx + 1}] ${item.documentName}${page}: ${item.valueText}${date}${reviewer}`);
  });
  lines.push('\nYou can inspect the underlying document pages and provenance in Evidence Journey \u2192 Sources.');
  return lines.join('\n');
}

export function synthesizeDeterministicGuidelineAnswer(
  spans: GuidelineSearchResult[],
): string {
  const lines = [
    GUIDELINE_HEADER,
    '',
    'Based on hospital-approved institutional guidelines and clinical protocols:',
  ];

  spans.forEach((span, idx) => {
    lines.push(
      `\n- [G${idx + 1}] **${span.sectionHeading}** (${span.guidelineTitle}, ${span.versionLabel}, p. ${span.pageNumber}):\n  > "${span.verbatimText}"`,
    );
  });

  lines.push(
    '\n*This extract is provided for clinician reference only and does not constitute a patient-specific order or recommendation.*',
  );
  return lines.join('\n');
}

function toSourceCard(item: EvidenceSearchResult): SourceCard {
  return {
    evidenceFactId: item.evidenceFactId,
    documentId: item.documentId || null,
    documentName: item.documentName,
    pageNumber: item.pageNumber,
    factType: item.factType,
    valueText: item.valueText,
    verbatimQuote: item.verbatimQuote,
    state: item.state,
    confidenceBand: item.confidenceBand,
    extractorKind: item.extractorKind,
    extractorName: item.extractorName,
    reviewerName: item.reviewerName,
    reviewedAt: item.reviewedAt,
    href: '', // filled by caller with patientId
  };
}

function attachHref(cards: SourceCard[], patientId: string): SourceCard[] {
  return cards.map((c) => {
    let href = '';
    if (c.factType === 'record.requirement' || c.extractorName === 'record-map.checklist') {
      href = `/patients/${patientId}/record-map`;
    } else if (c.factType === 'task' || c.extractorName === 'admin.task') {
      href = `/patients/${patientId}/tasks`;
    } else if (c.documentId) {
      href = `/patients/${patientId}/sources/${c.documentId}?fact=${c.evidenceFactId}${c.pageNumber ? `&page=${c.pageNumber}` : ''}`;
    } else {
      href = `/patients/${patientId}/evidence`;
    }
    return {
      ...c,
      href,
    };
  });
}

function suggestionsFor(route: string, _intent: Intent): string[] {
  if (route.includes('/record-map')) {
    return ['What documents are still missing?', 'Show the latest pathology report', 'Show conflicting evidence'];
  }
  if (route.includes('/conflicts')) {
    return ['Show me conflicting evidence', 'What documents are missing?', 'Take me to Sources'];
  }
  if (route.includes('/continuity')) {
    return ['Show continuity items', 'What documents are missing?', 'Take me to Consultation Packet'];
  }
  if (route.includes('/sources')) {
    return ['Show the latest pathology report', 'Show conflicting evidence', 'What documents are missing?'];
  }
  if (route.includes('/evidence')) {
    return ['Show me conflicting evidence', 'Show the latest pathology report', 'What documents are missing?'];
  }
  return [
    'Show the latest pathology report',
    'What documents are missing?',
    'Show conflicting evidence',
    'Take me to Evidence Journey',
  ];
}

/**
 * Retrieve the minimal authorised evidence needed for an intent. Never returns
 * the whole record; each branch scopes and ranks.
 */
async function retrieveEvidence(
  q: Querier,
  patientId: string,
  message: string,
  intent: Intent,
): Promise<PromptEvidence[]> {
  if (intent === 'missing_documents_question') {
    const result = await getMissingDocuments(q, patientId);
    const items = (result.data ?? []).map((g) => ({
      evidenceFactId: g.id,
      factType: 'record.requirement',
      valueText: `${g.label} — ${g.status === 'partial' ? 'in-flight / pending confirmation' : 'missing'}`,
      displayDate: null,
      state: g.status,
      documentId: g.satisfiedByDocumentId ?? g.candidateDocumentId ?? '',
      documentName: `Record Checklist: ${g.label}`,
      pageNumber: null,
      confidenceBand: 'n/a',
      extractorKind: 'rule',
      extractorName: 'record-map.checklist',
      extractorVersion: 'v1',
      verbatimQuote: g.rationale,
      reviewerName: null,
      reviewedAt: null,
    }));
    return items.length > 0 ? [{ label: 'Missing / partial record requirements', items }] : [];
  }

  if (intent === 'continuity_question') {
    const result = await getContinuityItems(q, patientId);
    const items = (result.data ?? []).map((t) => ({
      evidenceFactId: t.id,
      factType: 'task',
      valueText: `${t.title} — ${t.status}`,
      displayDate: t.dueOn,
      state: t.status,
      documentId: t.origin.documentId ?? '',
      documentName: 'task origin',
      pageNumber: null,
      confidenceBand: 'n/a',
      extractorKind: 'human' as const,
      extractorName: 'admin.task',
      extractorVersion: 'v1',
      verbatimQuote: t.detail ?? t.title,
      reviewerName: t.creatorName,
      reviewedAt: null,
    }));
    return items.length > 0 ? [{ label: 'Continuity / administrative items', items }] : [];
  }

  // Evidence question. Prefer conflicts if the question is about disagreement.
  if (/conflict|disagree|reconcil/i.test(message)) {
    const result = await getConflictingEvidence(q, patientId);
    const conflicts = result.data?.conflicts ?? [];
    if (conflicts.length === 0) return [];
    const items: EvidenceSearchResult[] = [];
    for (const c of conflicts) {
      for (const m of c.members) {
        items.push({
          evidenceFactId: m.evidenceFactId,
          factType: c.factType,
          valueText: m.valueText,
          displayDate: null,
          state: m.state,
          documentId: m.documentId,
          documentName: m.documentName,
          pageNumber: m.pageNumber,
          confidenceBand: m.confidenceBand,
          extractorKind: m.extractorKind,
          extractorName: m.extractorName,
          extractorVersion: 'v1',
          verbatimQuote: m.verbatimQuote,
          reviewerName: m.reviewerName,
          reviewedAt: null,
        });
      }
    }
    return [{ label: 'Conflicting evidence (unresolved disagreements)', items }];
  }

  // General evidence search.
  const result = await searchEvidence(q, patientId, message);
  let items = result.data ?? [];

  // If a text search finds nothing but the question names a clinical object,
  // fall back to the latest evidence of that type.
  if (items.length === 0) {
    const typeMatch = message.match(
      /\b(pathology|biopsy|histology|mri|ct|pet|scan|x-?ray|lab|chemo|chemotherapy|radiation|surgery|medication|appointment|diagnosis)\b/i,
    );
    if (typeMatch) {
      const latest = await getLatestEvidenceByType(q, patientId, typeMatch[1]!.toLowerCase());
      items = latest.data ?? [];
    }
  }

  return items.length > 0 ? [{ label: 'Matched evidence', items }] : [];
}

/**
 * Run one assistant turn through the bounded multi-step `assistantQueryWorkflowGraph` (`TASK-009`).
 * The caller MUST have already authenticated the session and resolved the patient
 * through the existing authorisation path.
 */
export async function runAssistant(
  q: Querier,
  input: AssistantInput,
): Promise<AssistantResponse> {
  const requestId = randomUUID();
  const startedAt = Date.now();
  const { message, context } = input;

  const classification = await classifyIntent(message);
  const intent = classification.intent;
  const subIntents = detectSubIntents(message, intent);

  const sections = ONCOBRIEF_SECTIONS.map((s) => ({ key: s.key, label: s.label, description: s.description }));

  // Pure product navigation is resolved from the controlled registry before graph retrieval.
  if (intent === 'navigation_question') {
    const section = matchSection(message);
    if (section && context.patientId) {
      const nav = buildNavigationTarget(navActionForSection(section.key), context.patientId);
      return {
        answer: `That's under ${section.label}. Would you like me to open it?`,
        intent,
        subIntents: [],
        grounded: false,
        sources: [],
        navigation: nav ? { action: nav.action, label: `Open ${nav.label}`, href: nav.href } : null,
        conflict: false,
        suggestedQuestions: suggestionsFor(context.route, intent),
        requestId,
        executionTrace: [
          {
            stepIndex: 0,
            nodeId: 'navigation_router',
            label: 'Controlled Navigation Registry',
            outcome: 'ok',
            durationMs: Math.max(0, Date.now() - startedAt),
            detail: `target=${section.key}`,
          },
        ],
        visitedNodes: ['navigation_router'],
        pendingAction: null,
        providerMode: 'deterministic',
      };
    }
    if (section) {
      return {
        answer: `You can find that under ${section.label}. I can take you there once a patient record is selected.`,
        intent,
        subIntents: [],
        grounded: false,
        sources: [],
        navigation: null,
        conflict: false,
        suggestedQuestions: suggestionsFor(context.route, intent),
        requestId,
        executionTrace: [],
        visitedNodes: ['navigation_router'],
        pendingAction: null,
        providerMode: 'deterministic',
      };
    }
    return {
      answer:
        'I can guide you to Evidence Journey, Sources, Reconciliation, Record Map, Tasks, Packet, Continuity or Audit. Which would you like?',
      intent,
      subIntents: [],
      grounded: false,
      sources: [],
      navigation: null,
      conflict: false,
      suggestedQuestions: suggestionsFor(context.route, intent),
      requestId,
      executionTrace: [],
      visitedNodes: ['navigation_router'],
      pendingAction: null,
      providerMode: 'deterministic',
    };
  }

  let evidence: PromptEvidence[] = [];
  let guidelineSpans: GuidelineSearchResult[] = [];
  let retrievalFailed = false;
  let llmFailedResponse: string | null = null;
  let sources: SourceCard[] = [];
  let conflict = false;
  let nav: NavigationSuggestion | null = null;
  let pendingProposal: AssistantPendingActionProposal | null = null;

  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  const coPilotGraph = createAssistantQueryWorkflowGraph({
    onSafetyAndIntentGate: async (state) => ({
      ...state,
      primaryIntent: intent,
      subIntents,
      isBoundaryRefusal: intent === 'unsupported_medical_question',
    }),
    onBoundaryRefusal: async (state) => {
      const section = matchSection(message);
      const refusalNav =
        section && context.patientId
          ? buildNavigationTarget(navActionForSection(section.key), context.patientId)
          : null;
      if (refusalNav) {
        nav = { action: refusalNav.action, label: `Open ${refusalNav.label}`, href: refusalNav.href };
      }
      return {
        ...state,
        grounded: false,
        answer:
          'Ask OncoBrief is limited to information contained in the authorised OncoBrief record and to guiding you through the application. I can\u2019t answer general medical questions about diagnosis or treatment. I can show you what the record contains and where to find it.',
      };
    },
    onPlanSubgoals: async (state) => state,
    onRetrieveEvidenceAndGuidelines: async (state) => {
      let evidenceCount = 0;
      let guidelineCount = 0;
      let missingDocsCount = 0;
      let continuityCount = 0;

      // 1. Retrieve Institutional Guidelines if requested in primary or sub-intents
      if (intent === 'guideline_knowledge_question' || subIntents.includes('guideline_knowledge_question')) {
        let orgId = '';
        try {
          const orgRes = await q.query<{ org_id: string }>("SELECT current_setting('app.org_id', true) AS org_id");
          orgId = orgRes.rows[0]?.org_id ?? '';
        } catch {
          // ignore
        }
        if (!orgId && context.patientId && UUID_RE.test(context.patientId)) {
          const patient = await getPatient(q, context.patientId);
          if (patient) {
            const orgRes = await q.query<{ org_id: string }>('SELECT org_id FROM patient WHERE id = $1', [context.patientId]);
            orgId = orgRes.rows[0]?.org_id ?? '';
          }
        }
        const gRes = await searchGuidelines(q, orgId, message);
        guidelineSpans = gRes.success && gRes.data ? gRes.data : [];
        guidelineCount = guidelineSpans.length;
      }

      // 2. If patient-scoped retrieval is also needed, validate patientId and tenant access
      const needsPatientRetrieval =
        intent !== 'guideline_knowledge_question' ||
        subIntents.some((si) => si !== 'guideline_knowledge_question');

      if (needsPatientRetrieval && context.patientId) {
        if (!UUID_RE.test(context.patientId)) {
          retrievalFailed = true;
          return state;
        }
        const patient = await getPatient(q, context.patientId);
        if (!patient) {
          retrievalFailed = true;
          return state;
        }

        try {
          const refersToOpenItem = /\b(this|that|it|the source|these|those|this one)\b/i.test(message);
          if (refersToOpenItem && context.selectedEvidenceId && UUID_RE.test(context.selectedEvidenceId)) {
            const detail = await getEvidenceDetail(q, context.selectedEvidenceId);
            if (detail.success && detail.data) {
              evidence.push({ label: 'Selected evidence', items: [detail.data] });
              evidenceCount += 1;
            }
          } else if (refersToOpenItem && context.selectedDocumentId && UUID_RE.test(context.selectedDocumentId)) {
            const all = await getTimeline(q, context.patientId);
            const items = all.filter((r) => r.documentId === context.selectedDocumentId).slice(0, 10);
            if (items.length > 0) {
              evidence.push({ label: 'Evidence from the open document', items });
              evidenceCount += items.length;
            }
          } else {
            // Execute all planned patient-scoped retrieval tools (multi-intent support)
            const patientSubIntents = subIntents.filter(
              (si): si is 'evidence_question' | 'missing_documents_question' | 'continuity_question' =>
                si === 'evidence_question' || si === 'missing_documents_question' || si === 'continuity_question',
            );
            const effectiveBranches: Intent[] =
              patientSubIntents.length > 0 ? patientSubIntents : [intent];

            for (const branchIntent of effectiveBranches) {
              const branchEvidence = await retrieveEvidence(q, context.patientId, message, branchIntent);
              for (const group of branchEvidence) {
                evidence.push(group);
                if (branchIntent === 'missing_documents_question') missingDocsCount += group.items.length;
                else if (branchIntent === 'continuity_question') continuityCount += group.items.length;
                else evidenceCount += group.items.length;
              }
            }
          }
        } catch {
          retrievalFailed = true;
        }
      }

      return {
        ...state,
        evidenceRetrievedCount: evidenceCount,
        guidelinesRetrievedCount: guidelineCount,
        missingDocsRetrievedCount: missingDocsCount,
        continuityRetrievedCount: continuityCount,
      };
    },
    onProposeActionGate: async (state) => {
      // Stage a human-confirmed task proposal when requested (NEVER writes to DB here)
      if (!subIntents.includes('propose_task_action') || !context.patientId || retrievalFailed) {
        return state;
      }

      const allItems = evidence.flatMap((e) => e.items);
      const gapItem = allItems.find((i) => i.factType === 'record.requirement');
      const pendingFact = allItems.find(
        (i) => i.factType === 'pending_investigation.recorded' || i.factType === 'instruction.recorded',
      ) ?? allItems[0];

      if (gapItem) {
        const cleanLabel = gapItem.documentName.replace(/^Record Checklist:\s*/i, '');
        pendingProposal = {
          proposalId: `prop-${randomUUID().slice(0, 8)}`,
          actionKind: 'create_task_from_gap',
          title: `Retrieve missing record: ${cleanLabel}`,
          detail: gapItem.verbatimQuote || `Follow up on missing ${cleanLabel} before consultation`,
          taskKind: 'missing_document_followup',
          patientId: context.patientId,
          originKind: 'record_gap',
          originId: gapItem.evidenceFactId,
          citedFactIds: [],
          status: 'awaiting_human_approval',
        };
      } else if (pendingFact) {
        pendingProposal = {
          proposalId: `prop-${randomUUID().slice(0, 8)}`,
          actionKind: 'create_task_from_evidence',
          title: `Follow up on documented item: ${pendingFact.valueText.slice(0, 72)}`,
          detail: `Source: ${pendingFact.documentName} — "${pendingFact.verbatimQuote.slice(0, 140)}"`,
          taskKind: 'verify_source',
          patientId: context.patientId,
          originKind: 'evidence',
          originId: pendingFact.evidenceFactId,
          citedFactIds: [pendingFact.evidenceFactId],
          status: 'awaiting_human_approval',
        };
      }

      return {
        ...state,
        pendingActionProposal: pendingProposal,
      };
    },
    onSynthesizeGroundedAnswer: async (state) => {
      // Pure guideline query (or compound guideline + evidence query)
      if (intent === 'guideline_knowledge_question' && evidence.length === 0) {
        if (guidelineSpans.length === 0) {
          return {
            ...state,
            grounded: false,
            providerMode: 'deterministic',
            answer: `${GUIDELINE_HEADER}\n\nI couldn't find relevant institutional oncology SOPs or guidelines matching that query in the active reference library.`,
          };
        }

        const promptGuidelines: PromptGuideline[] = [
          {
            label: 'Approved Institutional Oncology Guidelines',
            items: guidelineSpans.map((s) => ({
              spanId: s.spanId,
              guidelineDocumentId: s.guidelineDocumentId,
              guidelineCode: s.guidelineCode,
              guidelineTitle: s.guidelineTitle,
              issuingBody: s.issuingBody,
              versionLabel: s.versionLabel,
              publicationDate: s.publicationDate,
              pageNumber: s.pageNumber,
              sectionHeading: s.sectionHeading,
              spanIndex: s.spanIndex,
              verbatimText: s.verbatimText,
              bbox: s.bbox,
              keywords: s.keywords,
            })),
          },
        ];

        let answerText: string;
        let citedSpans: GuidelineSearchResult[] = [];
        let mode: AssistantWorkflowGraphState['providerMode'] = 'deterministic';

        if (isLlmConfigured()) {
          try {
            const userPrompt = buildUserPrompt({
              question: message,
              evidence: [],
              guidelines: promptGuidelines,
              sections,
              languageCode: context.languageCode,
            });

            const resp = await chatCompletionWithRetry(
              {
                messages: [
                  { role: 'system', content: ASSISTANT_SYSTEM_PROMPT },
                  { role: 'user', content: userPrompt },
                ],
                temperature: 0.1,
                maxTokens: 500,
                timeoutMs: 3000,
              },
              0,
            );

            const raw = resp.content.trim();
            const citedItems = findCitedGuidelineItems(raw, promptGuidelines);
            const validation = validateAnswerCitations(raw, [], promptGuidelines[0]!.items);

            if (citedItems.length > 0 && validation.valid) {
              citedSpans = guidelineSpans.filter((s) => citedItems.some((ci) => ci.spanId === s.spanId));
              answerText = raw.startsWith(GUIDELINE_HEADER) ? raw : `${GUIDELINE_HEADER}\n\n${raw}`;
              mode = 'nvidia-llm';
            } else {
              answerText = synthesizeDeterministicGuidelineAnswer(guidelineSpans);
              citedSpans = guidelineSpans;
            }
          } catch {
            answerText = synthesizeDeterministicGuidelineAnswer(guidelineSpans);
            citedSpans = guidelineSpans;
          }
        } else {
          answerText = synthesizeDeterministicGuidelineAnswer(guidelineSpans);
          citedSpans = guidelineSpans;
        }

        sources = citedSpans.map((s) => ({
          evidenceFactId: s.spanId,
          documentId: s.guidelineDocumentId,
          documentName: `${s.guidelineTitle} (${s.versionLabel})`,
          pageNumber: s.pageNumber,
          factType: 'guideline.span',
          valueText: `${s.sectionHeading} (p. ${s.pageNumber})`,
          verbatimQuote: s.verbatimText,
          state: 'verified',
          confidenceBand: 'high',
          extractorKind: 'system',
          extractorName: s.issuingBody,
          reviewerName: 'Approved Institutional Reference',
          reviewedAt: s.publicationDate,
          href: context.patientId
            ? `/patients/${context.patientId}/sources?guideline=${s.guidelineDocumentId}&page=${s.pageNumber}`
            : `/sources?guideline=${s.guidelineDocumentId}&page=${s.pageNumber}`,
        }));

        return {
          ...state,
          grounded: true,
          providerMode: mode,
          answer: sanitizeUserFacingProse(answerText),
        };
      }

      if (!context.patientId) {
        return {
          ...state,
          grounded: false,
          providerMode: 'deterministic',
          answer:
            'Select a patient record first so I can search the authorised evidence. In the meantime I can guide you around OncoBrief.',
        };
      }

      if (retrievalFailed) {
        return {
          ...state,
          grounded: false,
          providerMode: 'deterministic',
          answer: 'I couldn\u2019t retrieve the requested OncoBrief information right now. Please try again.',
        };
      }

      const allItems = evidence.flatMap((e) => e.items);
      conflict =
        allItems.some((i) => i.factType === 'conflict.member' || i.state === 'conflicting') ||
        evidence.some((e) => e.label.includes('Conflicting'));

      if (allItems.length === 0 && guidelineSpans.length === 0) {
        const target =
          matchSection(message) ?? (intent === 'missing_documents_question' ? matchSection('record map') : null);
        const builtNav = target
          ? buildNavigationTarget(navActionForSection(target.key), context.patientId)
          : buildNavigationTarget('OPEN_SOURCES', context.patientId);
        if (builtNav) {
          nav = { action: builtNav.action, label: `Open ${builtNav.label}`, href: builtNav.href };
        }
        return {
          ...state,
          grounded: false,
          providerMode: 'deterministic',
          answer: `${NO_EVIDENCE_ANSWER}\n\nYou can check Evidence Journey \u2192 Sources, or Evidence Journey \u2192 Record Map.`,
        };
      }

      const promptGuidelines: PromptGuideline[] =
        guidelineSpans.length > 0
          ? [
              {
                label: 'Approved Institutional Oncology Guidelines',
                items: guidelineSpans.map((s) => ({
                  spanId: s.spanId,
                  guidelineDocumentId: s.guidelineDocumentId,
                  guidelineCode: s.guidelineCode,
                  guidelineTitle: s.guidelineTitle,
                  issuingBody: s.issuingBody,
                  versionLabel: s.versionLabel,
                  publicationDate: s.publicationDate,
                  pageNumber: s.pageNumber,
                  sectionHeading: s.sectionHeading,
                  spanIndex: s.spanIndex,
                  verbatimText: s.verbatimText,
                  bbox: s.bbox,
                  keywords: s.keywords,
                })),
              },
            ]
          : [];

      const userPrompt = buildUserPrompt({
        question: message,
        evidence,
        ...(promptGuidelines.length > 0 ? { guidelines: promptGuidelines } : {}),
        sections,
        conversationSummary: input.history,
        languageCode: context.languageCode,
      });

      const shouldUseLlm = typeof isLlmConfigured === 'function' ? isLlmConfigured() : true;
      let rawAnswer = '';
      let mode: AssistantWorkflowGraphState['providerMode'] = 'deterministic';

      if (shouldUseLlm) {
        try {
          const completion = await chatCompletionWithRetry({
            messages: [
              { role: 'system', content: ASSISTANT_SYSTEM_PROMPT },
              { role: 'user', content: userPrompt },
            ],
            temperature: 0.1,
            maxTokens: 1024,
          });
          rawAnswer = completion.content.trim();
          mode = 'nvidia-llm';
        } catch (error) {
          if (context.allowDeterministicFallbackOnError) {
            rawAnswer = synthesizeDeterministicGroundedAnswer(intent, evidence, message, conflict);
            mode = 'deterministic';
          } else {
            llmFailedResponse =
              error instanceof NvidiaLlmError
                ? 'I couldn\u2019t reach the language service right now. Please try again.'
                : 'I couldn\u2019t complete that request right now. Please try again.';
            logAssistant({
              requestId,
              intent,
              latencyMs: Date.now() - startedAt,
              provider: 'nvidia',
              model: process.env.NVIDIA_MODEL ?? 'configured-model',
              toolUsed: intent,
              success: false,
            });
            return {
              ...state,
              grounded: false,
              providerMode: 'deterministic',
              answer: llmFailedResponse,
            };
          }
        }
      } else {
        rawAnswer = synthesizeDeterministicGroundedAnswer(intent, evidence, message, conflict);
        mode = 'deterministic';
      }

      if (guidelineSpans.length > 0 && !rawAnswer.includes('[G')) {
        rawAnswer = `${rawAnswer}\n\n${synthesizeDeterministicGuidelineAnswer(guidelineSpans)}`;
      }

      if (pendingProposal) {
        rawAnswer = `${rawAnswer}\n\n**Proposed Action Ready for Confirmation:** ${pendingProposal.title}. Please review and confirm below before any task is created.`;
      }

      return {
        ...state,
        providerMode: mode,
        answer: rawAnswer,
      };
    },
    onVerifyCitationsGate: async (state) => {
      if (intent === 'guideline_knowledge_question' && evidence.length === 0) {
        return state;
      }
      if (!context.patientId || retrievalFailed || llmFailedResponse) {
        return state;
      }
      const allItems = evidence.flatMap((e) => e.items);
      if (allItems.length === 0 && guidelineSpans.length === 0) {
        return state;
      }

      const grounding = isEvidenceAnswerGrounded(state.answer, evidence);
      const validatedAnswer =
        grounding === 'ungrounded' && allItems.length > 0
          ? `${NO_EVIDENCE_ANSWER} I found related evidence but could not produce a grounded answer from it. Please open the sources directly.`
          : state.answer;

      const sanitizedAnswer = sanitizeUserFacingProse(validatedAnswer);

      let relevantItems: typeof allItems = [];
      if (grounding === 'grounded') {
        const cited = findCitedEvidenceItems(state.answer, evidence);
        relevantItems = cited.length > 0 ? cited : allItems;
      }

      const deduped = new Map<string, (typeof allItems)[number]>();
      for (const item of relevantItems) {
        const key = `${item.documentId}|${item.factType}|${item.valueText}`;
        if (!deduped.has(key)) deduped.set(key, item);
      }

      const evidenceCards = attachHref(
        [...deduped.values()].slice(0, 6).map((item) =>
          toSourceCard({
            evidenceFactId: item.evidenceFactId,
            factType: item.factType,
            valueText: item.valueText,
            displayDate: item.displayDate,
            state: item.state,
            documentId: item.documentId,
            documentName: item.documentName,
            pageNumber: item.pageNumber,
            confidenceBand: item.confidenceBand,
            extractorKind: item.extractorKind,
            extractorName: item.extractorName,
            extractorVersion: item.extractorVersion,
            verbatimQuote: item.verbatimQuote,
            reviewerName: item.reviewerName,
            reviewedAt: item.reviewedAt,
          }),
        ),
        context.patientId,
      ).filter((s) => s.href !== '');

      const guidelineCards: SourceCard[] = guidelineSpans.slice(0, 4).map((s) => ({
        evidenceFactId: s.spanId,
        documentId: s.guidelineDocumentId,
        documentName: `${s.guidelineTitle} (${s.versionLabel})`,
        pageNumber: s.pageNumber,
        factType: 'guideline.span',
        valueText: `${s.sectionHeading} (p. ${s.pageNumber})`,
        verbatimQuote: s.verbatimText,
        state: 'verified',
        confidenceBand: 'high',
        extractorKind: 'system',
        extractorName: s.issuingBody,
        reviewerName: 'Approved Institutional Reference',
        reviewedAt: s.publicationDate,
        href: `/patients/${context.patientId}/sources?guideline=${s.guidelineDocumentId}&page=${s.pageNumber}`,
      }));

      sources = [...evidenceCards, ...guidelineCards];
      const isGrounded = (grounding === 'grounded' && evidenceCards.length > 0) || guidelineCards.length > 0;

      const top = evidenceCards[0];
      if (top) {
        nav = {
          action:
            top.factType === 'record.requirement'
              ? ('OPEN_MISSING_DOCUMENTS' as const)
              : top.factType === 'task'
                ? ('OPEN_CONTINUITY' as const)
                : ('OPEN_EVIDENCE' as const),
          label:
            top.factType === 'record.requirement'
              ? 'Open Record Map'
              : top.factType === 'task'
                ? 'Open Tasks'
                : `Open ${top.documentName}${top.pageNumber ? ` page ${top.pageNumber}` : ''}`,
          href: top.href,
        };
      }

      logAssistant({
        requestId,
        intent,
        latencyMs: Date.now() - startedAt,
        provider: state.providerMode === 'nvidia-llm' ? 'nvidia' : 'deterministic',
        model: state.providerMode === 'nvidia-llm' ? (process.env.NVIDIA_MODEL ?? 'configured-model') : 'deterministic-rules',
        toolUsed: subIntents.join('+') || intent,
        success: true,
      });

      return {
        ...state,
        grounded: isGrounded,
        answer: sanitizedAnswer,
      };
    },
  });

  const graphRun = await coPilotGraph.run({
    message,
    patientId: context.patientId,
    primaryIntent: intent,
    subIntents,
    isBoundaryRefusal: false,
    evidenceRetrievedCount: 0,
    guidelinesRetrievedCount: 0,
    missingDocsRetrievedCount: 0,
    continuityRetrievedCount: 0,
    pendingActionProposal: null,
    providerMode: 'deterministic',
    grounded: false,
    answer: '',
  });

  const invalidUuidOrMissingPatient =
    retrievalFailed &&
    context.patientId &&
    (!UUID_RE.test(context.patientId) || sources.length === 0);

  return {
    answer: graphRun.finalState.answer,
    intent,
    subIntents,
    grounded: graphRun.finalState.grounded,
    sources,
    navigation: nav,
    conflict,
    suggestedQuestions: invalidUuidOrMissingPatient ? [] : suggestionsFor(context.route, intent),
    requestId,
    executionTrace: graphRun.trace,
    visitedNodes: graphRun.visitedNodes,
    pendingAction: graphRun.finalState.pendingActionProposal,
    providerMode: graphRun.finalState.providerMode,
  };
}

function navActionForSection(sectionKey: string): NavigationTarget['action'] {
  switch (sectionKey) {
    case 'evidence':
      return 'OPEN_EVIDENCE_JOURNEY';
    case 'sources':
      return 'OPEN_SOURCES';
    case 'record-map':
      return 'OPEN_MISSING_DOCUMENTS';
    case 'continuity':
      return 'OPEN_CONTINUITY';
    case 'conflicts':
      return 'OPEN_RECONCILIATION';
    default:
      return 'OPEN_CASE';
  }
}

interface AssistantLogEntry {
  requestId: string;
  intent: Intent;
  latencyMs: number;
  provider: string;
  model: string;
  toolUsed: string;
  success: boolean;
}

/**
 * Operational telemetry only. Never logs the user message, the assistant
 * answer, or any patient identifier (architecture §13.3).
 */
function logAssistant(entry: AssistantLogEntry): void {
  if (process.env.NODE_ENV === 'test') return;
  process.stdout.write(`${JSON.stringify({ event: 'assistant.turn', ...entry })}\n`);
}
