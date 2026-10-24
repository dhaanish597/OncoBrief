import { describe, expect, it } from 'vitest';
import { listPatientObservations } from '../src/services/patients';
import type { Querier } from '../src/client';

function queryFor(valueText: string, numericValue?: number): Querier {
  return { query: async () => ({ rows: [{
    id: 'fact', patient_id: 'patient', document_id: 'document', original_filename: 'source.pdf',
    page_number: 2, observed_on: '2026-06-02', document_date: '2026-06-03',
    fact_type: 'lab_result.as_written', value_json: {kind: 'lab', name: 'Marker', valueText, numericValue},
    value_normalized: valueText, verbatim_quote: `Marker: ${valueText}`,
    confidence_band: 'high', extractor_name: 'rule', state: 'extracted',
    reviewer_name: null, reviewed_at: null, created_at: new Date(),
  }] }) } as unknown as Querier;
}

describe('Clinical Context source values', () => {
  it.each(['<5', '>100', '120/80', '1-5', '3+'])('does not plot qualified or compound value %s as an exact number', async (value) => {
    const observations = await listPatientObservations(queryFor(value, 5), 'patient');
    expect(observations[0]?.valueText).toBe(value);
    expect(observations[0]?.numericValue).toBeUndefined();
  });
  it('preserves exact numeric values and provenance', async () => {
    const observations = await listPatientObservations(queryFor('11.4'), 'patient');
    expect(observations[0]).toMatchObject({numericValue: 11.4, pageNumber: 2, id: 'fact', documentId: 'document'});
  });
});
