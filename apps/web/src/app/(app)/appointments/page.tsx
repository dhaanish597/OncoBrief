import Link from 'next/link';
import { can } from '@oncobrief/domain';
import {
  listAppointments,
  listClinicians,
  type AppointmentStatus,
} from '@oncobrief/db';
import { requireSession, withSession } from '@/lib/session';
import { changeAppointmentStatusAction } from '@/lib/appointment-actions';

function statusBadgeClass(status: AppointmentStatus): string {
  switch (status) {
    case 'scheduled':
      return 'border-blue-300 bg-blue-50 text-blue-800';
    case 'confirmed':
      return 'border-teal-300 bg-teal-50 text-teal-800';
    case 'checked_in':
    case 'waiting':
      return 'border-amber-300 bg-amber-50 text-amber-800';
    case 'in_consultation':
      return 'border-purple-300 bg-purple-50 text-purple-800';
    case 'completed':
      return 'border-emerald-300 bg-emerald-50 text-emerald-800';
    case 'delayed':
      return 'border-orange-300 bg-orange-50 text-orange-800';
    case 'cancelled':
    case 'no_show':
      return 'border-red-300 bg-red-50 text-red-800';
    default:
      return 'border-gray-300 bg-gray-50 text-gray-800';
  }
}

export default async function AppointmentsPage({
  searchParams,
}: {
  searchParams: Promise<{
    status?: string;
    clinicianId?: string;
    search?: string;
    date?: string;
  }>;
}) {
  const session = await requireSession();
  const params = await searchParams;

  const status = (params.status || 'all') as AppointmentStatus | 'all';
  const clinicianId = params.clinicianId || undefined;
  const search = params.search || undefined;
  const dateFrom = params.date ? `${params.date}T00:00:00Z` : undefined;
  const dateTo = params.date ? `${params.date}T23:59:59Z` : undefined;

  const data = await withSession(async (q, s) => {
    const appointments = await listAppointments(q, s.orgId, {
      status,
      clinicianId,
      search,
      dateFrom,
      dateTo,
      limit: 150,
    });
    const clinicians = await listClinicians(q);
    return { appointments, clinicians };
  });

  const { appointments, clinicians } = data;
  const canBook = can(session.role, 'appointment:create');
  const canUpdate = can(session.role, 'appointment:update');

  return (
    <div className="mx-auto max-w-[1500px] px-4 py-8 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-[var(--color-rule-strong)] pb-4">
        <div>
          <div className="flex items-center gap-3">
            <span className="mono text-xs uppercase tracking-wider text-[var(--color-ink-soft)]">
              Operational Scheduling
            </span>
            <span className="mono border border-[var(--color-rule-strong)] px-2 py-0.5 text-[11px]">
              {appointments.length} appointments
            </span>
          </div>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">Oncology Appointments</h1>
          <p className="mt-1 max-w-2xl text-xs text-[var(--color-ink-soft)]">
            Persistent scheduling directory with real concurrency protection, clinician availability, and OPD clinic integration.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/appointments/calendar"
            className="mono border border-[var(--color-rule-strong)] bg-white px-3 py-1.5 text-xs uppercase tracking-wider hover:bg-[var(--color-accent-soft)]"
          >
            Calendar View
          </Link>
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

      {/* Filter Toolbar */}
      <section aria-label="Appointment filters" className="mt-6 border border-[var(--color-rule-strong)] bg-[var(--color-paper-raised)] p-4">
        <form method="GET" action="/appointments" className="grid gap-3 sm:grid-cols-2 md:grid-cols-4 items-end">
          <div>
            <label htmlFor="search" className="mono block text-[11px] uppercase tracking-wider text-[var(--color-ink-soft)]">
              Search Patient / Token
            </label>
            <input
              id="search"
              name="search"
              defaultValue={search || ''}
              placeholder="Name or token..."
              className="mt-1 block w-full border border-[var(--color-rule-strong)] bg-white px-2.5 py-1.5 text-xs text-[var(--color-ink)]"
            />
          </div>

          <div>
            <label htmlFor="status" className="mono block text-[11px] uppercase tracking-wider text-[var(--color-ink-soft)]">
              Status Filter
            </label>
            <select
              id="status"
              name="status"
              defaultValue={status}
              className="mt-1 block w-full border border-[var(--color-rule-strong)] bg-white px-2.5 py-1.5 text-xs text-[var(--color-ink)]"
            >
              <option value="all">All Statuses</option>
              <option value="scheduled">Scheduled</option>
              <option value="confirmed">Confirmed</option>
              <option value="checked_in">Checked In</option>
              <option value="waiting">Waiting</option>
              <option value="in_consultation">In Consultation</option>
              <option value="completed">Completed</option>
              <option value="delayed">Delayed</option>
              <option value="cancelled">Cancelled</option>
              <option value="no_show">No Show</option>
            </select>
          </div>

          <div>
            <label htmlFor="clinicianId" className="mono block text-[11px] uppercase tracking-wider text-[var(--color-ink-soft)]">
              Attending Clinician
            </label>
            <select
              id="clinicianId"
              name="clinicianId"
              defaultValue={clinicianId || ''}
              className="mt-1 block w-full border border-[var(--color-rule-strong)] bg-white px-2.5 py-1.5 text-xs text-[var(--color-ink)]"
            >
              <option value="">All Clinicians</option>
              {clinicians.map((c) => (
                <option key={c.userId} value={c.userId}>
                  {c.displayName} ({c.specialty})
                </option>
              ))}
            </select>
          </div>

          <div className="flex gap-2">
            <button
              type="submit"
              className="mono w-full border border-[var(--color-ink)] px-3 py-1.5 text-xs uppercase tracking-wider hover:bg-[var(--color-accent-soft)]"
            >
              Apply Filter
            </button>
            <Link
              href="/appointments"
              className="mono border border-[var(--color-rule-strong)] px-3 py-1.5 text-xs uppercase tracking-wider hover:bg-[var(--color-paper)]"
            >
              Reset
            </Link>
          </div>
        </form>
      </section>

      {/* Appointments Table */}
      <div className="mt-6 overflow-x-auto border border-[var(--color-rule-strong)] bg-[var(--color-paper-raised)]">
        <table className="w-full min-w-[900px] text-left text-xs">
          <thead className="border-b border-[var(--color-rule-strong)] bg-[var(--color-paper)] text-[11px] uppercase text-[var(--color-ink-soft)]">
            <tr>
              <th className="p-3">Time & Token</th>
              <th className="p-3">Patient</th>
              <th className="p-3">Clinician & Department</th>
              <th className="p-3">Room</th>
              <th className="p-3">Type & Origin</th>
              <th className="p-3">Status</th>
              <th className="p-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--color-rule)]">
            {appointments.length === 0 ? (
              <tr>
                <td colSpan={7} className="p-8 text-center text-sm text-[var(--color-ink-soft)]">
                  No appointments found matching this criteria.
                </td>
              </tr>
            ) : (
              appointments.map((appt) => (
                <tr key={appt.id} className="hover:bg-white">
                  <td className="p-3">
                    <span className="mono font-medium block">
                      {new Date(appt.scheduled_start).toLocaleDateString('en-IN', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                      })}
                    </span>
                    <span className="mono text-[11px] text-[var(--color-ink-soft)] block">
                      {new Date(appt.scheduled_start).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}{' '}
                      -{' '}
                      {new Date(appt.scheduled_end).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                    {appt.token_number ? (
                      <span className="mono mt-1 inline-block border border-[var(--color-rule-strong)] px-1.5 py-0.5 text-[10px] font-semibold">
                        {appt.token_number}
                      </span>
                    ) : null}
                  </td>

                  <td className="p-3">
                    <Link
                      href={`/patients/${appt.patient_id}/overview`}
                      className="font-medium underline hover:text-[var(--color-accent)]"
                    >
                      {appt.patient_name}
                    </Link>
                    {appt.patient_identifier ? (
                      <span className="mono block text-[11px] text-[var(--color-ink-soft)]">
                        {appt.patient_identifier}
                      </span>
                    ) : null}
                  </td>

                  <td className="p-3">
                    <span className="block font-medium">{appt.clinician_name}</span>
                    <span className="mono block text-[11px] text-[var(--color-ink-soft)]">
                      {appt.department_name || 'General Oncology'}
                    </span>
                  </td>

                  <td className="p-3">
                    <span className="mono">{appt.room_label}</span>
                  </td>

                  <td className="p-3">
                    <span className="mono capitalize block">{appt.appointment_type.replaceAll('_', ' ')}</span>
                    <span className="mono text-[10px] uppercase text-[var(--color-ink-soft)]">
                      {appt.arrival_category}
                    </span>
                  </td>

                  <td className="p-3">
                    <span
                      className={`mono inline-block border px-2 py-0.5 text-[10px] uppercase font-semibold ${statusBadgeClass(
                        appt.status,
                      )}`}
                    >
                      {appt.status.replaceAll('_', ' ')}
                    </span>
                    {appt.cancellation_reason ? (
                      <span className="block text-[10px] text-red-600 mt-1 max-w-xs truncate" title={appt.cancellation_reason}>
                        Reason: {appt.cancellation_reason}
                      </span>
                    ) : null}
                  </td>

                  <td className="p-3 text-right">
                    <div className="flex flex-wrap items-center justify-end gap-1.5">
                      {canUpdate && appt.status === 'scheduled' ? (
                        <form action={changeAppointmentStatusAction} className="inline">
                          <input type="hidden" name="appointmentId" value={appt.id} />
                          <input type="hidden" name="toStatus" value="confirmed" />
                          <button
                            type="submit"
                            className="mono border border-teal-600 px-2 py-1 text-[10px] uppercase text-teal-700 hover:bg-teal-50"
                          >
                            Confirm
                          </button>
                        </form>
                      ) : null}

                      {canUpdate && (appt.status === 'scheduled' || appt.status === 'confirmed') ? (
                        <form action={changeAppointmentStatusAction} className="inline">
                          <input type="hidden" name="appointmentId" value={appt.id} />
                          <input type="hidden" name="toStatus" value="checked_in" />
                          <button
                            type="submit"
                            className="mono border border-amber-600 px-2 py-1 text-[10px] uppercase text-amber-700 hover:bg-amber-50"
                          >
                            Check In
                          </button>
                        </form>
                      ) : null}

                      {appt.status === 'checked_in' || appt.status === 'waiting' ? (
                        <Link
                          href={`/patients/${appt.patient_id}/encounters`}
                          className="mono border border-purple-600 bg-purple-50 px-2 py-1 text-[10px] uppercase text-purple-800 hover:bg-purple-100"
                        >
                          Start Consult
                        </Link>
                      ) : null}

                      {canUpdate && appt.status !== 'completed' && appt.status !== 'cancelled' ? (
                        <form action={changeAppointmentStatusAction} className="inline">
                          <input type="hidden" name="appointmentId" value={appt.id} />
                          <input type="hidden" name="toStatus" value="cancelled" />
                          <input type="hidden" name="reason" value="Staff cancelled from directory" />
                          <button
                            type="submit"
                            className="mono border border-gray-300 px-1.5 py-1 text-[10px] uppercase text-gray-600 hover:bg-red-50 hover:text-red-700"
                          >
                            Cancel
                          </button>
                        </form>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
