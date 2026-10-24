import { expect, it } from 'vitest';
import { RuleBasedExtractor } from '../src/rule-based-extractor';

it('never presents FHIR entry counts and resource identifiers as lab results', async () => {
  const lines = ['Total Entries: 2', 'Resource ID: 12345678', 'Observation: Hemoglobin: 12.8 g/dL (Date: 2026-10-22)'];
  const result = await new RuleBasedExtractor().extract({ documentId: 'doc', patientId: 'synthetic',
    documentType: null, documentDate: null, issuingFacility: null, pageText: lines.join('\n'),
    spans: lines.map((text, i) => ({ id: `span-${i}`, pageId: 'page', text })) });
  const labs = result.filter(f => f.factType === 'lab_result.as_written');
  expect(labs.map(f => f.verbatimQuote)).toEqual(['Hemoglobin: 12.8 g/dL']);
});
