'use server';

import 'server-only';
import { revalidatePath } from 'next/cache';
import { can } from '@oncobrief/domain';
import { listBackfillCandidates, offerOpdSlot, registerWalkIn, updateOpdSlotStatus } from '@oncobrief/db';
import { withSession } from './session';

type ActionResult<T = undefined> = { ok: true; data: T } | { ok: false; error: string };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function id(fd: FormData, name: string): string {
  const value = fd.get(name);
  if (typeof value !== 'string' || !uuid.test(value)) throw new Error('invalid_input');
  return value;
}
function text(fd: FormData, name: string): string {
  const value = fd.get(name);
  return typeof value === 'string' ? value.trim() : '';
}
function errorMessage(error: unknown): string {
  const code = error instanceof Error ? error.message : '';
  if (/forbidden|unauthorized/i.test(code)) return 'You do not have permission to manage this clinic.';
  if (/invalid_input|reason/i.test(code)) return 'Check the submitted details and provide an operational reason.';
  return 'This update could not be confirmed. The slot, readiness or eligibility may have changed. Refresh and review the current record before retrying.';
}
async function mutate(fd: FormData, mode: 'status' | 'offer' | 'walk_in'): Promise<ActionResult> {
  try {
    if (fd.get('confirmed') !== 'yes') throw new Error('invalid_input');
    await withSession(async (q, session) => {
      if (!can(session.role, 'opd:manage')) throw new Error('forbidden');
      const base = { orgId: session.orgId, actorId: session.userId, slotId: id(fd, 'slotId'), requestId: id(fd, 'requestId') };
      if (mode === 'status') {
        const toStatus = text(fd, 'toStatus');
        const expectedStatus = text(fd, 'expectedStatus');
        if (!['scheduled','checked_in','in_consult','delayed_investigation','completed','cancelled','no_show','walk_in','vacant'].includes(toStatus)) throw new Error('invalid_input');
        const reason = text(fd, 'reason');
        if (reason.length < 3 || reason.length > 500) throw new Error('invalid_input');
        await updateOpdSlotStatus(q, { ...base, toStatus, expectedStatus, reason });
      } else {
        const input = { ...base, waitlistEntryId: id(fd, 'waitlistEntryId') };
        if (mode === 'offer') await offerOpdSlot(q, input);
        else await registerWalkIn(q, input);
      }
    });
    revalidatePath('/workspace');
    return { ok: true, data: undefined };
  } catch (error) { return { ok: false, error: errorMessage(error) }; }
}
export async function updateOpdSlotStatusAction(fd: FormData) { return mutate(fd, 'status'); }
export async function backfillOpdSlotAction(fd: FormData) { return mutate(fd, 'offer'); }
export async function registerWalkInAction(fd: FormData) { return mutate(fd, 'walk_in'); }
export async function discoverBackfillCandidatesAction(slotId: string): Promise<ActionResult<Awaited<ReturnType<typeof listBackfillCandidates>>>> {
  try {
    if (!uuid.test(slotId)) throw new Error('invalid_input');
    const candidates = await withSession(async (q, s) => {
      if (!can(s.role, 'opd:manage')) throw new Error('forbidden');
      return listBackfillCandidates(q, { orgId: s.orgId, actorId: s.userId, slotId });
    });
    return { ok: true, data: candidates };
  } catch (error) { return { ok: false, error: errorMessage(error) }; }
}
