import { describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { assertStudioArtifactSourcesAccessible, approveStudioArtifact, verifyStudioArtifactSnapshot, type StudioArtifactRecord } from '../src/services/studio';
import type { Querier } from '../src/client';

vi.mock('../src/services/audit', () => ({ appendAuditEvent: vi.fn() }));

describe('Studio source access contract and approval races', () => {
  it('returns a denied result when RLS hides a cited fact, without throwing past audit handling', async () => {
    const q = { query: vi.fn().mockResolvedValue({ rows: [{ n: 0 }] }) } as unknown as Querier;
    await expect(assertStudioArtifactSourcesAccessible(q, 'org', ['fact'])).resolves.toEqual({
      accessible: false, expectedCount: 1, availableCount: 0,
    });
  });

  it('rejects approval if the body changed after server validation', async () => {
    const query = vi.fn().mockResolvedValueOnce({ rows: [{ status: 'draft', markdown_body: 'changed', cited_fact_ids: [], cited_guideline_ids: [] }] });
    const q = { query } as unknown as Querier;
    await expect(approveStudioArtifact(q, { orgId: 'org', artifactId: 'a', role: 'clinician', approvedBy: 'u', expectedMarkdownBody: 'validated' })).rejects.toThrow('studio_draft_changed');
    expect(query.mock.calls[0]![0]).toContain('FOR UPDATE');
    expect(query).toHaveBeenCalledTimes(1);
  });
});


describe('Studio canonical export integrity', () => {
  const payload = { markdownBody: 'Verified body [E1]', citedFactIds: ['f'], citedGuidelineIds: ['g'], approvedBy: 'u', approvedAt: '2026-10-24T01:00:00.000Z' };
  const artifact = { ...payload, status: 'approved', snapshotSha256: createHash('sha256').update(JSON.stringify(payload), 'utf8').digest('hex') } as StudioArtifactRecord;
  it('verifies exactly the canonical approval payload', () => {
    expect(verifyStudioArtifactSnapshot(artifact)).toBe(true);
  });
  it.each([
    { markdownBody: 'Tampered body' }, { citedFactIds: ['different'] }, { citedGuidelineIds: [] },
    { approvedBy: 'different' }, { approvedAt: '2026-10-24T02:00:00.000Z' }, { status: 'draft' },
  ])('rejects changed canonical fields or status: %o', (change) => {
    expect(verifyStudioArtifactSnapshot({ ...artifact, ...change } as StudioArtifactRecord)).toBe(false);
  });
});
