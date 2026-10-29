import { notFound } from 'next/navigation';
import { can } from '@oncobrief/domain';
import { getPatient, listCareTeam, listStaff } from '@oncobrief/db';
import { requireSession, withSession } from '@/lib/session';
import { assignCareTeamAction, removeCareTeamAction } from '@/lib/patient-actions';

export default async function PatientCareTeamPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await requireSession();

  const data = await withSession(async (q) => {
    const patient = await getPatient(q, id);
    if (!patient) return null;
    const careTeam = await listCareTeam(q, id);
    const staff = await listStaff(q);
    return { patient, careTeam, staff };
  });

  if (!data) notFound();
  const { patient, careTeam, staff } = data;
  const canAssign = can(session.role, 'task:assign');

  const ROLE_LABELS: Record<string, string> = {
    primary_oncologist: 'Primary Oncologist',
    consulting_oncologist: 'Consulting Oncologist',
    surgical_oncologist: 'Surgical Oncologist',
    radiation_oncologist: 'Radiation Oncologist',
    care_coordinator: 'Nurse / Care Coordinator',
    nurse: 'Staff Nurse',
    records_officer: 'Records Officer',
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="border-b border-[var(--color-rule-strong)] pb-3">
        <h2 className="text-xl font-semibold tracking-tight">Oncology Care Team Roster</h2>
        <p className="mt-1 text-xs text-[var(--color-ink-soft)]">
          Designated multidisciplinary team responsible for clinical oversight, treatment planning, and care coordination for {patient.displayName}.
        </p>
      </div>

      {/* Add Member Section */}
      {canAssign && (
        <section className="border border-[var(--color-rule-strong)] bg-[var(--color-paper-raised)] p-5">
          <h3 className="mono text-xs font-semibold uppercase tracking-wider text-[var(--color-ink)] border-b border-[var(--color-rule)] pb-2">
            + Assign Care Team Member
          </h3>

          <form action={assignCareTeamAction} className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-4">
            <input type="hidden" name="patientId" value={id} />

            <div className="sm:col-span-2">
              <label htmlFor="team-user" className="mono block text-[11px] uppercase tracking-wider text-[var(--color-ink-soft)]">
                Staff Member *
              </label>
              <select
                id="team-user"
                name="userId"
                required
                className="mt-1 w-full border border-[var(--color-rule-strong)] bg-[var(--color-paper)] px-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]"
              >
                <option value="">Select hospital staff member...</option>
                {staff
                  .filter((s) => s.isActive)
                  .map((s) => (
                    <option key={s.userId} value={s.userId}>
                      {s.displayName} ({s.role.replaceAll('_', ' ')}
                      {s.specialty ? ` — ${s.specialty}` : ''})
                    </option>
                  ))}
              </select>
            </div>

            <div>
              <label htmlFor="team-role" className="mono block text-[11px] uppercase tracking-wider text-[var(--color-ink-soft)]">
                Role in Team *
              </label>
              <select
                id="team-role"
                name="roleInTeam"
                required
                defaultValue="consulting_oncologist"
                className="mt-1 w-full border border-[var(--color-rule-strong)] bg-[var(--color-paper)] px-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]"
              >
                <option value="primary_oncologist">Primary Oncologist</option>
                <option value="consulting_oncologist">Consulting Oncologist</option>
                <option value="surgical_oncologist">Surgical Oncologist</option>
                <option value="radiation_oncologist">Radiation Oncologist</option>
                <option value="care_coordinator">Care Coordinator</option>
                <option value="nurse">Staff Nurse</option>
                <option value="records_officer">Records Officer</option>
              </select>
            </div>

            <div>
              <label htmlFor="team-notes" className="mono block text-[11px] uppercase tracking-wider text-[var(--color-ink-soft)]">
                Assignment Note
              </label>
              <input
                id="team-notes"
                name="notes"
                type="text"
                placeholder="e.g. Lead for adjuvant chemotherapy"
                className="mt-1 w-full border border-[var(--color-rule-strong)] bg-[var(--color-paper)] px-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]"
              />
            </div>

            <div className="sm:col-span-4 flex justify-end">
              <button
                type="submit"
                className="mono border border-[var(--color-rule-strong)] bg-[var(--color-accent)] px-4 py-1.5 text-xs uppercase tracking-wider text-white font-medium hover:opacity-90"
              >
                Confirm Team Assignment
              </button>
            </div>
          </form>
        </section>
      )}

      {/* Roster Table */}
      <section className="border border-[var(--color-rule-strong)] bg-[var(--color-paper-raised)] p-6">
        <div className="border-b border-[var(--color-rule)] pb-3 flex items-center justify-between">
          <h3 className="text-base font-semibold">Active Team Members ({careTeam.length})</h3>
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-sm border-collapse min-w-[700px]">
            <thead>
              <tr className="mono text-[11px] uppercase tracking-wider text-[var(--color-ink-soft)] border-b border-[var(--color-rule)]">
                <th className="py-2.5 px-3">Team Member</th>
                <th className="py-2.5 px-3">Care Team Role</th>
                <th className="py-2.5 px-3">Specialty</th>
                <th className="py-2.5 px-3">Assigned Date</th>
                <th className="py-2.5 px-3">Notes</th>
                {canAssign && <th className="py-2.5 px-3 text-right">Action</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-rule)]">
              {careTeam.map((member) => (
                <tr key={member.id} className="hover:bg-[var(--color-accent-soft)]">
                  <td className="py-2.5 px-3">
                    <p className="font-semibold text-xs text-[var(--color-ink)]">{member.displayName}</p>
                    <p className="mono text-[11px] text-[var(--color-ink-soft)]">{member.email}</p>
                  </td>
                  <td className="mono py-2.5 px-3 text-xs font-medium">
                    <span className={member.roleInTeam === 'primary_oncologist' ? 'font-bold text-[var(--color-accent)]' : ''}>
                      {ROLE_LABELS[member.roleInTeam] || member.roleInTeam}
                    </span>
                  </td>
                  <td className="py-2.5 px-3 text-xs text-[var(--color-ink-soft)]">{member.specialty || '—'}</td>
                  <td className="mono py-2.5 px-3 text-xs text-[var(--color-ink-soft)]">
                    {new Date(member.assignedAt).toLocaleDateString()}
                  </td>
                  <td className="py-2.5 px-3 text-xs">{member.notes || '—'}</td>
                  {canAssign && (
                    <td className="py-2.5 px-3 text-right">
                      <form action={removeCareTeamAction}>
                        <input type="hidden" name="patientId" value={id} />
                        <input type="hidden" name="userId" value={member.userId} />
                        <button
                          type="submit"
                          className="mono text-rose-700 hover:text-rose-900 text-xs uppercase underline decoration-dotted"
                        >
                          Remove
                        </button>
                      </form>
                    </td>
                  )}
                </tr>
              ))}
              {careTeam.length === 0 && (
                <tr>
                  <td colSpan={canAssign ? 6 : 5} className="py-8 text-center text-xs mono text-[var(--color-ink-soft)]">
                    No care team members assigned yet. Use the form above to designate clinicians and coordinators.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
