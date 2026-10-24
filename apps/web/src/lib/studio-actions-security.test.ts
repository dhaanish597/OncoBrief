import { beforeEach, describe, expect, it, vi } from 'vitest';
import { generateStudioDraft } from '@oncobrief/domain';
const mocks = vi.hoisted(() => ({ artifact: vi.fn(), timeline: vi.fn(), approve: vi.fn(), update: vi.fn(), patient: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('next/navigation', () => ({ redirect: vi.fn() }));
vi.mock('@oncobrief/db', () => ({
  getStudioArtifact: mocks.artifact, getTimeline: mocks.timeline, approveStudioArtifact: mocks.approve,
  updateStudioArtifact: mocks.update, getPatient: mocks.patient, listTasks: vi.fn(async () => []),
  listConflicts: vi.fn(async () => []), listRecordMap: vi.fn(async () => ({ gaps: [] })), searchGuidelineSpans: vi.fn(async () => []),
}));
vi.mock('./session', () => ({ withSession: (fn: (q: object, s: object) => unknown) => fn({}, { role: 'clinician', userId: 'u', orgId: 'org' }) }));
import { approveStudioArtifactAction, updateStudioArtifactAction } from './actions';
const fact = { evidenceFactId: 'bound-fact', factType: 'diagnosis.as_written', valueText: 'Source diagnosis as recorded',
  verbatimQuote: 'Source diagnosis as recorded', documentId: 'd', documentName: 'd.pdf', pageNumber: 1, state: 'verified' as const };
const patient = { id: 'p', displayName: 'Name', demoCode: 'MRN' };
const draft = generateStudioDraft({ kind: 'referral_letter', patient: { ...patient, mrn: 'MRN', facilityName: 'Regional Cancer Institute' }, facts: [fact] });
const artifact = { title: draft.title, id: 'a', patientId: 'p', artifactKind: 'referral_letter', markdownBody: draft.markdownBody,
  citedFactIds: ['bound-fact'], citedGuidelineIds: [], isDeidentified: false };
function fd(body = draft.markdownBody) { const f = new FormData(); f.set('artifactId', 'a'); f.set('patientId', 'p'); f.set('markdownBody', body); f.set('title', draft.title); return f; }
beforeEach(() => { vi.clearAllMocks(); mocks.artifact.mockResolvedValue(artifact); mocks.patient.mockResolvedValue(patient); mocks.timeline.mockResolvedValue([fact]); });
describe('Studio server-bound patient and citations', () => {
  it.each([approveStudioArtifactAction, updateStudioArtifactAction])('rejects a submitted different patient before reading that patient', async (action) => {
    const f = fd(); f.set('patientId', 'other');
    await expect(action(f)).rejects.toThrow('artifact_patient_mismatch');
    expect(mocks.timeline).not.toHaveBeenCalled(); expect(mocks.approve).not.toHaveBeenCalled(); expect(mocks.update).not.toHaveBeenCalled();
  });
  it('keeps E1 bound to its persisted fact after a new earlier timeline fact appears', async () => {
    mocks.timeline.mockResolvedValue([{ ...fact, evidenceFactId: 'new-earlier', valueText: 'Different diagnosis' }, fact]);
    await approveStudioArtifactAction(fd());
    expect(mocks.approve).toHaveBeenCalledWith({}, expect.objectContaining({ expectedCitedFactIds: ['bound-fact'], expectedMarkdownBody: draft.markdownBody }));
  });
  it('fails closed when a bound source disappears instead of renumbering E1', async () => {
    mocks.timeline.mockResolvedValue([{ ...fact, evidenceFactId: 'replacement' }]);
    await expect(approveStudioArtifactAction(fd())).rejects.toThrow('studio_source_withdrawn_or_unavailable');
    expect(mocks.approve).not.toHaveBeenCalled();
  });
  it('rejects uncited additions and removed citation sets on save', async () => {
    await expect(updateStudioArtifactAction(fd(draft.markdownBody + '\nStart chemotherapy tomorrow.'))).rejects.toThrow('cannot_approve_ungrounded_claims');
    await expect(updateStudioArtifactAction(fd(draft.markdownBody.split('\n').filter((line) => !line.includes('[E1]')).join('\n')))).rejects.toThrow('studio_citation_bindings_changed');
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it('rejects unsupported medical claims in a title at save and approval', async () => {
    const edited=fd(); edited.set('title','New diagnosis: metastatic cancer');
    await expect(updateStudioArtifactAction(edited)).rejects.toThrow('studio_title_not_grounded');
    mocks.artifact.mockResolvedValue({...artifact,title:'Start chemotherapy tomorrow'});
    await expect(approveStudioArtifactAction(fd())).rejects.toThrow('studio_title_not_grounded');
    expect(mocks.update).not.toHaveBeenCalled(); expect(mocks.approve).not.toHaveBeenCalled();
  });

});
