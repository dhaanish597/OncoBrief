import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ artifact: vi.fn(), access: vi.fn(), audit: vi.fn(), timeline: vi.fn(), abdm: vi.fn(), mcode: vi.fn(), integrity: vi.fn(), contentSafe: vi.fn() }));
vi.mock('@oncobrief/db', () => ({
  getStudioArtifact: mocks.artifact, assertStudioArtifactSourcesAccessible: mocks.access,
  verifyStudioArtifactSnapshot: mocks.integrity, appendAuditEvent: mocks.audit,
  getPatient: vi.fn(async () => ({ displayName: 'Private Name' })), getTimeline: mocks.timeline,
  withTenant: (_: unknown, fn: (q: object) => unknown) => fn({}),
}));
vi.mock('@oncobrief/domain', () => ({ can: () => true, exportToAbdmDocumentBundle: mocks.abdm, exportToMCodeBundle: mocks.mcode }));
vi.mock('./session', () => ({ getSession: async () => ({ orgId: 'o', userId: 'u', role: 'clinician' }), tenantCtx: () => ({}) }));
vi.mock('./studio-validation', () => ({ assertStudioArtifactContentSafe: mocks.contentSafe }));
import { GET } from '../app/api/v1/studio/[artifactId]/export/route';
const artifact = { id: 'a', patientId: 'private-id', artifactKind: 'referral_letter', title: 'Title',
  citedFactIds: [], citedGuidelineIds: [], status: 'approved', isDeidentified: false, markdownBody: 'Approved body', snapshotSha256: 'hash' };
const request = (format: string) => GET(new Request(`http://localhost/api/v1/studio/a/export?format=${format}`), { params: Promise.resolve({ artifactId: 'a' }) });
beforeEach(() => { vi.clearAllMocks(); mocks.artifact.mockResolvedValue(artifact); mocks.access.mockResolvedValue({ accessible: true, expectedCount: 0, availableCount: 0 }); mocks.integrity.mockReturnValue(true); mocks.contentSafe.mockResolvedValue(undefined); mocks.abdm.mockReturnValue({ resourceType: 'Bundle' }); mocks.mcode.mockReturnValue({ resourceType: 'Bundle' }); mocks.timeline.mockResolvedValue([{ evidenceFactId: 'not-cited', state: 'verified', valueText: 'Private source' }]); });
describe('Studio audited export source boundaries', () => {
  it.each(['markdown', 'json', 'abdm', 'mcode'])('denies withdrawn sources for %s and audits the denial', async (format) => {
    mocks.access.mockResolvedValue({ accessible: false, expectedCount: 1, availableCount: 0 });
    const response = await request(format);
    expect(response.status).toBe(409); expect(await response.text()).not.toContain('Approved body');
    expect(mocks.audit).toHaveBeenCalledWith({}, expect.objectContaining({ outcome: 'denied' }));
  });
  it.each(['abdm', 'mcode'])('exports zero facts for a zero-citation %s artifact', async (format) => {
    expect((await request(format)).status).toBe(200);
    expect(format === 'abdm' ? mocks.abdm : mocks.mcode).toHaveBeenCalledWith([], expect.any(Object));
  });
  it.each(['abdm', 'mcode'])('blocks deidentified %s before raw facts or identifiers are serialized', async (format) => {
    mocks.artifact.mockResolvedValue({ ...artifact, isDeidentified: true });
    const response = await request(format);
    expect(response.status).toBe(409); expect(await response.text()).toContain('deidentified_fhir_not_supported');
    expect(mocks.timeline).not.toHaveBeenCalled(); expect(mocks.audit).toHaveBeenCalledWith({}, expect.objectContaining({ outcome: 'denied' }));
  });
  it('omits linkable patient and source IDs in deidentified JSON', async () => {
    mocks.artifact.mockResolvedValue({ ...artifact, isDeidentified: true, citedFactIds: ['private-fact-id'] });
    const response = await request('json'); const body = await response.json();
    expect(body).not.toHaveProperty('patientId'); expect(body).not.toHaveProperty('citedFactIds'); expect(JSON.stringify(body)).not.toContain('private-id');
  });
  it('uses a generic filename for deidentified Markdown even if a draft title contained a name', async () => {
    mocks.artifact.mockResolvedValue({ ...artifact, isDeidentified: true, title: 'Private Name' });
    const response = await request('markdown');
    expect(response.headers.get('content-disposition')).toContain('deidentified-case-report');
    expect(response.headers.get('content-disposition')).not.toContain('Private');
  });
  it('blocks legacy unsupported prose even when its canonical snapshot hash is valid', async () => {
    mocks.contentSafe.mockRejectedValue(new Error('unsupported_clause'));
    const response = await request('markdown');
    expect(response.status).toBe(409); expect(await response.text()).toContain('unsupported_approved_content');
    expect(mocks.audit).toHaveBeenCalledWith({}, expect.objectContaining({ outcome: 'denied' }));
  });
  it('blocks a changed body that does not match its frozen canonical hash', async () => {
    mocks.integrity.mockReturnValue(false);
    const response = await request('markdown');
    expect(response.status).toBe(409); expect(await response.text()).toContain('snapshot_integrity_failed');
    expect(mocks.audit).toHaveBeenCalledWith({}, expect.objectContaining({ outcome: 'denied' }));
  });
});
