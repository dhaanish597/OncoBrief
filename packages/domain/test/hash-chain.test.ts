import { describe, expect, it } from 'vitest';
import {
  computeAuditEntryHash,
  computeLedgerEntryHash,
  GENESIS_PREV_HASH,
  verifyChainLinkage,
  canonicalJson,
  sha256Hex,
  type ChainRow,
} from '../src/index';

const base = {
  orgId: 'org-1',
  seq: 1,
  patientId: 'pat-1',
  evidenceFactId: 'fact-1',
  action: 'fact_extracted' as const,
  fromState: null,
  toState: 'extracted' as const,
  actorKind: 'system',
  actorUserId: null,
  reason: null,
  payloadJson: {},
  occurredAt: new Date('2026-09-22T10:00:00.000Z'),
};

describe('canonicalJson', () => {
  it('sorts keys deterministically', () => {
    expect(canonicalJson({ b: 1, a: 2 })).toBe('{"a":2,"b":1}');
  });

  it('produces identical output for structurally equal values', () => {
    expect(canonicalJson({ x: [1, { z: true, a: null }] })).toBe(
      canonicalJson({ x: [1, { a: null, z: true }] }),
    );
  });

  it('omits undefined properties', () => {
    expect(canonicalJson({ a: 1, b: undefined })).toBe('{"a":1}');
  });

  it('coerces dates to RFC 3339', () => {
    expect(canonicalJson({ t: new Date('2026-09-22T10:00:00.000Z') })).toBe(
      '{"t":"2026-09-22T10:00:00.000Z"}',
    );
  });
});

describe('ledger hash chain', () => {
  it('is deterministic for the same input', () => {
    const a = computeLedgerEntryHash(base, GENESIS_PREV_HASH);
    const b = computeLedgerEntryHash(base, GENESIS_PREV_HASH);
    expect(a.equals(b)).toBe(true);
  });

  it('changes when any field changes', () => {
    const a = computeLedgerEntryHash(base, GENESIS_PREV_HASH);
    const b = computeLedgerEntryHash({ ...base, reason: 'tampered' }, GENESIS_PREV_HASH);
    expect(a.equals(b)).toBe(false);
  });

  it('changes when prev hash changes', () => {
    const a = computeLedgerEntryHash(base, GENESIS_PREV_HASH);
    const b = computeLedgerEntryHash(base, Buffer.from('someotherhashvalue'));
    expect(a.equals(b)).toBe(false);
  });

  it('key order in payload does not change the hash', () => {
    const a = computeLedgerEntryHash({ ...base, payloadJson: { x: 1, y: 2 } }, GENESIS_PREV_HASH);
    const b = computeLedgerEntryHash({ ...base, payloadJson: { y: 2, x: 1 } }, GENESIS_PREV_HASH);
    expect(a.equals(b)).toBe(true);
  });
});

describe('verifyChainLinkage', () => {
  function buildChain(n: number): ChainRow[] {
    const rows: ChainRow[] = [];
    let prev: Buffer = GENESIS_PREV_HASH;
    for (let i = 1; i <= n; i += 1) {
      const entryHash = computeLedgerEntryHash(
        { ...base, seq: i, occurredAt: new Date(2026, 0, i) },
        prev,
      );
      rows.push({ seq: i, prevHash: i === 1 ? null : prev, entryHash });
      prev = entryHash;
    }
    return rows;
  }

  it('accepts an intact chain', () => {
    expect(verifyChainLinkage(buildChain(5)).ok).toBe(true);
  });

  it('detects a mutated link', () => {
    const chain = buildChain(5);
    chain[2] = { ...chain[2]!, entryHash: Buffer.from('deadbeef') };
    const v = verifyChainLinkage(chain);
    expect(v.ok).toBe(false);
    expect(v.firstDivergenceSeq).toBe(4);
  });

  it('detects a sequence gap (deletion)', () => {
    const chain = buildChain(5).filter((r) => r.seq !== 3);
    const v = verifyChainLinkage(chain);
    expect(v.ok).toBe(false);
    expect(v.reason).toContain('sequence gap');
  });

  it('detects reordering', () => {
    const chain = buildChain(4);
    const reordered = [chain[0]!, chain[2]!, chain[1]!, chain[3]!];
    expect(verifyChainLinkage(reordered).ok).toBe(false);
  });
});

describe('audit hash chain', () => {
  it('is deterministic and field-sensitive', () => {
    const input = {
      orgId: 'org-1',
      seq: 1,
      actorUserId: 'user-1',
      actorRole: 'clinician',
      onBehalfOf: null,
      action: 'evidence.verified',
      entityKind: 'evidence_fact',
      entityId: 'fact-1',
      outcome: 'success',
      requestId: 'req-1',
      ipAddress: null,
      userAgent: null,
      metadataJson: {},
      occurredAt: new Date('2026-09-22T10:00:00.000Z'),
    };
    const a = computeAuditEntryHash(input, GENESIS_PREV_HASH);
    const b = computeAuditEntryHash(input, GENESIS_PREV_HASH);
    const c = computeAuditEntryHash({ ...input, outcome: 'denied' }, GENESIS_PREV_HASH);
    expect(a.equals(b)).toBe(true);
    expect(a.equals(c)).toBe(false);
  });
});

describe('sha256Hex', () => {
  it('matches the known digest', () => {
    expect(sha256Hex('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });
});
