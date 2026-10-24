export function metricRatio(numerator: number, denominator: number): string {
  return denominator === 0 ? 'Unavailable' : `${Math.round(100 * numerator / denominator)}% (${numerator}/${denominator})`;
}
export function filterOpdSlots<T extends { status: string }>(slots: T[], status: string): T[] {
  return status === 'all' ? slots : slots.filter((slot) => slot.status === status);
}
export function opdStatusLabel(status: string): string {
  const labels: Record<string, string> = { scheduled: 'Scheduled', checked_in: 'Checked in', in_consult: 'In consultation', delayed_investigation: 'Delayed · staff confirmed', completed: 'Completed', cancelled: 'Cancelled', no_show: 'No show', walk_in: 'Walk-in', vacant: 'Vacant' };
  return labels[status] ?? status;
}

export function isClinicDate(value: string | undefined): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}
