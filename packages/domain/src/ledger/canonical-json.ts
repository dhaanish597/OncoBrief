/**
 * Canonical JSON (architecture §4.4).
 *
 * Deterministic serialisation: object keys sorted lexicographically, no
 * insignificant whitespace, dates emitted as RFC 3339 strings, `undefined`
 * object properties omitted, array order preserved. Two structurally equal
 * values always produce byte-identical output, which is what makes the hash
 * chain reproducible across processes and machines.
 */

export type CanonicalValue =
  | null
  | boolean
  | number
  | string
  | CanonicalValue[]
  | { [key: string]: CanonicalValue | undefined };

export function canonicalJson(value: unknown): string {
  return write(value);
}

function write(value: unknown): string {
  if (value === null) return 'null';
  if (value === undefined) return 'null';
  switch (typeof value) {
    case 'boolean':
      return value ? 'true' : 'false';
    case 'number':
      if (!Number.isFinite(value)) throw new Error('canonical_json_non_finite_number');
      return JSON.stringify(value);
    case 'bigint':
      return JSON.stringify(value.toString());
    case 'string':
      return JSON.stringify(value);
    case 'object':
      break;
    default:
      throw new Error(`canonical_json_unsupported_type:${typeof value}`);
  }

  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) throw new Error('canonical_json_invalid_date');
    return JSON.stringify(value.toISOString());
  }
  if (Array.isArray(value)) {
    return `[${value.map((v) => write(v)).join(',')}]`;
  }
  if (value instanceof Uint8Array) {
    return JSON.stringify(Buffer.from(value).toString('base64'));
  }

  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj)
    .filter((k) => obj[k] !== undefined)
    .sort();
  const body = keys.map((k) => `${JSON.stringify(k)}:${write(obj[k])}`).join(',');
  return `{${body}}`;
}

/** RFC 3339 with millisecond precision, UTC. */
export function toRfc3339(input: Date | string): string {
  const d = typeof input === 'string' ? new Date(input) : input;
  return d.toISOString();
}
