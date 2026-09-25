/**
 * Controlled navigation registry. The LLM may only select from these logical
 * actions — it can never invent a URL. Every entry maps to a real OncoBrief
 * route discovered during the repository audit.
 */

export interface SectionDefinition {
  key: string;
  label: string;
  description: string;
  route: (patientId: string) => string;
  keywords: string[];
}

export const ONCOBRIEF_SECTIONS: SectionDefinition[] = [
  {
    key: 'evidence',
    label: 'Evidence Journal',
    description: 'The timeline of every fact extracted from a source document, with its verification state.',
    route: (id) => `/patients/${id}/evidence`,
    keywords: ['evidence', 'journey', 'timeline', 'ledger', 'facts', 'evidence journey'],
  },
  {
    key: 'sources',
    label: 'Sources',
    description: 'The original documents with the supporting text spans highlighted from stored geometry.',
    route: (id) => `/patients/${id}/sources`,
    keywords: ['source', 'sources', 'document', 'documents', 'pdf', 'pdfs', 'scan', 'original', 'page'],
  },
  {
    key: 'conflicts',
    label: 'Reconciliation',
    description: 'Open conflicts where two source documents disagree, and where they are resolved.',
    route: (id) => `/patients/${id}/conflicts`,
    keywords: ['conflict', 'conflicts', 'conflicting', 'reconciliation', 'reconcile', 'disagree', 'disagreement'],
  },
  {
    key: 'record-map',
    label: 'Record Map',
    description: 'The checklist of required and expected documents and whether each is satisfied.',
    route: (id) => `/patients/${id}/record-map`,
    keywords: ['record map', 'missing', 'missing documents', 'checklist', 'required', 'gaps', 'gap'],
  },
  {
    key: 'tasks',
    label: 'Tasks',
    description: 'Administrative tasks linked to evidence, gaps or conflicts.',
    route: (id) => `/patients/${id}/tasks`,
    keywords: ['task', 'tasks', 'todo', 'work item', 'assignment'],
  },
  {
    key: 'packet',
    label: 'Consultation Packet',
    description: 'Build and approve a source-backed consultation packet.',
    route: (id) => `/patients/${id}/packet`,
    keywords: ['packet', 'consultation', 'packet', 'summary', 'handover'],
  },
  {
    key: 'continuity',
    label: 'Continuity',
    description: 'Patient-facing messages composed from verified evidence and approved by a human.',
    route: (id) => `/patients/${id}/continuity`,
    keywords: ['continuity', 'message', 'patient message', 'outreach', 'follow up', 'follow-up'],
  },
  {
    key: 'audit',
    label: 'Audit Trail',
    description: 'The complete append-only audit log of every consequential action.',
    route: (id) => `/patients/${id}/audit`,
    keywords: ['audit', 'log', 'history', 'trail', 'who changed'],
  },
];

export function getSection(key: string): SectionDefinition | undefined {
  return ONCOBRIEF_SECTIONS.find((s) => s.key === key);
}

export interface NavigationTarget {
  action: 'OPEN_CASE' | 'OPEN_EVIDENCE_JOURNEY' | 'OPEN_SOURCES' | 'OPEN_MISSING_DOCUMENTS'
    | 'OPEN_CONTINUITY' | 'OPEN_RECONCILIATION' | 'OPEN_DOCUMENT' | 'OPEN_EVIDENCE';
  section: string;
  label: string;
  href: string;
  query?: Record<string, string>;
}

/**
 * Build a navigation target from a logical action. Only known sections and
 * known IDs flow through here, so the result is always an internal route.
 */
export function buildNavigationTarget(
  action: NavigationTarget['action'],
  patientId: string,
  options?: { documentId?: string; evidenceFactId?: string; pageNumber?: number },
): NavigationTarget | null {
  const sectionByAction: Record<NavigationTarget['action'], string> = {
    OPEN_CASE: 'evidence',
    OPEN_EVIDENCE_JOURNEY: 'evidence',
    OPEN_SOURCES: 'sources',
    OPEN_MISSING_DOCUMENTS: 'record-map',
    OPEN_CONTINUITY: 'continuity',
    OPEN_RECONCILIATION: 'conflicts',
    OPEN_DOCUMENT: 'sources',
    OPEN_EVIDENCE: 'sources',
  };

  const sectionKey = sectionByAction[action];
  const section = getSection(sectionKey);
  if (!section) return null;

  let href = section.route(patientId);
  const query: Record<string, string> = {};

  if ((action === 'OPEN_DOCUMENT' || action === 'OPEN_EVIDENCE') && options?.documentId) {
    href = `/patients/${patientId}/sources/${options.documentId}`;
    if (options.evidenceFactId) query.fact = options.evidenceFactId;
    if (options.pageNumber) query.page = String(options.pageNumber);
  }

  const queryString = Object.keys(query).length > 0 ? `?${new URLSearchParams(query).toString()}` : '';

  return {
    action,
    section: section.label,
    label: section.label,
    href: href + queryString,
    query: Object.keys(query).length > 0 ? query : undefined,
  };
}

/**
 * Deterministic keyword match to a section. Used as a fallback and to avoid
 * letting the LLM invent destinations. Returns the best match, or null.
 */
export function matchSection(text: string): SectionDefinition | null {
  const lower = text.toLowerCase();
  let best: { section: SectionDefinition; score: number } | null = null;

  for (const section of ONCOBRIEF_SECTIONS) {
    let score = 0;
    for (const keyword of section.keywords) {
      if (lower.includes(keyword)) {
        score += keyword.split(' ').length;
      }
    }
    if (score > 0 && (!best || score > best.score)) {
      best = { section, score };
    }
  }

  return best?.section ?? null;
}