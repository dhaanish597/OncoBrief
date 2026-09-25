import { randomUUID } from 'node:crypto';
import type { Querier } from '@oncobrief/db';
import { getPatient, getTimeline } from '@oncobrief/db';
import { chatCompletionWithRetry, NvidiaLlmError } from '@oncobrief/adapters';
import { classifyIntent, type Intent } from './classify';
import {
  searchEvidence,
  getEvidenceDetail,
  getMissingDocuments,
  getContinuityItems,
  getConflictingEvidence,
  getLatestEvidenceByType,
  type EvidenceSearchResult,
} from './tools';
import { matchSection, buildNavigationTarget, ONCOBRIEF_SECTIONS, type NavigationTarget } from './navigation';
import {
  ASSISTANT_SYSTEM_PROMPT,
  buildUserPrompt,
  isEvidenceAnswerGrounded,
  type PromptEvidence,
} from './prompt';

export interface SourceCard {
  evidenceFactId: string;
  documentId: string;
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

export interface NavigationSuggestion {
  action: NavigationTarget['action'];
  label: string;
  href: string;
}

export interface AssistantResponse {
  answer: string;
  intent: Intent;
  grounded: boolean;
  sources: SourceCard[];
  navigation: NavigationSuggestion | null;
  conflict: boolean;
  suggestedQuestions: string[];
  requestId: string;
}

export interface AssistantContext {
  patientId: string | null;
  route: string;
  selectedDocumentId?: string;
  selectedEvidenceId?: string;
  languageCode?: string;
}

export interface AssistantInput {
  message: string;
  context: AssistantContext;
  history?: { role: 'user' | 'assistant'; content: string }[];
}

const NO_EVIDENCE_ANSWER =
  "I couldn't find that information in the selected record set.";

function toSourceCard(item: EvidenceSearchResult): SourceCard {
  const params = new URLSearchParams();
  params.set('fact', item.evidenceFactId);
  if (item.pageNumber) params.set('page', String(item.pageNumber));
  return {
    evidenceFactId: item.evidenceFactId,
    documentId: item.documentId,
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
  return cards.map((c) => ({
    ...c,
    href: `/patients/${patientId}/sources/${c.documentId}?fact=${c.evidenceFactId}${c.pageNumber ? `&page=${c.pageNumber}` : ''}`,
  }));
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
      valueText: `${g.label} — ${g.status}`,
      displayDate: null,
      state: g.status,
      documentId: g.satisfiedByDocumentId ?? '',
      documentName: g.requiredDocumentType,
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
      documentId: t.origin.documentId ?? t.origin.evidenceFactId ?? t.origin.recordGapId ?? '',
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
 * Run one assistant turn. The caller MUST have already authenticated the
 * session and resolved the patient through the existing authorisation path.
 * This function never trusts an unauthenticated patient id.
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

  const sections = ONCOBRIEF_SECTIONS.map((s) => ({ key: s.key, label: s.label, description: s.description }));

  // Unsupported medical questions never reach evidence retrieval or the LLM's
  // general knowledge.
  if (intent === 'unsupported_medical_question') {
    const section = matchSection(message);
    const nav = section && context.patientId
      ? buildNavigationTarget(navActionForSection(section.key), context.patientId)
      : null;
    return {
      answer:
        'Ask OncoBrief is limited to information contained in the authorised OncoBrief record and to guiding you through the application. I can\u2019t answer general medical questions about diagnosis or treatment. I can show you what the record contains and where to find it.',
      intent,
      grounded: false,
      sources: [],
      navigation: nav ? { action: nav.action, label: `Open ${nav.label}`, href: nav.href } : null,
      conflict: false,
      suggestedQuestions: suggestionsFor(context.route, intent),
      requestId,
    };
  }

  // Pure product navigation. Resolved from the controlled registry, never from
  // the model. A confirmation is offered before anything is opened.
  if (intent === 'navigation_question') {
    const section = matchSection(message);
    if (section && context.patientId) {
      const nav = buildNavigationTarget(navActionForSection(section.key), context.patientId);
      return {
        answer: `That's under ${section.label}. Would you like me to open it?`,
        intent,
        grounded: false,
        sources: [],
        navigation: nav ? { action: nav.action, label: `Open ${nav.label}`, href: nav.href } : null,
        conflict: false,
        suggestedQuestions: suggestionsFor(context.route, intent),
        requestId,
      };
    }
    if (section) {
      return {
        answer: `You can find that under ${section.label}. I can take you there once a patient record is selected.`,
        intent,
        grounded: false,
        sources: [],
        navigation: null,
        conflict: false,
        suggestedQuestions: suggestionsFor(context.route, intent),
        requestId,
      };
    }
    return {
      answer:
        'I can guide you to Evidence Journey, Sources, Reconciliation, Record Map, Tasks, Packet, Continuity or Audit. Which would you like?',
      intent,
      grounded: false,
      sources: [],
      navigation: null,
      conflict: false,
      suggestedQuestions: suggestionsFor(context.route, intent),
      requestId,
    };
  }

  if (!context.patientId) {
    return {
      answer:
        'Select a patient record first so I can search the authorised evidence. In the meantime I can guide you around OncoBrief.',
      intent,
      grounded: false,
      sources: [],
      navigation: null,
      conflict: false,
      suggestedQuestions: suggestionsFor(context.route, intent),
      requestId,
    };
  }

  // A malformed id can never be a real patient. Treat it as not found rather
  // than letting a bad uuid reach the database as a cast error.
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!UUID_RE.test(context.patientId)) {
    return {
      answer: 'I couldn\u2019t retrieve the requested OncoBrief information right now. Please try again.',
      intent,
      grounded: false,
      sources: [],
      navigation: null,
      conflict: false,
      suggestedQuestions: [],
      requestId,
    };
  }

  // Authorization: confirm the patient exists and is readable within this
  // tenant. getPatient runs under RLS, so a cross-tenant id returns null.
  const patient = await getPatient(q, context.patientId);
  if (!patient) {
    return {
      answer: 'I couldn\u2019t retrieve the requested OncoBrief information right now. Please try again.',
      intent,
      grounded: false,
      sources: [],
      navigation: null,
      conflict: false,
      suggestedQuestions: [],
      requestId,
    };
  }

  // Retrieval failure must not become a fabricated answer.
  let evidence: PromptEvidence[];
  try {
    // Context-aware questions ("what is this?", "show me the source") resolve
    // against the item the user currently has open, still through the ledger.
    const refersToOpenItem = /\b(this|that|it|the source|these|those|this one)\b/i.test(message);
    if (refersToOpenItem && context.selectedEvidenceId && UUID_RE.test(context.selectedEvidenceId)) {
      const detail = await getEvidenceDetail(q, context.selectedEvidenceId);
      evidence = detail.success && detail.data ? [{ label: 'Selected evidence', items: [detail.data] }] : [];
    } else if (refersToOpenItem && context.selectedDocumentId && UUID_RE.test(context.selectedDocumentId)) {
      const all = await getTimeline(q, context.patientId);
      const items = all.filter((r) => r.documentId === context.selectedDocumentId).slice(0, 10);
      evidence = items.length > 0 ? [{ label: 'Evidence from the open document', items }] : [];
    } else {
      evidence = await retrieveEvidence(q, context.patientId, message, intent);
    }
  } catch {
    return {
      answer: 'I couldn\u2019t retrieve the requested OncoBrief information right now. Please try again.',
      intent,
      grounded: false,
      sources: [],
      navigation: null,
      conflict: false,
      suggestedQuestions: suggestionsFor(context.route, intent),
      requestId,
    };
  }

  const allItems = evidence.flatMap((e) => e.items);
  const conflict = allItems.some((i) => i.factType === 'conflict.member') || evidence.some((e) => e.label.includes('Conflicting'));

  if (allItems.length === 0) {
    // Deterministic no-evidence answer. The LLM is not asked to speculate.
    const target = matchSection(message) ?? (intent === 'missing_documents_question' ? matchSection('record map') : null);
    const nav = target
      ? buildNavigationTarget(navActionForSection(target.key), context.patientId)
      : buildNavigationTarget('OPEN_SOURCES', context.patientId);
    return {
      answer: `${NO_EVIDENCE_ANSWER}\n\nYou can check Evidence Journey \u2192 Sources, or Evidence Journey \u2192 Record Map.`,
      intent,
      grounded: false,
      sources: [],
      navigation: nav ? { action: nav.action, label: `Open ${nav.label}`, href: nav.href } : null,
      conflict: false,
      suggestedQuestions: suggestionsFor(context.route, intent),
      requestId,
    };
  }

  // Build the minimal context and ask the model only to phrase the retrieved
  // facts.
  const userPrompt = buildUserPrompt({
    question: message,
    evidence,
    sections,
    conversationSummary: input.history,
    languageCode: context.languageCode,
  });

  let answer: string;
  let providerModel = 'unknown';
  try {
    const completion = await chatCompletionWithRetry({
      messages: [
        { role: 'system', content: ASSISTANT_SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.1,
      maxTokens: 1024,
    });
    answer = completion.content.trim();
    providerModel = process.env.NVIDIA_MODEL ?? 'configured-model';
  } catch (error) {
    const message2 =
      error instanceof NvidiaLlmError
        ? 'I couldn\u2019t reach the language service right now. Please try again.'
        : 'I couldn\u2019t complete that request right now. Please try again.';
    logAssistant({
      requestId,
      intent,
      latencyMs: Date.now() - startedAt,
      provider: 'nvidia',
      model: providerModel,
      toolUsed: intent,
      success: false,
    });
    return {
      answer: message2,
      intent,
      grounded: false,
      sources: [],
      navigation: null,
      conflict,
      suggestedQuestions: suggestionsFor(context.route, intent),
      requestId,
    };
  }

  const grounding = isEvidenceAnswerGrounded(answer, evidence);
  const validatedAnswer =
    grounding === 'ungrounded' && allItems.length > 0
      ? `${NO_EVIDENCE_ANSWER} I found related evidence but could not produce a grounded answer from it. Please open the sources directly.`
      : answer;

  const deduped = new Map<string, (typeof allItems)[number]>();
  for (const item of allItems) {
    const key = `${item.documentId}|${item.factType}|${item.valueText}`;
    if (!deduped.has(key)) deduped.set(key, item);
  }

  const sources = attachHref(
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
  ).filter((s) => s.documentId !== '');

  // Source navigation: offer to open the top source.
  const top = sources.find((s) => s.documentId);
  const nav = top
    ? {
        action: 'OPEN_EVIDENCE' as const,
        label: `Open ${top.documentName}${top.pageNumber ? ` page ${top.pageNumber}` : ''}`,
        href: top.href,
      }
    : null;

  logAssistant({
    requestId,
    intent,
    latencyMs: Date.now() - startedAt,
    provider: 'nvidia',
    model: providerModel,
    toolUsed: intent,
    success: true,
  });

  return {
    answer: validatedAnswer,
    intent,
    grounded: grounding !== 'ungrounded',
    sources,
    navigation: nav,
    conflict,
    suggestedQuestions: suggestionsFor(context.route, intent),
    requestId,
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

interface LogFields {
  requestId: string;
  intent: string;
  latencyMs: number;
  provider: string;
  model: string;
  toolUsed: string;
  success: boolean;
}

/**
 * Observability. Metadata only — never raw patient content or chat text.
 */
export function logAssistant(fields: LogFields): void {
  if (process.env.NODE_ENV === 'test' || process.env.VITEST === 'true') return;
  console.info(JSON.stringify({ event: 'ask_oncobrief.turn', ...fields, ts: new Date().toISOString() }));
}