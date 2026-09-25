import { describe, expect, it } from 'vitest';
import { JsonLogger, redact } from '../src/logger';

/**
 * Phase 22 — logs carry identifiers, never PHI or credentials.
 */
describe('log redaction', () => {
  it('strips document text, quotes, names and credentials', () => {
    const out = redact({
      correlation_id: 'c1',
      document_id: 'd1',
      text: 'Patient has ...',
      verbatim_quote: 'a quote',
      patientName: 'Asha',
      accessKeyId: 'AKIA',
      secretAccessKey: 'shh',
      nested: { quote: 'inner', stage: 'ocr' },
    });
    expect(out['correlation_id']).toBe('c1');
    expect(out['text']).toBe('<redacted>');
    expect(out['verbatim_quote']).toBe('<redacted>');
    expect(out['patientName']).toBe('<redacted>');
    expect(out['accessKeyId']).toBe('<redacted>');
    expect(out['secretAccessKey']).toBe('<redacted>');
    expect((out['nested'] as Record<string, unknown>)['quote']).toBe('<redacted>');
    expect((out['nested'] as Record<string, unknown>)['stage']).toBe('ocr');
  });

  it('truncates very long strings rather than logging them', () => {
    const out = redact({ note: 'x'.repeat(500) });
    expect(out['note']).toBe('<500 chars>');
  });

  it('emits one JSON line per event', () => {
    const lines: string[] = [];
    const original = console.info;
    console.info = (line: string) => lines.push(line);
    try {
      new JsonLogger('test-worker').info({ correlation_id: 'c1', stage: 'ocr' }, 'ok');
    } finally {
      console.info = original;
    }
    expect(lines).toHaveLength(1);
    const parsed = JSON.parse(lines[0]!) as Record<string, unknown>;
    expect(parsed['msg']).toBe('ok');
    expect(parsed['worker']).toBe('test-worker');
    expect(parsed['level']).toBe('info');
    expect(parsed['correlation_id']).toBe('c1');
  });
});
