/**
 * Structured logging (Phase 22).
 *
 * Every log line is a single JSON object. Correlation id, document id, org id,
 * stage, duration, status and error code are first-class fields so CloudWatch
 * Insights can query them. Raw medical text, quotes, patient names and
 * credentials are NEVER logged — only identifiers.
 */

export interface LogFields {
  correlation_id?: string | null;
  document_id?: string | null;
  patient_id?: string | null;
  org_id?: string | null;
  stage?: string;
  status?: string;
  duration_ms?: number;
  error_code?: string;
  provider_job_id?: string | null;
  [key: string]: unknown;
}

const FORBIDDEN = new Set([
  'text',
  'plainText',
  'pageText',
  'verbatim_quote',
  'verbatimQuote',
  'quote',
  'body',
  'body_rendered',
  'patientName',
  'display_name',
  'accessKeyId',
  'secretAccessKey',
  'sessionToken',
]);

export function redact(fields: LogFields): LogFields {
  const out: LogFields = {};
  for (const [k, v] of Object.entries(fields)) {
    if (FORBIDDEN.has(k)) {
      out[k] = '<redacted>';
      continue;
    }
    if (typeof v === 'string' && v.length > 300) {
      out[k] = `<${v.length} chars>`;
      continue;
    }
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      out[k] = redact(v as LogFields);
      continue;
    }
    out[k] = v;
  }
  return out;
}

export interface Logger {
  info(fields: LogFields, msg: string): void;
  warn(fields: LogFields, msg: string): void;
  error(fields: LogFields, msg: string): void;
}

export class JsonLogger implements Logger {
  constructor(private readonly workerName: string) {}

  private emit(level: 'info' | 'warn' | 'error', fields: LogFields, msg: string): void {
    const line = JSON.stringify({
      level,
      msg,
      worker: this.workerName,
      ts: new Date().toISOString(),
      ...redact(fields),
    });
    if (level === 'error') console.error(line);
    else if (level === 'warn') console.warn(line);
    else console.info(line);
  }

  info(fields: LogFields, msg: string): void {
    this.emit('info', fields, msg);
  }
  warn(fields: LogFields, msg: string): void {
    this.emit('warn', fields, msg);
  }
  error(fields: LogFields, msg: string): void {
    this.emit('error', fields, msg);
  }
}

export class NullLogger implements Logger {
  info(): void {}
  warn(): void {}
  error(): void {}
}
