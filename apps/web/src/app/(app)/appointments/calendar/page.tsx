import Link from 'next/link';
import { can } from '@oncobrief/domain';
import { listAppointments, listClinicians, type AppointmentRow } from '@oncobrief/db';
import { requireSession, withSession } from '@/lib/session';

function formatTime(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export default async function AppointmentsCalendarPage({
  searchParams,
}: {
  searchParams: Promise<{
    date?: string;
    view?: 'day' | 'week';
    clinicianId?: string;
  }>;
}) {
  const session = await requireSession();
  const params = await searchParams;

  const viewMode = params.view === 'week' ? 'week' : 'day';
  const clinicianId = params.clinicianId || undefined;

  // Selected date or today
  const selectedDateStr = params.date || new Date().toISOString().split('T')[0]!;
  const selectedDate = new Date(`${selectedDateStr}T00:00:00Z`);

  let startDate: Date;
  let endDate: Date;

  if (viewMode === 'day') {
    startDate = new Date(selectedDate);
    endDate = new Date(selectedDate);
    endDate.setHours(23, 59, 59, 999);
  } else {
    // Week view: start from Monday
    const day = selectedDate.getUTCDay();
    const diff = selectedDate.getUTCDate() - day + (day === 0 ? -6 : 1);
    startDate = new Date(selectedDate);
    startDate.setUTCDate(diff);
    startDate.setUTCHours(0, 0, 0, 0);

    endDate = new Date(startDate);
    endDate.setUTCDate(startDate.getUTCDate() + 6);
    endDate.setUTCHours(23, 59, 59, 999);
  }

  const data = await withSession(async (q, s) => {
    const appointments = await listAppointments(q, s.orgId, {
      clinicianId,
      dateFrom: startDate.toISOString(),
      dateTo: endDate.toISOString(),
      limit: 250,
    });
    const clinicians = await listClinicians(q);
    return { appointments, clinicians };
  });

  const { appointments, clinicians } = data;
  const canBook = can(session.role, 'appointment:create');

  // Generate days array for week view
  const days: { dateStr: string; label: string; appts: AppointmentRow[] }[] = [];
  if (viewMode === 'day') {
    days.push({
      dateStr: selectedDateStr,
      label: selectedDate.toLocaleDateString('en-IN', { weekday: 'short', month: 'short', day: 'numeric' }),
      appts: appointments,
    });
  } else {
    for (let i = 0; i < 7; i++) {
      const d = new Date(startDate);
      d.setUTCDate(startDate.getUTCDate() + i);
      const dStr = d.toISOString().split('T')[0]!;
      days.push({
        dateStr: dStr,
        label: d.toLocaleDateString('en-IN', { weekday: 'short', month: 'short', day: 'numeric' }),
        appts: appointments.filter((a) => a.scheduled_start.startsWith(dStr)),
      });
    }
  }

  // Previous and next date strings
  const prevDate = new Date(selectedDate);
  prevDate.setUTCDate(selectedDate.getUTCDate() - (viewMode === 'day' ? 1 : 7));
  const prevDateStr = prevDate.toISOString().split('T')[0]!;

  const nextDate = new Date(selectedDate);
  nextDate.setUTCDate(selectedDate.getUTCDate() + (viewMode === 'day' ? 1 : 7));
  const nextDateStr = nextDate.toISOString().split('T')[0]!;

  return (
    <div className="mx-auto max-w-[1600px] px-4 py-8 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-[var(--color-rule-strong)] pb-4">
        <div>
          <div className="flex items-center gap-3">
            <Link
              href="/appointments"
              className="mono text-xs uppercase tracking-wider text-[var(--color-ink-soft)] hover:text-[var(--color-ink)]"
            >
              ← Appointment Directory
            </Link>
          </div>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">Oncology Clinic Calendar</h1>
          <p className="mt-1 text-xs text-[var(--color-ink-soft)]">
            Visual schedule of clinician availability, consultations, and consulting room allocations.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {canBook ? (
            <Link
              href="/appointments/new"
              className="mono border border-[var(--color-ink)] bg-[var(--color-ink)] px-3.5 py-1.5 text-xs uppercase tracking-wider text-white hover:bg-black"
            >
              Book Appointment
            </Link>
          ) : null}
        </div>
      </div>

      {/* Calendar Controls */}
      <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border border-[var(--color-rule-strong)] bg-[var(--color-paper-raised)] p-3">
        <div className="flex items-center gap-2">
          <Link
            href={`/appointments/calendar?date=${prevDateStr}&view=${viewMode}${clinicianId ? `&clinicianId=${clinicianId}` : ''}`}
            className="mono border border-[var(--color-rule-strong)] px-2.5 py-1 text-xs hover:bg-[var(--color-paper)]"
          >
            ← Prev
          </Link>
          <span className="mono font-semibold text-xs px-2">
            {viewMode === 'day'
              ? selectedDate.toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
              : `Week of ${startDate.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' })} – ${endDate.toLocaleDateString('en-IN', { month: 'short', day: 'numeric', year: 'numeric' })}`}
          </span>
          <Link
            href={`/appointments/calendar?date=${nextDateStr}&view=${viewMode}${clinicianId ? `&clinicianId=${clinicianId}` : ''}`}
            className="mono border border-[var(--color-rule-strong)] px-2.5 py-1 text-xs hover:bg-[var(--color-paper)]"
          >
            Next →
          </Link>
          <Link
            href={`/appointments/calendar?date=${new Date().toISOString().split('T')[0]}&view=${viewMode}${clinicianId ? `&clinicianId=${clinicianId}` : ''}`}
            className="mono border border-[var(--color-rule)] px-2.5 py-1 text-xs text-[var(--color-ink-soft)] hover:bg-[var(--color-paper)] ml-1"
          >
            Today
          </Link>
        </div>

        <div className="flex items-center gap-3">
          <form method="GET" action="/appointments/calendar" className="flex items-center gap-2">
            <input type="hidden" name="date" value={selectedDateStr} />
            <input type="hidden" name="view" value={viewMode} />
            <select
              name="clinicianId"
              defaultValue={clinicianId || ''}
              className="mono border border-[var(--color-rule-strong)] bg-white px-2.5 py-1 text-xs"
            >
              <option value="">All Clinicians</option>
              {clinicians.map((c) => (
                <option key={c.userId} value={c.userId}>
                  {c.displayName}
                </option>
              ))}
            </select>
            <button
              type="submit"
              className="mono border border-[var(--color-ink)] px-2.5 py-1 text-xs uppercase"
            >
              Filter
            </button>
          </form>

          <div className="flex border border-[var(--color-rule-strong)]">
            <Link
              href={`/appointments/calendar?date=${selectedDateStr}&view=day${clinicianId ? `&clinicianId=${clinicianId}` : ''}`}
              className={`mono px-3 py-1 text-xs uppercase ${viewMode === 'day' ? 'bg-[var(--color-ink)] text-white' : 'hover:bg-[var(--color-paper)]'}`}
            >
              Day
            </Link>
            <Link
              href={`/appointments/calendar?date=${selectedDateStr}&view=week${clinicianId ? `&clinicianId=${clinicianId}` : ''}`}
              className={`mono px-3 py-1 text-xs uppercase ${viewMode === 'week' ? 'bg-[var(--color-ink)] text-white' : 'hover:bg-[var(--color-paper)]'}`}
            >
              Week
            </Link>
          </div>
        </div>
      </div>

      {/* Calendar Grid */}
      <div className={`mt-6 grid gap-4 ${viewMode === 'week' ? 'grid-cols-1 md:grid-cols-7' : 'grid-cols-1'}`}>
        {days.map((day) => (
          <div
            key={day.dateStr}
            className="border border-[var(--color-rule-strong)] bg-[var(--color-paper-raised)] p-3"
          >
            <div className="border-b border-[var(--color-rule)] pb-2 mb-3 flex items-center justify-between">
              <span className="mono font-semibold text-xs">{day.label}</span>
              <span className="mono text-[10px] text-[var(--color-ink-soft)]">
                {day.appts.length} slots
              </span>
            </div>

            {day.appts.length === 0 ? (
              <p className="mono text-center text-xs text-[var(--color-ink-soft)] py-8">
                No appointments
              </p>
            ) : (
              <div className="space-y-2">
                {day.appts.map((appt) => (
                  <div
                    key={appt.id}
                    className="border border-[var(--color-rule-strong)] bg-white p-2.5 text-xs shadow-sm hover:border-[var(--color-ink)] transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <span className="mono text-[11px] font-semibold">
                        {formatTime(appt.scheduled_start)}–{formatTime(appt.scheduled_end)}
                      </span>
                      {appt.token_number ? (
                        <span className="mono border border-[var(--color-rule)] px-1 py-0.2 text-[9px] font-bold">
                          {appt.token_number}
                        </span>
                      ) : null}
                    </div>

                    <Link
                      href={`/patients/${appt.patient_id}/overview`}
                      className="mt-1.5 block font-medium hover:underline text-[13px]"
                    >
                      {appt.patient_name}
                    </Link>

                    <div className="mt-1 flex items-center justify-between text-[11px] text-[var(--color-ink-soft)]">
                      <span>{appt.clinician_name}</span>
                      <span className="mono">{appt.room_label}</span>
                    </div>

                    <div className="mt-2 flex items-center justify-between border-t border-[var(--color-rule)] pt-1.5">
                      <span className="mono text-[10px] uppercase text-[var(--color-ink-soft)]">
                        {appt.status.replaceAll('_', ' ')}
                      </span>
                      {appt.status === 'checked_in' || appt.status === 'waiting' ? (
                        <Link
                          href={`/patients/${appt.patient_id}/encounters`}
                          className="mono text-[10px] uppercase font-semibold text-purple-700 hover:underline"
                        >
                          Consult →
                        </Link>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
