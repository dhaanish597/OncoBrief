import Link from 'next/link';
import { redirect } from 'next/navigation';
import { can } from '@oncobrief/domain';
import {
  listPatients,
  listClinicians,
  listDepartments,
} from '@oncobrief/db';
import { requireSession, withSession } from '@/lib/session';
import { createAppointmentAction } from '@/lib/appointment-actions';

export default async function NewAppointmentPage({
  searchParams,
}: {
  searchParams: Promise<{ patientId?: string }>;
}) {
  const session = await requireSession();
  if (!can(session.role, 'appointment:create')) {
    redirect('/appointments');
  }

  const params = await searchParams;
  const preselectedPatientId = params.patientId || '';

  const data = await withSession(async (q) => {
    const patients = await listPatients(q);
    const clinicians = await listClinicians(q);
    const departments = await listDepartments(q);
    return { patients, clinicians, departments };
  });

  const { patients, clinicians, departments } = data;

  // Default times: tomorrow 10:00 to 10:30
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const defaultDate = tomorrow.toISOString().split('T')[0];
  const defaultStart = `${defaultDate}T10:00`;
  const defaultEnd = `${defaultDate}T10:30`;

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
      <div className="border-b border-[var(--color-rule-strong)] pb-4">
        <Link
          href="/appointments"
          className="mono text-xs uppercase tracking-wider text-[var(--color-ink-soft)] hover:text-[var(--color-ink)]"
        >
          ← Back to Appointments
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Book Oncology Appointment</h1>
        <p className="mt-1 text-xs text-[var(--color-ink-soft)]">
          Schedules an in-person or teleconsult consultation with conflict prevention and clinician leave validation.
        </p>
      </div>

      <form action={createAppointmentAction} className="mt-6 space-y-5 border border-[var(--color-rule-strong)] bg-[var(--color-paper-raised)] p-6">
        <div>
          <label htmlFor="patientId" className="mono block text-xs uppercase tracking-wider text-[var(--color-ink)] font-medium">
            Patient *
          </label>
          <select
            id="patientId"
            name="patientId"
            required
            defaultValue={preselectedPatientId}
            className="mt-1.5 block w-full border border-[var(--color-rule-strong)] bg-white px-3 py-2 text-sm text-[var(--color-ink)]"
          >
            <option value="">Select a registered patient...</option>
            {patients.map((p) => (
              <option key={p.id} value={p.id}>
                {p.displayName} {p.mrn ? `(${p.mrn})` : ''}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="clinicianId" className="mono block text-xs uppercase tracking-wider text-[var(--color-ink)] font-medium">
            Attending Clinician *
          </label>
          <select
            id="clinicianId"
            name="clinicianId"
            required
            className="mt-1.5 block w-full border border-[var(--color-rule-strong)] bg-white px-3 py-2 text-sm text-[var(--color-ink)]"
          >
            <option value="">Select an oncologist...</option>
            {clinicians.map((c) => (
              <option key={c.userId} value={c.userId}>
                {c.displayName} — {c.specialty} ({c.departmentName || 'Oncology'})
              </option>
            ))}
          </select>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="departmentId" className="mono block text-xs uppercase tracking-wider text-[var(--color-ink)] font-medium">
              Department
            </label>
            <select
              id="departmentId"
              name="departmentId"
              className="mt-1.5 block w-full border border-[var(--color-rule-strong)] bg-white px-3 py-2 text-sm text-[var(--color-ink)]"
            >
              <option value="">Default Department</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="roomLabel" className="mono block text-xs uppercase tracking-wider text-[var(--color-ink)] font-medium">
              Consulting Room *
            </label>
            <input
              id="roomLabel"
              name="roomLabel"
              defaultValue="OPD Room 1"
              required
              className="mt-1.5 block w-full border border-[var(--color-rule-strong)] bg-white px-3 py-2 text-sm text-[var(--color-ink)]"
            />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="scheduledStart" className="mono block text-xs uppercase tracking-wider text-[var(--color-ink)] font-medium">
              Scheduled Start *
            </label>
            <input
              id="scheduledStart"
              name="scheduledStart"
              type="datetime-local"
              required
              defaultValue={defaultStart}
              className="mt-1.5 block w-full border border-[var(--color-rule-strong)] bg-white px-3 py-2 text-sm text-[var(--color-ink)]"
            />
          </div>

          <div>
            <label htmlFor="scheduledEnd" className="mono block text-xs uppercase tracking-wider text-[var(--color-ink)] font-medium">
              Scheduled End *
            </label>
            <input
              id="scheduledEnd"
              name="scheduledEnd"
              type="datetime-local"
              required
              defaultValue={defaultEnd}
              className="mt-1.5 block w-full border border-[var(--color-rule-strong)] bg-white px-3 py-2 text-sm text-[var(--color-ink)]"
            />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="appointmentType" className="mono block text-xs uppercase tracking-wider text-[var(--color-ink)] font-medium">
              Appointment Type
            </label>
            <select
              id="appointmentType"
              name="appointmentType"
              defaultValue="follow_up"
              className="mt-1.5 block w-full border border-[var(--color-rule-strong)] bg-white px-3 py-2 text-sm text-[var(--color-ink)]"
            >
              <option value="new_consultation">New Consultation</option>
              <option value="follow_up">Routine Follow-up</option>
              <option value="chemo_clearance">Chemo Cycle Clearance</option>
              <option value="post_op">Post-Op Wound Check</option>
              <option value="urgent_review">Urgent Clinical Review</option>
            </select>
          </div>

          <div>
            <label htmlFor="arrivalCategory" className="mono block text-xs uppercase tracking-wider text-[var(--color-ink)] font-medium">
              Arrival Origin
            </label>
            <select
              id="arrivalCategory"
              name="arrivalCategory"
              defaultValue="scheduled"
              className="mt-1.5 block w-full border border-[var(--color-rule-strong)] bg-white px-3 py-2 text-sm text-[var(--color-ink)]"
            >
              <option value="scheduled">Scheduled Advance Booking</option>
              <option value="walk_in">Staff-Authorized Walk-In</option>
            </select>
          </div>
        </div>

        <div>
          <label htmlFor="notes" className="mono block text-xs uppercase tracking-wider text-[var(--color-ink)] font-medium">
            Administrative Notes (Optional)
          </label>
          <textarea
            id="notes"
            name="notes"
            rows={3}
            placeholder="Operational or scheduling notes..."
            className="mt-1.5 block w-full border border-[var(--color-rule-strong)] bg-white px-3 py-2 text-sm text-[var(--color-ink)]"
          />
        </div>

        <div className="flex items-center justify-end gap-3 pt-3 border-t border-[var(--color-rule)]">
          <Link
            href="/appointments"
            className="mono border border-[var(--color-rule-strong)] px-4 py-2 text-xs uppercase tracking-wider hover:bg-[var(--color-paper)]"
          >
            Cancel
          </Link>
          <button
            type="submit"
            className="mono border border-[var(--color-ink)] bg-[var(--color-ink)] px-5 py-2 text-xs uppercase tracking-wider text-white hover:bg-black"
          >
            Confirm Booking
          </button>
        </div>
      </form>
    </div>
  );
}
