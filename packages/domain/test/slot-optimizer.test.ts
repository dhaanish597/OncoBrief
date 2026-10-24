import { describe, expect, it } from 'vitest';
import {
  rankWaitlistForVacantSlot,
  canTransitionOpd,
  clinicLocalDate,
  operationalMetrics,
  type WaitlistCandidateInput,
} from '../src/flow/slot-optimizer';
const slot = {
  orgId: 'o',
  clinicDate: '2026-10-23',
  clinicKey: 'room-1',
  status: 'vacant',
};
const base: WaitlistCandidateInput = {
  orgId: 'o',
  waitlistEntryId: 'a',
  patientId: 'p',
  patientName: 'Synthetic',
  readinessBand: 'ready',
  clinicKey: 'room-1',
  priorityTag: 'routine_followup',
  prioritySourceQuote: null,
  priorityProvenance: null,
  requestedDate: '2026-10-23',
  createdAt: '2026-10-01T00:00:00Z',
  hasConflict: false,
  sourceAccessValid: true,
  status: 'waiting',
};
describe('operational slot optimizer', () => {
  it('admits ready same-clinic patients with transparent rationale', () => {
    const r = rankWaitlistForVacantSlot(slot, [base]);
    expect(r).toHaveLength(1);
    expect(r[0]?.rationale).toContain('Record ready');
    expect(r[0]?.eligible).toBe(true);
  });
  for (const patch of [
    { readinessBand: 'gaps' },
    { readinessBand: 'blocked' },
    { orgId: 'other' },
    { clinicKey: 'other' },
    { hasConflict: true },
    { sourceAccessValid: false },
    { status: 'offered' },
    { requestedDate: '2026-10-24' },
  ])
    it(`excludes ${JSON.stringify(patch)}`, () =>
      expect(
        rankWaitlistForVacantSlot(slot, [
          { ...base, ...patch } as WaitlistCandidateInput,
        ]),
      ).toEqual([]));
  it('ignores unsupported priority without provenance', () => {
    const r = rankWaitlistForVacantSlot(slot, [
      {
        ...base,
        waitlistEntryId: 'b',
        priorityTag: 'expedited_slot_requested',
      },
      base,
    ]);
    expect(r.map((x) => x.waitlistEntryId)).toEqual(['a', 'b']);
    expect(r[1]?.priorityTag).toBe('routine_followup');
  });
  it('uses documented administrative priority then date, creation, stable id', () => {
    const urgent = {
      ...base,
      waitlistEntryId: 'z',
      priorityTag: 'expedited_slot_requested',
      priorityProvenance: 'Authorized selection by staff',
    };
    expect(
      rankWaitlistForVacantSlot(slot, [base, urgent])[0]?.waitlistEntryId,
    ).toBe('z');
    expect(
      rankWaitlistForVacantSlot(slot, [
        { ...base, waitlistEntryId: 'b' },
        base,
      ]).map((x) => x.waitlistEntryId),
    ).toEqual(['a', 'b']);
  });
  it('does not rank occupied slots and handles empty list', () => {
    expect(
      rankWaitlistForVacantSlot({ ...slot, status: 'scheduled' }, [base]),
    ).toEqual([]);
    expect(rankWaitlistForVacantSlot(slot, [])).toEqual([]);
  });
  it.each([
    ['scheduled', 'checked_in'],
    ['checked_in', 'in_consult'],
    ['in_consult', 'completed'],
    ['scheduled', 'cancelled'],
    ['cancelled', 'vacant'],
    ['no_show', 'vacant'],
    ['delayed_investigation', 'vacant'],
    ['walk_in', 'in_consult'],
  ])('permits %s to %s', (a, b) => expect(canTransitionOpd(a, b)).toBe(true));
  it.each([
    ['completed', 'scheduled'],
    ['vacant', 'in_consult'],
    ['scheduled', 'completed'],
    ['cancelled', 'checked_in'],
    ['in_consult', 'scheduled'],
  ])('rejects %s to %s', (a, b) => expect(canTransitionOpd(a, b)).toBe(false));
  it('uses configured clinic date across UTC boundary', () => {
    expect(
      clinicLocalDate(new Date('2026-10-22T19:00:00Z'), 'Asia/Kolkata'),
    ).toBe('2026-10-23');
    expect(
      clinicLocalDate(new Date('2026-10-23T00:00:00Z'), 'America/New_York'),
    ).toBe('2026-10-22');
  });
  it('distinguishes empty measurement from zero', () => {
    expect(
      operationalMetrics({
        ready: 0,
        scheduled: 0,
        utilized: 0,
        totalSlots: 0,
        spanPassed: 0,
        spanTotal: 0,
      }),
    ).toEqual({ readyRate: null, utilization: null, spanPassRate: null });
    expect(
      operationalMetrics({
        ready: 1,
        scheduled: 2,
        utilized: 3,
        totalSlots: 4,
        spanPassed: 8,
        spanTotal: 10,
      }),
    ).toEqual({ readyRate: 0.5, utilization: 0.75, spanPassRate: 0.8 });
  });
});
