import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ status: vi.fn(), offer: vi.fn(), walkIn: vi.fn(), candidates: vi.fn(), revalidate: vi.fn(), role: 'coordinator' }));
vi.mock('server-only', () => ({}));
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidate }));
vi.mock('@oncobrief/db', () => ({ updateOpdSlotStatus: mocks.status, offerOpdSlot: mocks.offer, registerWalkIn: mocks.walkIn, listBackfillCandidates: mocks.candidates }));
vi.mock('./session', () => ({ withSession: (fn: (q: object, s: object) => unknown) => fn({}, { role: mocks.role, userId: '10000000-0000-0000-0000-000000000001', orgId: '20000000-0000-0000-0000-000000000001' }) }));
import { backfillOpdSlotAction, updateOpdSlotStatusAction, registerWalkInAction } from './opd-actions';
function form() {
  const fd = new FormData();
  for (const key of ['slotId','requestId','waitlistEntryId']) fd.set(key,'30000000-0000-0000-0000-000000000001');
  fd.set('confirmed','yes'); fd.set('reason','Staff confirmed arrival'); fd.set('expectedStatus','scheduled'); fd.set('toStatus','checked_in');
  return fd;
}
beforeEach(() => { vi.clearAllMocks(); mocks.role = 'coordinator'; });
describe('OPD server action boundary', () => {
  it('requires explicit confirmation before touching persistence', async () => {
    const fd = form(); fd.delete('confirmed');
    expect((await backfillOpdSlotAction(fd)).ok).toBe(false);
    expect(mocks.offer).not.toHaveBeenCalled();
  });
  it('rejects forged identifiers before persistence', async () => {
    const fd = form(); fd.set('slotId','not-a-slot');
    expect((await registerWalkInAction(fd)).ok).toBe(false);
    expect(mocks.walkIn).not.toHaveBeenCalled();
  });
  it('uses the authenticated actor and tenant rather than submitted fields', async () => {
    const fd = form(); fd.set('actorId','forged'); fd.set('orgId','forged');
    expect((await backfillOpdSlotAction(fd)).ok).toBe(true);
    expect(mocks.offer).toHaveBeenCalledWith({},expect.objectContaining({ actorId:'10000000-0000-0000-0000-000000000001',orgId:'20000000-0000-0000-0000-000000000001' }));
    expect(mocks.revalidate).toHaveBeenCalledWith('/workspace');
  });
  it('rejects an auditor mutation', async () => {
    mocks.role = 'auditor';
    expect((await backfillOpdSlotAction(form())).ok).toBe(false);
    expect(mocks.offer).not.toHaveBeenCalled();
  });
  it('requires a bounded operational reason for state changes', async () => {
    const fd = form(); fd.set('reason','');
    expect((await updateOpdSlotStatusAction(fd)).ok).toBe(false);
    expect(mocks.status).not.toHaveBeenCalled();
  });
  it('returns an actionable error without leaking database details on transaction failure', async () => {
    mocks.offer.mockRejectedValueOnce(new Error('database-secret patient-name'));
    const result = await backfillOpdSlotAction(form());
    expect(result).toEqual({ ok:false,error:expect.stringContaining('Refresh and review') });
    expect(JSON.stringify(result)).not.toContain('database-secret');
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });
});
