import { describe, expect, it } from 'vitest';
import { RuleBasedExtractor } from '../src/rule-based-extractor';
import { sectionForFactType, validateSpans } from '@oncobrief/domain';

async function extract(text: string, date: string | null = '2026-06-02') {
  return new RuleBasedExtractor().extract({
    documentId: 'doc',
    patientId: 'synthetic',
    documentType: 'other',
    documentDate: date,
    issuingFacility: null,
    pageText: text,
    spans: text
      .split('\n')
      .map((text, i) => ({ id: `s${i}`, pageId: 'p1', text })),
  });
}

describe('explicit oncology administrative extraction', () => {
  it.each([
    'Awaiting histopathology report',
    'Pending IHC report',
    'Biopsy report pending',
    'Scheduled for PET-CT',
    'Advised MRI',
    'To undergo CT scan',
  ])('retains exact supporting pending text: %s', async (text) => {
    const facts = (await extract(text)).filter(
      (f) => f.factType === 'pending_investigation.recorded',
    );
    expect(facts).toHaveLength(1);
    expect(facts[0]).toMatchObject({
      value: { kind: 'text', text },
      verbatimQuote: text,
      spanIds: ['s0'],
    });
    expect(
      validateSpans(facts[0]!.verbatimQuote, [
        { id: 's0', documentId: 'doc', text },
      ]).ok,
    ).toBe(true);
    expect(sectionForFactType(facts[0]!.factType)).toBe(
      'appointments_and_referrals',
    );
  });
  it.each([
    'Bring previous imaging CD',
    'Carry previous pathology slides',
    'Return with requested documents',
    'Please bring prior imaging and histopathology slides at next visit',
  ])('captures instructions verbatim: %s', async (text) => {
    const facts = (await extract(text)).filter(
      (f) => f.factType === 'instruction.recorded',
    );
    expect(facts).toHaveLength(1);
    expect(facts[0]?.value).toEqual({ kind: 'text', text });
    expect(facts[0]?.verbatimQuote).toBe(text);
  });
  it('extracts multiple instructions from one block without swallowing adjacent sentences', async () => {
    const facts = (
      await extract('Bring imaging CD. Carry pathology slides.')
    ).filter((f) => f.factType === 'instruction.recorded');
    expect(facts.map((f) => f.verbatimQuote)).toEqual([
      'Bring imaging CD',
      'Carry pathology slides',
    ]);
  });
  it.each([
    'No pending IHC report',
    'IHC report not pending',
    'Do not bring imaging CD',
    'MRI report available',
    'Consider requesting tests',
    'No investigations documented',
  ])('does not invent pending work from %s', async (text) => {
    const facts = await extract(text);
    expect(
      facts.filter(
        (f) =>
          f.factType === 'instruction.recorded' ||
          f.factType === 'pending_investigation.recorded',
      ),
    ).toEqual([]);
  });
  it('does not classify a requested investigation as a completed procedure', async () => {
    const facts = await extract('Pending PET-CT');
    expect(
      facts.some((f) => f.factType === 'pending_investigation.recorded'),
    ).toBe(true);
    expect(facts.some((f) => f.factType === 'procedure.recorded')).toBe(false);
  });
  it('uses source observation dates and includes stated dose in its quote', async () => {
    const facts = await extract('Paclitaxel 80 mg on 26 July 2026');
    expect(
      facts.find((f) => f.factType === 'medication.recorded'),
    ).toMatchObject({
      value: { kind: 'medication', name: 'Paclitaxel', doseText: '80 mg' },
      observedOn: '2026-07-26',
      verbatimQuote: 'Paclitaxel 80 mg',
    });
  });
  it('never borrows a dose belonging to a neighboring drug', async () => {
    const facts = await extract('Paclitaxel; Carboplatin 450 mg');
    expect(
      facts.find(
        (f) => f.value.kind === 'medication' && f.value.name === 'Paclitaxel',
      )?.value,
    ).toEqual({ kind: 'medication', name: 'Paclitaxel' });
  });
  it('keeps repeated same-value observations from different dates', async () => {
    const facts = await extract(
      'Paclitaxel 80 mg on 02 June 2026\nPaclitaxel 80 mg on 26 July 2026',
    );
    expect(
      facts
        .filter((f) => f.factType === 'medication.recorded')
        .map((f) => f.observedOn),
    ).toEqual(['2026-06-02', '2026-07-26']);
  });
  it('records explicitly labelled vital signs without clinical labels', async () => {
    const facts = await extract('Weight: 65 kg');
    expect(
      facts.find((f) => f.factType === 'vital_sign.as_written'),
    ).toMatchObject({
      value: { kind: 'lab', name: 'Weight', valueText: '65', unitText: 'kg' },
      verbatimQuote: 'Weight: 65 kg',
    });
    expect(facts.some((f) => f.factType === 'lab_result.as_written')).toBe(
      false,
    );
  });
  it('uses explicitly labelled report dates on each page for serial lab observations', async () => {
    const facts = await new RuleBasedExtractor().extract({
      documentId: 'doc',
      patientId: 'synthetic',
      documentType: 'lab_report',
      documentDate: null,
      issuingFacility: null,
      pageText: '',
      spans: [
        { id: 'd1', pageId: 'p1', text: 'Date: 02 June 2026' },
        { id: 'l1', pageId: 'p1', text: 'Hemoglobin: 11.4 g/dL' },
        { id: 'd2', pageId: 'p2', text: 'Date: 26 July 2026' },
        { id: 'l2', pageId: 'p2', text: 'Hemoglobin: 11.4 g/dL' },
      ],
    });
    expect(
      facts
        .filter((f) => f.factType === 'lab_result.as_written')
        .map((f) => [f.observedOn, f.spanIds]),
    ).toEqual([
      ['2026-06-02', ['l1']],
      ['2026-07-26', ['l2']],
    ]);
  });
  it('does not turn a future scheduled cycle mention into a completed procedure', async () => {
    const facts = await extract(
      'Next chemotherapy cycle scheduled on 18 August 2026',
    );
    expect(facts.filter((f) => f.factType === 'procedure.recorded')).toEqual(
      [],
    );
  });
  it('deduplicates identical same-date mentions without discarding distinct dates', async () => {
    const facts = await extract(
      'Paclitaxel 80 mg on 02 June 2026\nPaclitaxel 80 mg on 02 June 2026\nPaclitaxel 80 mg on 26 July 2026',
    );
    expect(
      facts
        .filter((f) => f.factType === 'medication.recorded')
        .map((f) => f.observedOn),
    ).toEqual(['2026-06-02', '2026-07-26']);
  });
  it('preserves the full blood-pressure value and unit without creating scalar arithmetic', async () => {
    const facts = await extract('Blood pressure: 120/80 mmHg');
    expect(
      facts.find((f) => f.factType === 'vital_sign.as_written'),
    ).toMatchObject({
      value: {
        kind: 'lab',
        name: 'Blood pressure',
        valueText: '120/80',
        unitText: 'mmHg',
      },
      verbatimQuote: 'Blood pressure: 120/80 mmHg',
    });
  });
});
