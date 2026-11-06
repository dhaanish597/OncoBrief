import { describe, expect, it } from 'vitest';
import { RuleBasedExtractor } from '../src/rule-based-extractor';
import { validateCandidateProvenance, validateSpans, type SpanForValidation } from '@oncobrief/domain';
import type { ExtractionSpanInput } from '@oncobrief/ports';

describe('RuleBasedExtractor — TASK-02.02 Multilingual Document Extraction (Hindi & Tamil)', () => {
  const extractor = new RuleBasedExtractor();

  it('extracts structured clinical facts from a Hindi oncology report', async () => {
    const rawSpans = [
      { text: 'टाटा मेमोरियल अस्पताल / TATA MEMORIAL HOSPITAL' },
      { text: 'रिपोर्ट तिथि: 14/05/2025' },
      { text: 'एमआरएन: RCI-7781' },
      { text: 'हीमोग्लोबिन: 11.2 g/dL' },
      { text: 'प्लेटलेट्स: 185000 /uL' },
      { text: 'श्वेत रक्त कोशिका: 7500 /uL' },
      { text: 'क्रिएटिनिन: 0.9 mg/dL' },
      { text: 'निदान: इनवेसिव डक्टल कार्सिनोमा' },
      { text: 'चरण: Stage IIA' },
      { text: 'अपॉइंटमेंट: 22/05/2025' },
    ];

    const spans: (SpanForValidation & ExtractionSpanInput)[] = rawSpans.map((s, idx) => ({
      id: `span-hi-${idx}`,
      documentId: 'doc-hindi-report',
      pageId: 'page-1',
      pageNumber: 1,
      lineIndex: idx,
      text: s.text,
      ocrConfidence: 0.95,
      bbox: { x: 0.1, y: 0.05 * idx, w: 0.8, h: 0.04 },
    }));

    const candidates = await extractor.extract({
      documentId: 'doc-hindi-report',
      patientId: 'patient-1',
      documentType: 'diagnostic_report',
      documentDate: null,
      issuingFacility: null,
      pageText: rawSpans.map((s) => s.text).join('\n'),
      spans,
    });

    expect(candidates.length).toBeGreaterThanOrEqual(7);

    // 1. Document Date
    const docDate = candidates.find((c) => c.factType === 'document.date');
    expect(docDate).toBeDefined();
    expect(docDate?.value).toEqual({ kind: 'date', date: '2025-05-14' });
    expect(docDate?.verbatimQuote).toContain('14/05/2025');

    // 2. MRN Identifier
    const mrn = candidates.find((c) => c.factType === 'identifier.mrn');
    expect(mrn).toBeDefined();
    expect(mrn?.value).toEqual({ kind: 'identifier', system: 'mrn', value: 'RCI-7781' });

    // 3. Hemoglobin
    const hb = candidates.find(
      (c) => c.factType === 'lab_result.as_written' && (c.value as { name?: string }).name === 'Hemoglobin',
    );
    expect(hb).toBeDefined();
    expect((hb?.value as { valueText?: string }).valueText).toBe('11.2');
    expect((hb?.value as { unitText?: string }).unitText).toBe('g/dL');
    expect(hb?.verbatimQuote).toContain('11.2');

    // 4. Platelets
    const plt = candidates.find(
      (c) => c.factType === 'lab_result.as_written' && (c.value as { name?: string }).name === 'Platelets',
    );
    expect(plt).toBeDefined();
    expect((plt?.value as { valueText?: string }).valueText).toBe('185000');

    // 5. Diagnosis
    const diag = candidates.find((c) => c.factType === 'diagnosis_text.as_written');
    expect(diag).toBeDefined();
    expect((diag?.value as { text?: string }).text).toBe('इनवेसिव डक्टल कार्सिनोमा');

    // 6. Stage
    const stage = candidates.find((c) => c.factType === 'stage_text.as_written');
    expect(stage).toBeDefined();
    expect((stage?.value as { text?: string }).text).toBe('Stage IIA');

    // 7. Appointment
    const appt = candidates.find((c) => c.factType === 'appointment.recorded');
    expect(appt).toBeDefined();
    expect(appt?.value).toEqual({ kind: 'appointment', date: '2025-05-22' });

    // Assert 100% of candidates pass two-stage span validation
    for (const c of candidates) {
      const stageA = validateSpans(c.verbatimQuote, spans.filter((s) => c.spanIds.includes(s.id)));
      expect(stageA.ok, `Stage A failed for fact ${c.factType} quote "${c.verbatimQuote}"`).toBe(true);

      const stageB = validateCandidateProvenance(
        {
          factType: c.factType,
          value: c.value,
          verbatimQuote: c.verbatimQuote,
          spanIds: c.spanIds,
        },
        spans,
      );
      expect(stageB.valid, `Stage B failed for fact ${c.factType} quote "${c.verbatimQuote}"`).toBe(true);
    }
  });

  it('extracts structured clinical facts from a Tamil oncology report', async () => {
    const rawSpans = [
      { text: 'அடையாறு புற்றுநோய் நிறுவனம் / ADYAR CANCER INSTITUTE' },
      { text: 'அறிக்கை தேதி: 14/05/2025' },
      { text: 'MRN: RCI-7781' },
      { text: 'ஹீமோகுளோபின்: 11.2 g/dL' },
      { text: 'தட்டணுக்கள்: 185000 /uL' },
      { text: 'வெள்ளை அணுக்கள்: 7500 /uL' },
      { text: 'கிரியேட்டினைன்: 0.9 mg/dL' },
      { text: 'நோய் கண்டறிதல்: மார்பக புற்றுநோய்' },
      { text: 'நிலை: Stage IIA' },
      { text: 'சந்திப்பு: 22/05/2025' },
    ];

    const spans: (SpanForValidation & ExtractionSpanInput)[] = rawSpans.map((s, idx) => ({
      id: `span-ta-${idx}`,
      documentId: 'doc-tamil-report',
      pageId: 'page-1',
      pageNumber: 1,
      lineIndex: idx,
      text: s.text,
      ocrConfidence: 0.96,
      bbox: { x: 0.1, y: 0.05 * idx, w: 0.8, h: 0.04 },
    }));

    const candidates = await extractor.extract({
      documentId: 'doc-tamil-report',
      patientId: 'patient-1',
      documentType: 'diagnostic_report',
      documentDate: null,
      issuingFacility: null,
      pageText: rawSpans.map((s) => s.text).join('\n'),
      spans,
    });

    expect(candidates.length).toBeGreaterThanOrEqual(7);

    // 1. Document Date
    const docDate = candidates.find((c) => c.factType === 'document.date');
    expect(docDate).toBeDefined();
    expect(docDate?.value).toEqual({ kind: 'date', date: '2025-05-14' });

    // 2. MRN
    const mrn = candidates.find((c) => c.factType === 'identifier.mrn');
    expect(mrn).toBeDefined();
    expect(mrn?.value).toEqual({ kind: 'identifier', system: 'mrn', value: 'RCI-7781' });

    // 3. Hemoglobin
    const hb = candidates.find(
      (c) => c.factType === 'lab_result.as_written' && (c.value as { name?: string }).name === 'Hemoglobin',
    );
    expect(hb).toBeDefined();
    expect((hb?.value as { valueText?: string }).valueText).toBe('11.2');

    // 4. Platelets
    const plt = candidates.find(
      (c) => c.factType === 'lab_result.as_written' && (c.value as { name?: string }).name === 'Platelets',
    );
    expect(plt).toBeDefined();
    expect((plt?.value as { valueText?: string }).valueText).toBe('185000');

    // 5. Diagnosis
    const diag = candidates.find((c) => c.factType === 'diagnosis_text.as_written');
    expect(diag).toBeDefined();
    expect((diag?.value as { text?: string }).text).toBe('மார்பக புற்றுநோய்');

    // 6. Stage
    const stage = candidates.find((c) => c.factType === 'stage_text.as_written');
    expect(stage).toBeDefined();
    expect((stage?.value as { text?: string }).text).toBe('Stage IIA');

    // 7. Appointment
    const appt = candidates.find((c) => c.factType === 'appointment.recorded');
    expect(appt).toBeDefined();
    expect(appt?.value).toEqual({ kind: 'appointment', date: '2025-05-22' });

    // Assert 100% of candidates pass two-stage span validation
    for (const c of candidates) {
      const stageA = validateSpans(c.verbatimQuote, spans.filter((s) => c.spanIds.includes(s.id)));
      expect(stageA.ok, `Stage A failed for fact ${c.factType} quote "${c.verbatimQuote}"`).toBe(true);

      const stageB = validateCandidateProvenance(
        {
          factType: c.factType,
          value: c.value,
          verbatimQuote: c.verbatimQuote,
          spanIds: c.spanIds,
        },
        spans,
      );
      expect(stageB.valid, `Stage B failed for fact ${c.factType} quote "${c.verbatimQuote}"`).toBe(true);
    }
  });
});
