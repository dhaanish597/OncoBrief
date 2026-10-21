import { describe, expect, it } from 'vitest';
import {
  detectCrossDocumentContradictions,
  type GroundedEvidenceFact,
} from './detector';

describe('Layer 2: Cross-Document Contradiction Detector (DOM-08)', () => {
  it('DOM-08: Cross-Document Contradiction: Doc A states surgery date 2026-02-10, Doc B states primary surgery date 2026-03-15 -> both facts preserved, both transitioned to conflicting with shared conflictGroupId', () => {
    const factDocA: GroundedEvidenceFact = {
      id: 'fact-doc-a-1',
      patientId: 'patient-1',
      documentId: 'doc-a',
      factType: 'procedure.recorded',
      value: { kind: 'procedure', name: 'Primary surgery' },
      observedOn: '2026-02-10',
      state: 'extracted',
      verbatimQuote: 'Primary surgery conducted on 10 Feb 2026',
      spanIds: ['span-doc-a-1'],
    };

    const factDocB: GroundedEvidenceFact = {
      id: 'fact-doc-b-1',
      patientId: 'patient-1',
      documentId: 'doc-b',
      factType: 'procedure.recorded',
      value: { kind: 'procedure', name: 'Primary surgery' },
      observedOn: '2026-03-15',
      state: 'extracted',
      verbatimQuote: 'Primary surgery performed on 15 March 2026',
      spanIds: ['span-doc-b-1'],
    };

    const result = detectCrossDocumentContradictions([factDocA, factDocB]);

    // 1. Both facts preserved (neither is dropped or silently overwritten)
    expect(result.facts).toHaveLength(2);

    const updatedA = result.facts.find((f) => f.id === 'fact-doc-a-1')!;
    const updatedB = result.facts.find((f) => f.id === 'fact-doc-b-1')!;

    expect(updatedA).toBeDefined();
    expect(updatedB).toBeDefined();

    // 2. Both transitioned to 'conflicting'
    expect(updatedA.state).toBe('conflicting');
    expect(updatedB.state).toBe('conflicting');

    // 3. Both share the exact same conflictGroupId
    expect(updatedA.conflictGroupId).toBeDefined();
    expect(updatedB.conflictGroupId).toBeDefined();
    expect(updatedA.conflictGroupId).toBe(updatedB.conflictGroupId);

    // 4. Source links preserved
    expect(updatedA.spanIds).toEqual(['span-doc-a-1']);
    expect(updatedB.spanIds).toEqual(['span-doc-b-1']);
    expect(updatedA.documentId).toBe('doc-a');
    expect(updatedB.documentId).toBe('doc-b');
  });

  it('produces no conflicts when facts agree', () => {
    const fact1: GroundedEvidenceFact = {
      id: 'f1',
      patientId: 'patient-1',
      documentId: 'doc-1',
      factType: 'procedure.recorded',
      value: { kind: 'procedure', name: 'Mastectomy' },
      observedOn: '2026-02-10',
      state: 'extracted',
    };
    const fact2: GroundedEvidenceFact = {
      id: 'f2',
      patientId: 'patient-1',
      documentId: 'doc-2',
      factType: 'procedure.recorded',
      value: { kind: 'procedure', name: 'Mastectomy' },
      observedOn: '2026-02-10',
      state: 'extracted',
    };

    const result = detectCrossDocumentContradictions([fact1, fact2]);
    expect(result.conflictGroups).toHaveLength(0);
    expect(result.facts[0]?.state).toBe('extracted');
    expect(result.facts[1]?.state).toBe('extracted');
  });
});
