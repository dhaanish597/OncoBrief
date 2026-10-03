import { describe, expect, it } from 'vitest';
import { classifyIntentDeterministic } from './classify';

describe('classifyIntentDeterministic', () => {
  it('classifies an evidence question about a document', () => {
    const result = classifyIntentDeterministic('What is the latest pathology report?');
    expect(result?.intent).toBe('evidence_question');
  });

  it('classifies a missing-document question', () => {
    expect(classifyIntentDeterministic('What documents are missing?')?.intent).toBe(
      'missing_documents_question',
    );
    expect(classifyIntentDeterministic('Which records are still required?')?.intent).toBe(
      'missing_documents_question',
    );
  });

  it('classifies a continuity question', () => {
    expect(classifyIntentDeterministic('Show continuity items')?.intent).toBe('continuity_question');
    expect(classifyIntentDeterministic('Is there an approved patient message?')?.intent).toBe(
      'continuity_question',
    );
  });

  it('classifies a pure navigation request', () => {
    expect(classifyIntentDeterministic('Take me to Evidence Journey')?.intent).toBe(
      'navigation_question',
    );
    expect(classifyIntentDeterministic('Where can I find the continuity view?')?.intent).toBe(
      'navigation_question',
    );
  });

  it('treats a navigation verb with a clinical object as an evidence question', () => {
    // "show me the pathology report" should retrieve evidence, not just route.
    expect(classifyIntentDeterministic('Show me the pathology report')?.intent).toBe(
      'evidence_question',
    );
  });

  it('classifies unsupported general-medical questions', () => {
    for (const q of [
      'What is breast cancer?',
      'What treatment should this patient receive?',
      'What does this diagnosis usually mean?',
      'What drug is recommended?',
      'What is the prognosis?',
    ]) {
      expect(classifyIntentDeterministic(q)?.intent, q).toBe('unsupported_medical_question');
    }
  });

  // The boundary question is "retrieve versus decide". A judge will type these
  // verbatim; each must be refused by the non-clinical path rather than routed
  // to evidence retrieval or the model's general knowledge.
  it('refuses judgment-seeking clinical questions', () => {
    for (const q of [
      "What stage is this patient's cancer?",
      'Should this patient start chemotherapy?',
      'Is this nodule concerning?',
      'Does this patient have cancer?',
      'Should the doctor change the treatment?',
      'Is this urgent?',
      'What is the risk score?',
      'How urgent is this case?',
    ]) {
      expect(classifyIntentDeterministic(q)?.intent, q).toBe('unsupported_medical_question');
    }
  });

  it('still retrieves documented values when the user asks what the record says', () => {
    // Asking for the *documented* value is a ledger lookup, not a clinical
    // conclusion, and must keep working — provenance is the product.
    for (const q of [
      'Show me the documented stage in the pathology report',
      'Show me the pathology report',
      'What is the latest pathology report?',
    ]) {
      expect(classifyIntentDeterministic(q)?.intent, q).toBe('evidence_question');
    }
  });

  it('treats an empty message as ambiguous', () => {
    expect(classifyIntentDeterministic('   ')?.intent).toBe('ambiguous_question');
  });

  it('returns null (defer to LLM) for an unrecognised message', () => {
    expect(classifyIntentDeterministic('Hmm, tell me something')).toBeNull();
  });
});
