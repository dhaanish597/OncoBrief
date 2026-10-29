import Link from 'next/link';
import { can } from '@oncobrief/domain';
import { listEncounters, listAppointments } from '@oncobrief/db';
import { requireSession, withSession } from '@/lib/session';
import { SectionHeading, EmptyFinding } from '@/components/evidence';
import { startEncounterAction } from '@/lib/encounter-actions';

function encounterBadgeClass(status: string): string {
  switch (status) {
    case 'in_progress':
      return 'border-purple-300 bg-purple-50 text-purple-800';
    case 'completed':
      return 'border-emerald-300 bg-emerald-50 text-emerald-800';
    case 'amended':
      return 'border-amber-300 bg-amber-50 text-amber-800';
    case 'cancelled':
      return 'border-red-300 bg-red-50 text-red-800';
    default:
      return 'border-gray-300 bg-gray-50 text-gray-800';
  }
}

export default async function PatientEncountersPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await requireSession();
  const canStart = can(session.role, 'encounter:create');

  const data = await withSession(async (q, s) => {
    const encounters = await listEncounters(q, s.orgId, id);
    const appointments = await listAppointments(q, s.orgId, {
      patientId: id,
      limit: 20,
    });
    return { encounters, appointments };
  });

  const { encounters, appointments } = data;
  const activeAppointments = appointments.filter(
    (a) => a.status === 'checked_in' || a.status === 'waiting' || a.status === 'scheduled' || a.status === 'confirmed',
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <SectionHeading title="Consultation & Clinical Encounters" count={encounters.length} />
          <p className="mt-1 text-xs text-[var(--color-ink-soft)] max-w-3xl">
            Persistent encounter lifecycle with clinician-authored professional documentation. All diagnostic evaluations,
            assessments, and treatment plans are manually authored by attending oncologists.
          </p>
        </div>

        {canStart ? (
          <form action={startEncounterAction} className="flex flex-wrap items-center gap-2">
            <input type="hidden" name="patientId" value={id} />
            {activeAppointments.length > 0 ? (
              <select
                name="appointmentId"
                className="mono border border-[var(--color-rule-strong)] bg-white px-2.5 py-1.5 text-xs text-[var(--color-ink)]"
              >
                <option value="">Start Ad-Hoc Outpatient Consult</option>
                {activeAppointments.map((a) => (
                  <option key={a.id} value={a.id}>
                    Link Appt: {a.token_number || a.room_label} ({new Date(a.scheduled_start).toLocaleDateString([], { month: 'short', day: 'numeric' })})
                  </option>
                ))}
              </select>
            ) : null}
            <button
              type="submit"
              className="mono border border-[var(--color-ink)] bg-[var(--color-ink)] px-3.5 py-1.5 text-xs uppercase tracking-wider text-white hover:bg-black"
            >
              Start Encounter
            </button>
          </form>
        ) : null}
      </div>

      {encounters.length === 0 ? (
        <div className="mt-6">
          <EmptyFinding>
            No encounters recorded yet for this patient. Start a consultation encounter to author clinical notes and record multidisciplinary discussions.
          </EmptyFinding>
        </div>
      ) : (
        <div className="space-y-4">
          {encounters.map((enc) => (
            <div
              key={enc.id}
              className="border border-[var(--color-rule-strong)] bg-[var(--color-paper-raised)] p-5 transition-shadow hover:shadow-sm"
            >
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--color-rule)] pb-3">
                <div className="flex flex-wrap items-center gap-2.5">
                  <span
                    className={`mono border px-2 py-0.5 text-[10px] uppercase font-bold ${encounterBadgeClass(
                      enc.status,
                    )}`}
                  >
                    {enc.status.replaceAll('_', ' ')}
                  </span>
                  <span className="mono text-xs uppercase text-[var(--color-ink)] font-semibold">
                    {enc.encounter_type} Encounter
                  </span>
                  <span className="mono text-[11px] text-[var(--color-ink-soft)]">
                    Started {new Date(enc.started_at).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}
                  </span>
                  {enc.completed_at ? (
                    <span className="mono text-[11px] text-[var(--color-ink-soft)]">
                      · Completed {new Date(enc.completed_at).toLocaleTimeString([], { timeStyle: 'short' })}
                    </span>
                  ) : null}
                </div>

                <Link
                  href={`/patients/${id}/encounters/${enc.id}`}
                  className="mono border border-[var(--color-ink)] px-3 py-1 text-xs uppercase tracking-wider hover:bg-[var(--color-accent-soft)]"
                >
                  {enc.status === 'in_progress' ? 'Open Consultation Room →' : 'View Consultation Record →'}
                </Link>
              </div>

              <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 text-xs">
                <div>
                  <span className="mono block text-[10px] uppercase text-[var(--color-ink-soft)]">
                    Primary Attending Clinician
                  </span>
                  <span className="font-medium text-sm text-[var(--color-ink)]">{enc.clinician_name}</span>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {enc.participants.map((p) => (
                      <span
                        key={p.id}
                        className="mono border border-[var(--color-rule)] bg-white px-1.5 py-0.5 text-[10px] text-[var(--color-ink-soft)]"
                      >
                        {p.user_name} ({p.role.replaceAll('_', ' ')})
                      </span>
                    ))}
                  </div>
                </div>

                <div>
                  <span className="mono block text-[10px] uppercase text-[var(--color-ink-soft)]">
                    Latest Clinical Note Version
                  </span>
                  {enc.latest_note ? (
                    <div className="mt-1">
                      <span className="font-medium block">{enc.latest_note.title} (v{enc.latest_note.version})</span>
                      <span className="mono text-[10px] uppercase text-[var(--color-ink-soft)] block">
                        Status: {enc.latest_note.status} · Authored by {enc.latest_note.author_name}
                      </span>
                      {enc.latest_note.amendment_reason ? (
                        <p className="mono text-[10px] text-amber-800 mt-1">
                          Amended: {enc.latest_note.amendment_reason}
                        </p>
                      ) : null}
                    </div>
                  ) : (
                    <span className="mono text-xs text-[var(--color-ink-soft)] italic mt-1 block">
                      No note drafted yet
                    </span>
                  )}
                </div>

                <div>
                  <span className="mono block text-[10px] uppercase text-[var(--color-ink-soft)]">
                    Assessment & Plan Summary
                  </span>
                  <p className="mt-1 text-xs text-[var(--color-ink)] line-clamp-3">
                    {enc.latest_note?.clinical_assessment || enc.latest_note?.plan_and_instructions || 'Consultation in progress...'}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
