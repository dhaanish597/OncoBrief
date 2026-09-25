import { chatCompletion } from '@oncobrief/adapters';

export type Intent =
  | 'evidence_question'
  | 'missing_documents_question'
  | 'continuity_question'
  | 'navigation_question'
  | 'unsupported_medical_question'
  | 'ambiguous_question';

const NAVIGATION_PATTERNS = [
  /\b(go to|take me to|open|navigate to|show me the|where (?:is|can i find|are)|how do i (?:get to|find))\b/i,
  /\bi (?:want|need|would like) to (?:see|view|open|find)\b/i,
];

const MISSING_DOC_PATTERNS = [
  /\b(missing|required|outstanding|needed|still need|gaps?)\b.*\b(document|documents|records?|reports?)\b/i,
  /\b(?:what|which)\b[^?]*\b(?:documents|records?|reports?)\b[^?]*\b(missing|required|needed|outstanding|still needed)\b/i,
  /\bwhat(?:'s| is) missing\b/i,
];

const CONTINUITY_PATTERNS = [
  /\b(continuity|patient message|follow[- ]?up|outreach|message to (?:the )?patient)\b/i,
  /\bapproved (?:patient )?message/i,
];

const CONFLICT_PATTERNS = [
  /\b(conflict|conflicting|disagree|reconcil)\b/i,
];

const UNSUPPORTED_MEDICAL_PATTERNS = [
  /\bwhat (?:is|are) (?:breast |lung |colon |prostate )?cancer\b/i,
  /\bwhat (?:treatment|drug|therapy|medication|regimen) (?:should|do you recommend|is recommended|is used|would)\b/i,
  /\bwhat does (?:this|the|my|their) diagnos(?:is|es) (?:usually )?mean\b/i,
  /\bhow (?:do|should) (?:i|we|you) treat\b/i,
  /\bwhat(?:'s| is) the (?:best|recommended|standard) (?:treatment|drug|therapy)\b/i,
  /\bprognosis\b/i,
  /\bwhat (?:is|are) the side effects\b/i,
  /\bwhat (?:dose|dosage)\b/i,
  /\bcan you (?:diagnose|prescribe)\b/i,
  /\bwhat(?:'s| is) the survival rate\b/i,
];

const EVIDENCE_PATTERNS = [
  /\b(pathology|biopsy|histology|report|scan|mri|ct|pet|x-?ray|lab|test|result|finding|chemo|chemotherapy|radiation|surgery|diagnosis|medication|drug|appointment|visit|cycle|stage|grade|marker|biomarker)\b/i,
  /\b(show|find|get|what|when|which|tell me about|is there|are there|does|did|has|have)\b/i,
];

export interface ClassificationResult {
  intent: Intent;
  confidence: 'high' | 'low';
  rationale: string;
}

/**
 * Deterministic classifier first. It is fast, explainable and testable. The
 * LLM is only consulted when the deterministic pass cannot decide (ambiguous).
 * This keeps medical-safety routing out of a probabilistic model as far as
 * possible.
 */
export function classifyIntentDeterministic(message: string): ClassificationResult | null {
  const text = message.trim();
  if (text.length === 0) {
    return { intent: 'ambiguous_question', confidence: 'high', rationale: 'Empty message' };
  }

  // Unsupported medical questions are checked before evidence so that
  // "what treatment should this patient receive" is never treated as evidence.
  if (UNSUPPORTED_MEDICAL_PATTERNS.some((p) => p.test(text))) {
    return {
      intent: 'unsupported_medical_question',
      confidence: 'high',
      rationale: 'Matches general-medical-knowledge pattern',
    };
  }

  if (MISSING_DOC_PATTERNS.some((p) => p.test(text))) {
    return {
      intent: 'missing_documents_question',
      confidence: 'high',
      rationale: 'Matches missing-document pattern',
    };
  }

  // Navigation is checked before continuity so "where is the continuity view?"
  // is guidance, while "show continuity items" is a data question. A
  // navigation verb that names a clinical object ("where can I find the chemo
  // records?") falls through to evidence.
  if (NAVIGATION_PATTERNS.some((p) => p.test(text))) {
    const namesClinicalObject =
      EVIDENCE_PATTERNS.some((p) => p.test(text)) &&
      /\b(reports?|results?|records?|documents?|scans?|pdfs?|sources?|notes?)\b/i.test(text);
    if (!namesClinicalObject) {
      return {
        intent: 'navigation_question',
        confidence: 'high',
        rationale: 'Matches navigation pattern without a clinical object',
      };
    }
  }

  if (CONTINUITY_PATTERNS.some((p) => p.test(text))) {
    return {
      intent: 'continuity_question',
      confidence: 'high',
      rationale: 'Matches continuity pattern',
    };
  }

  if (CONFLICT_PATTERNS.some((p) => p.test(text))) {
    return {
      intent: 'evidence_question',
      confidence: 'high',
      rationale: 'Conflict query handled as evidence query',
    };
  }

  if (EVIDENCE_PATTERNS.some((p) => p.test(text))) {
    return {
      intent: 'evidence_question',
      confidence: 'high',
      rationale: 'Matches evidence pattern',
    };
  }

  return null;
}

export async function classifyIntent(message: string): Promise<ClassificationResult> {
  const deterministic = classifyIntentDeterministic(message);
  if (deterministic) return deterministic;

  // Ambiguous: let the LLM classify, but only into the closed intent set.
  try {
    const response = await chatCompletion({
      messages: [
        {
          role: 'system',
          content:
            'Classify the user message into exactly one of: evidence_question, missing_documents_question, continuity_question, navigation_question, unsupported_medical_question, ambiguous_question. Reply with only the label.',
        },
        { role: 'user', content: message },
      ],
      temperature: 0,
      maxTokens: 20,
    });

    const label = response.content.trim().toLowerCase().replace(/[^a-z_]/g, '') as Intent;
    const valid: Intent[] = [
      'evidence_question',
      'missing_documents_question',
      'continuity_question',
      'navigation_question',
      'unsupported_medical_question',
      'ambiguous_question',
    ];
    if (valid.includes(label)) {
      return { intent: label, confidence: 'low', rationale: 'LLM classification of an ambiguous message' };
    }
  } catch {
    // fall through to ambiguous
  }

  return {
    intent: 'ambiguous_question',
    confidence: 'low',
    rationale: 'Could not classify confidently',
  };
}