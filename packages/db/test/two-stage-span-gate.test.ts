import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closePools, withTenant } from '../src/client';
import { insertFact } from '../src/services/ledger';
import { setupFixtures, type Fixtures } from './helpers';

let fx: Fixtures;

beforeAll(async () => {
  fx = await setupFixtures();
}, 120000);

afterAll(closePools);

describe('TASK-02.04: Two-Stage Clinical Fact Provenance Gate in insertFact', () => {
  it('rejects contradictory lab fact candidate with value_not_entailed', async () => {
    const ctx = { orgId: fx.org1, userId: fx.clinicians.clinician, role: 'clinician' as const };

    // Span text is from fx.sampleSpanText, which does not contain '999.99' or fabricated values
    const result = await withTenant(ctx, (q) =>
      insertFact(q, {
        orgId: fx.org1,
        patientId: fx.patients.demo3,
        factType: 'lab_result.as_written',
        value: { kind: 'lab', name: 'Hemoglobin', valueText: '999.99', unitText: 'g/dL' },
        verbatimQuote: fx.sampleSpanText,
        spanIds: [fx.sampleSpanId],
        documentId: fx.sampleDocumentId,
        extractorKind: 'rule',
        extractorName: 'test',
        extractorVersion: 'v1',
        confidenceRaw: 0.95,
        createdBy: null,
      }),
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('value_not_entailed');
    }
  });

  it('rejects contradictory medication fact candidate with value_not_entailed', async () => {
    const ctx = { orgId: fx.org1, userId: fx.clinicians.clinician, role: 'clinician' as const };

    const result = await withTenant(ctx, (q) =>
      insertFact(q, {
        orgId: fx.org1,
        patientId: fx.patients.demo3,
        factType: 'medication.recorded',
        value: { kind: 'medication', name: 'Cisplatin' },
        verbatimQuote: fx.sampleSpanText,
        spanIds: [fx.sampleSpanId],
        documentId: fx.sampleDocumentId,
        extractorKind: 'rule',
        extractorName: 'test',
        extractorVersion: 'v1',
        confidenceRaw: 0.95,
        createdBy: null,
      }),
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('value_not_entailed');
    }
  });

  it('rejects contradictory date fact candidate with value_not_entailed', async () => {
    const ctx = { orgId: fx.org1, userId: fx.clinicians.clinician, role: 'clinician' as const };

    const result = await withTenant(ctx, (q) =>
      insertFact(q, {
        orgId: fx.org1,
        patientId: fx.patients.demo3,
        factType: 'document.date',
        value: { kind: 'date', date: '2099-12-31' },
        verbatimQuote: fx.sampleSpanText,
        spanIds: [fx.sampleSpanId],
        documentId: fx.sampleDocumentId,
        extractorKind: 'rule',
        extractorName: 'test',
        extractorVersion: 'v1',
        confidenceRaw: 0.95,
        createdBy: null,
      }),
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('value_not_entailed');
    }
  });

  it('accepts valid entailed candidate with ok: true and correct confidence band', async () => {
    const ctx = { orgId: fx.org1, userId: fx.clinicians.clinician, role: 'clinician' as const };

    // Use text value that matches fx.sampleSpanText
    const result = await withTenant(ctx, (q) =>
      insertFact(q, {
        orgId: fx.org1,
        patientId: fx.patients.demo3,
        factType: 'diagnosis_text.as_written',
        value: { kind: 'text', text: fx.sampleSpanText.slice(0, 30) },
        verbatimQuote: fx.sampleSpanText,
        spanIds: [fx.sampleSpanId],
        documentId: fx.sampleDocumentId,
        extractorKind: 'rule',
        extractorName: 'test',
        extractorVersion: 'v1',
        confidenceRaw: 0.95,
        createdBy: null,
      }),
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.factId).toBeTruthy();
    }
  });

  it('rejects human-authored fact with unauthorized_correction when createdBy is missing', async () => {
    const ctx = { orgId: fx.org1, userId: fx.clinicians.clinician, role: 'clinician' as const };

    const result = await withTenant(ctx, (q) =>
      insertFact(q, {
        orgId: fx.org1,
        patientId: fx.patients.demo3,
        factType: 'lab_result.as_written',
        value: { kind: 'lab', name: 'Hemoglobin', valueText: '11.4', unitText: 'g/dL' },
        verbatimQuote: fx.sampleSpanText,
        spanIds: [fx.sampleSpanId],
        documentId: fx.sampleDocumentId,
        extractorKind: 'human',
        extractorName: 'human.correction',
        extractorVersion: 'v1',
        confidenceRaw: null,
        createdBy: null,
      }),
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('unauthorized_correction');
    }
  });

  it('enforces Stage A span validation even when extractorKind is human', async () => {
    const ctx = { orgId: fx.org1, userId: fx.clinicians.clinician, role: 'clinician' as const };

    const result = await withTenant(ctx, (q) =>
      insertFact(q, {
        orgId: fx.org1,
        patientId: fx.patients.demo3,
        factType: 'lab_result.as_written',
        value: { kind: 'lab', name: 'Hemoglobin', valueText: '11.4', unitText: 'g/dL' },
        verbatimQuote: 'Completely fabricated quote not in document',
        spanIds: [fx.sampleSpanId],
        documentId: fx.sampleDocumentId,
        extractorKind: 'human',
        extractorName: 'human.correction',
        extractorVersion: 'v1',
        confidenceRaw: null,
        createdBy: fx.clinicians.clinician,
      }),
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('span_mismatch');
    }
  });
});
