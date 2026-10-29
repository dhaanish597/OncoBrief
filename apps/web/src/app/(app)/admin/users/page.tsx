import { listStaff, listInvitations, listDepartments } from '@oncobrief/db';
import { ROLES } from '@oncobrief/domain';
import { withSession } from '@/lib/session';
import {
  inviteStaffAction,
  updateUserRoleAction,
  toggleUserStatusAction,
} from '@/lib/admin-actions';

export default async function AdminUsersPage() {
  const data = await withSession(async (q) => {
    const staff = await listStaff(q);
    const invitations = await listInvitations(q);
    const departments = await listDepartments(q);
    return { staff, invitations, departments };
  });

  return (
    <div className="space-y-10">
      {/* Invite New Staff Section */}
      <section className="border border-[var(--color-rule-strong)] bg-[var(--color-paper-raised)] p-6">
        <div className="border-b border-[var(--color-rule)] pb-3">
          <h2 className="text-lg font-semibold tracking-tight">Invite New Staff Member</h2>
          <p className="mt-1 text-xs text-[var(--color-ink-soft)]">
            Create an invitation for a hospital clinician, nurse coordinator, records officer, receptionist or administrator.
          </p>
        </div>

        <form action={inviteStaffAction} className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <label className="mono block text-[11px] uppercase tracking-wider text-[var(--color-ink-soft)]" htmlFor="invite-email">
              Email Address *
            </label>
            <input
              id="invite-email"
              name="email"
              type="email"
              required
              placeholder="e.g. dr.patel@hospital.example"
              className="mt-1 w-full border border-[var(--color-rule-strong)] bg-[var(--color-paper)] px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]"
            />
          </div>

          <div>
            <label className="mono block text-[11px] uppercase tracking-wider text-[var(--color-ink-soft)]" htmlFor="invite-name">
              Full Display Name *
            </label>
            <input
              id="invite-name"
              name="displayName"
              type="text"
              required
              placeholder="e.g. Dr. Priya Patel"
              className="mt-1 w-full border border-[var(--color-rule-strong)] bg-[var(--color-paper)] px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]"
            />
          </div>

          <div>
            <label className="mono block text-[11px] uppercase tracking-wider text-[var(--color-ink-soft)]" htmlFor="invite-role">
              Operational Role *
            </label>
            <select
              id="invite-role"
              name="role"
              required
              defaultValue="coordinator"
              className="mt-1 w-full border border-[var(--color-rule-strong)] bg-[var(--color-paper)] px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]"
            >
              <option value="clinician">Oncology Clinician / Oncologist</option>
              <option value="coordinator">Nurse / Care Coordinator</option>
              <option value="records_officer">Records Officer</option>
              <option value="receptionist">Receptionist / Front Desk</option>
              <option value="org_admin">Hospital Administrator</option>
              <option value="tumor_board_coordinator">Tumor Board Coordinator</option>
              <option value="auditor">Compliance Auditor (Read-Only)</option>
            </select>
          </div>

          <div>
            <label className="mono block text-[11px] uppercase tracking-wider text-[var(--color-ink-soft)]" htmlFor="invite-department">
              Department (Optional)
            </label>
            <select
              id="invite-department"
              name="departmentId"
              defaultValue=""
              className="mt-1 w-full border border-[var(--color-rule-strong)] bg-[var(--color-paper)] px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]"
            >
              <option value="">None / Unassigned</option>
              {data.departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name} ({d.code})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mono block text-[11px] uppercase tracking-wider text-[var(--color-ink-soft)]" htmlFor="invite-specialty">
              Oncology Specialty (If Clinician)
            </label>
            <input
              id="invite-specialty"
              name="specialty"
              type="text"
              placeholder="e.g. Medical Oncology, Surgical Oncology"
              className="mt-1 w-full border border-[var(--color-rule-strong)] bg-[var(--color-paper)] px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]"
            />
          </div>

          <div className="flex items-end">
            <button
              type="submit"
              className="mono w-full border border-[var(--color-rule-strong)] bg-[var(--color-accent)] px-4 py-2 text-xs uppercase tracking-wider text-white font-medium hover:opacity-90"
            >
              Generate Staff Invitation
            </button>
          </div>
        </form>

        <div className="mt-4 rounded border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 leading-relaxed">
          <strong>Notice:</strong> Outbound hospital SMTP is not configured in this local development environment.
          Invitations generate a real activation token stored in the database. Active tokens are listed below with their direct activation URLs.
        </div>
      </section>

      {/* Pending Invitations Section */}
      {data.invitations.length > 0 && (
        <section className="border border-[var(--color-rule-strong)] bg-[var(--color-paper-raised)] p-6">
          <div className="border-b border-[var(--color-rule)] pb-3">
            <h2 className="text-lg font-semibold tracking-tight">Pending Staff Invitations & Activation Links</h2>
            <p className="mt-1 text-xs text-[var(--color-ink-soft)]">
              Use these direct activation links to complete new staff account setups.
            </p>
          </div>

          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-sm border-collapse">
              <thead>
                <tr className="mono text-[11px] uppercase tracking-wider text-[var(--color-ink-soft)] border-b border-[var(--color-rule)]">
                  <th className="py-2.5 px-3">Name & Email</th>
                  <th className="py-2.5 px-3">Role</th>
                  <th className="py-2.5 px-3">Department</th>
                  <th className="py-2.5 px-3">Expires At</th>
                  <th className="py-2.5 px-3">Status</th>
                  <th className="py-2.5 px-3">Activation Link</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-rule)]">
                {data.invitations.map((inv) => (
                  <tr key={inv.id} className="hover:bg-[var(--color-accent-soft)]">
                    <td className="py-2.5 px-3">
                      <p className="font-medium text-xs text-[var(--color-ink)]">{inv.displayName}</p>
                      <p className="mono text-[11px] text-[var(--color-ink-soft)]">{inv.email}</p>
                    </td>
                    <td className="mono py-2.5 px-3 text-xs uppercase">{inv.role.replaceAll('_', ' ')}</td>
                    <td className="py-2.5 px-3 text-xs">{inv.departmentName || '—'}</td>
                    <td className="mono py-2.5 px-3 text-xs text-[var(--color-ink-soft)]">
                      {new Date(inv.expiresAt).toLocaleDateString()}
                    </td>
                    <td className="py-2.5 px-3">
                      {inv.acceptedAt ? (
                        <span className="mono text-[10px] uppercase font-semibold px-2 py-0.5 rounded bg-emerald-100 text-emerald-800">
                          Activated
                        </span>
                      ) : inv.isExpired ? (
                        <span className="mono text-[10px] uppercase font-semibold px-2 py-0.5 rounded bg-slate-100 text-slate-800">
                          Expired
                        </span>
                      ) : (
                        <span className="mono text-[10px] uppercase font-semibold px-2 py-0.5 rounded bg-amber-100 text-amber-800">
                          Pending
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 px-3">
                      {!inv.acceptedAt && !inv.isExpired ? (
                        <a
                          href={`/activate?token=${encodeURIComponent(inv.token)}`}
                          target="_blank"
                          rel="noreferrer"
                          className="mono text-xs font-medium text-[var(--color-accent)] underline hover:opacity-80"
                        >
                          /activate?token={inv.token.slice(0, 8)}...
                        </a>
                      ) : (
                        <span className="mono text-xs text-[var(--color-ink-soft)]">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Existing Staff Directory Section */}
      <section className="border border-[var(--color-rule-strong)] bg-[var(--color-paper-raised)] p-6">
        <div className="border-b border-[var(--color-rule)] pb-3 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">Active & Registered Hospital Staff</h2>
            <p className="mt-1 text-xs text-[var(--color-ink-soft)]">
              {data.staff.length} staff accounts currently provisioned in this hospital organization.
            </p>
          </div>
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-sm border-collapse min-w-[700px]">
            <thead>
              <tr className="mono text-[11px] uppercase tracking-wider text-[var(--color-ink-soft)] border-b border-[var(--color-rule)]">
                <th className="py-2.5 px-3">Staff Member</th>
                <th className="py-2.5 px-3">Current Role</th>
                <th className="py-2.5 px-3">Department / Specialty</th>
                <th className="py-2.5 px-3">Account Status</th>
                <th className="py-2.5 px-3">Change Role</th>
                <th className="py-2.5 px-3">Deactivate / Activate</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-rule)]">
              {data.staff.map((member) => (
                <tr key={member.id} className="hover:bg-[var(--color-accent-soft)]">
                  <td className="py-2.5 px-3">
                    <p className="font-medium text-xs text-[var(--color-ink)]">
                      {member.displayName}
                      {member.isDemoFixture && (
                        <span className="ml-2 mono text-[10px] uppercase px-1.5 py-0.2 bg-slate-200 text-slate-700 rounded">
                          Synthetic Demo
                        </span>
                      )}
                    </p>
                    <p className="mono text-[11px] text-[var(--color-ink-soft)]">{member.email}</p>
                  </td>
                  <td className="mono py-2.5 px-3 text-xs uppercase font-medium">
                    {member.role.replaceAll('_', ' ')}
                  </td>
                  <td className="py-2.5 px-3 text-xs">
                    {member.departmentName ? `${member.departmentName}` : ''}
                    {member.specialty ? ` (${member.specialty})` : !member.departmentName ? '—' : ''}
                  </td>
                  <td className="py-2.5 px-3">
                    <span
                      className={`mono text-[10px] uppercase font-semibold px-2 py-0.5 rounded ${
                        member.isActive
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-rose-100 text-rose-800'
                      }`}
                    >
                      {member.isActive ? 'Active' : 'Deactivated'}
                    </span>
                  </td>
                  <td className="py-2.5 px-3">
                    <form action={updateUserRoleAction} className="flex items-center gap-2">
                      <input type="hidden" name="userId" value={member.userId} />
                      <select
                        name="newRole"
                        defaultValue={member.role}
                        className="mono text-xs border border-[var(--color-rule)] bg-[var(--color-paper)] px-2 py-1"
                      >
                        {ROLES.map((r) => (
                          <option key={r} value={r}>
                            {r.replaceAll('_', ' ')}
                          </option>
                        ))}
                      </select>
                      <button
                        type="submit"
                        className="mono border border-[var(--color-rule-strong)] px-2 py-1 text-[11px] uppercase hover:bg-[var(--color-accent-soft)]"
                      >
                        Save
                      </button>
                    </form>
                  </td>
                  <td className="py-2.5 px-3">
                    <form action={toggleUserStatusAction}>
                      <input type="hidden" name="userId" value={member.userId} />
                      <input type="hidden" name="isActive" value={member.isActive ? 'false' : 'true'} />
                      <button
                        type="submit"
                        className={`mono border px-2.5 py-1 text-[11px] uppercase font-medium ${
                          member.isActive
                            ? 'border-rose-300 text-rose-700 hover:bg-rose-50'
                            : 'border-emerald-300 text-emerald-700 hover:bg-emerald-50'
                        }`}
                      >
                        {member.isActive ? 'Deactivate' : 'Reactivate'}
                      </button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
