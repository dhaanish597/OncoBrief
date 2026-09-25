import { describe, expect, it } from 'vitest';
import { coerceFactValue, parseFacts, toIsoDate } from '../src/bedrock-llm';

const allowed = ['s1', 's2'];

describe('parseFacts', () => {
  it('keeps a well-formed, span-anchored, in-vocabulary fact', () => {
    const { facts, discarded } = parseFacts(
      {
        facts: [
          {
            fact_type: 'document.date',
            value: { kind: 'date', date: '2026-01-05' },
            verbatim_quote: 'Date: 2026-01-05',
            span_ids: ['s1'],
            page_number: 1,
            confidence: 0.92,
          },
        ],
      },
      allowed,
    );
    expect(discarded).toBe(0);
    expect(facts).toHaveLength(1);
    expect(facts[0]!.factType).toBe('document.date');
    expect(facts[0]!.confidence).toBe(0.92);
  });

  it('discards a fact whose type is outside the closed vocabulary', () => {
    const { facts, discarded } = parseFacts(
      {
        facts: [
          {
            fact_type: 'risk.score',
            value: { kind: 'text', text: 'high' },
            verbatim_quote: 'high risk',
            span_ids: ['s1'],
            confidence: 1,
          },
        ],
      },
      allowed,
    );
    expect(facts).toHaveLength(0);
    expect(discarded).toBe(1);
  });

  it('discards a fact citing a span that was not supplied', () => {
    const { facts, discarded } = parseFacts(
      {
        facts: [
          {
            fact_type: 'document.date',
            value: { kind: 'date', date: '2026-01-05' },
            verbatim_quote: 'Date: 2026-01-05',
            span_ids: ['s1', 'invented'],
            confidence: 1,
          },
        ],
      },
      allowed,
    );
    expect(facts).toHaveLength(0);
    expect(discarded).toBe(1);
  });

  it('discards an empty quote and clamps out-of-range confidence', () => {
    const { facts, discarded } = parseFacts(
      {
        facts: [
          { fact_type: 'document.date', value: '2026-01-05', verbatim_quote: '   ', span_ids: ['s1'], confidence: 1 },
          { fact_type: 'document.date', value: '2026-02-02', verbatim_quote: 'x', span_ids: ['s1'], confidence: 5 },
        ],
      },
      allowed,
    );
    expect(discarded).toBe(1);
    expect(facts).toHaveLength(1);
    expect(facts[0]!.confidence).toBe(1);
  });

  it('converts an empty date field to null so it cannot reach a date column', () => {
    const { facts } = parseFacts(
      {
        facts: [
          {
            fact_type: 'document.date',
            value: '2026-01-05',
            verbatim_quote: 'Date: 2026-01-05',
            span_ids: ['s1'],
            confidence: 0.9,
            date: '',
          },
        ],
      },
      allowed,
    );
    expect(facts[0]!.date).toBeNull();
  });

  it('coerces a written date string into ISO for a date fact type', () => {
    const { facts } = parseFacts(
      {
        facts: [
          {
            fact_type: 'procedure.recorded',
            value: '12 January 2026',
            verbatim_quote: 'Procedure Date: 12 January 2026',
            span_ids: ['s1'],
            confidence: 0.9,
            date: '12 January 2026',
          },
        ],
      },
      allowed,
    );
    // procedure.recorded expects a procedure value, so a bare date string is
    // coerced to a procedure name (not dropped): the value passes through.
    expect(facts[0]!.date).toBe('2026-01-12');
  });
});

describe('toIsoDate', () => {
  it('normalises written dates without inventing one', () => {
    expect(toIsoDate('12 January 2026')).toBe('2026-01-12');
    expect(toIsoDate('January 5, 2026')).toBe('2026-01-05');
    expect(toIsoDate('2026/01/12')).toBe('2026-01-12');
    expect(toIsoDate('2026-01-12')).toBe('2026-01-12');
    expect(toIsoDate('')).toBeNull();
    expect(toIsoDate('sometime next week')).toBeNull();
  });
});

describe('coerceFactValue', () => {
  it('accepts a valid object value of the matching kind', () => {
    expect(coerceFactValue('document.date', { kind: 'date', date: '2026-01-05' })).toEqual({
      kind: 'date',
      date: '2026-01-05',
    });
  });

  it('rejects an object value of the wrong kind', () => {
    expect(coerceFactValue('document.date', { kind: 'text', text: 'not a date' })).toBeNull();
  });

  it('coerces a plain string into the expected shape only when valid', () => {
    expect(coerceFactValue('document.issuing_facility', 'Tata Memorial Hospital')).toEqual({
      kind: 'facility',
      name: 'Tata Memorial Hospital',
    });
    expect(coerceFactValue('document.date', 'not-a-date')).toBeNull();
    expect(coerceFactValue('chemotherapy_cycle.recorded', 'Cycle 3')).toEqual({
      kind: 'cycle',
      label: 'Cycle 3',
    });
  });
});
