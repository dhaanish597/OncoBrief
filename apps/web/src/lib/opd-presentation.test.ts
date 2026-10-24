import { describe, expect, it } from 'vitest';
import { metricRatio, filterOpdSlots, opdStatusLabel, isClinicDate } from './opd-presentation';

describe('OPD presentation uses explicit operational state and stored denominators', () => {
  it('rejects impossible clinic dates without silently rolling into another day', () => {
    expect(isClinicDate('2026-02-30')).toBe(false);
    expect(isClinicDate('2028-02-29')).toBe(true);
    expect(isClinicDate('2026-13-01')).toBe(false);
  });
  it('reports missing denominators as unavailable, never zero', () => {
    expect(metricRatio(0, 0)).toBe('Unavailable');
    expect(metricRatio(0, 4)).toBe('0% (0/4)');
    expect(metricRatio(3, 4)).toBe('75% (3/4)');
  });
  it('filters only the selected persisted appointment status', () => {
    const slots = [{ status: 'scheduled' }, { status: 'checked_in' }, { status: 'vacant' }];
    expect(filterOpdSlots(slots, 'all')).toEqual(slots);
    expect(filterOpdSlots(slots, 'checked_in')).toEqual([slots[1]]);
    expect(filterOpdSlots(slots, 'completed')).toEqual([]);
  });
  it('labels delayed state as staff-confirmed operational delay', () => {
    expect(opdStatusLabel('delayed_investigation')).toBe('Delayed · staff confirmed');
    expect(opdStatusLabel('checked_in')).toBe('Checked in');
  });
});
