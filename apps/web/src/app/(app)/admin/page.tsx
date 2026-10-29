import Link from 'next/link';
import { listStaff, listClinicians, listDepartments, listFacilities, listInvitations, listAudit } from '@oncobrief/db';
import { withSession } from '@/lib/session';

export default async function AdminOverviewPage() {
  const data = await withSession(async (q) => {
    const staff = await listStaff(q);
    const clinicians = await listClinicians(q);
    const departments = await listDepartments(q);
    const facilities = await listFacilities(q);
    const invitations = await listInvitations(q);
    const auditLogs = await listAudit(q, { limit: 10 });
    return { staff, clinicians, departments, facilities, invitations, auditLogs };
  });

  const activeStaff = data.staff.filter((s) => s.isActive).length;
  const pendingInvites = data.invitations.filter((i) => !i.acceptedAt && !i.isExpired).length;

  return (
    <div className="space-y-8">
      {/* Metrics Grid */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="border border-[var(--color-rule-strong)] bg-[var(--color-paper-raised)] p-5">
          <p className="mono text-xs uppercase tracking-wider text-[var(--color-ink-soft)]">Active Staff</p>
          <p className="mt-2 text-3xl font-semibold tracking-tight">{activeStaff}</p>
          <p className="mt-1 text-xs text-[var(--color-ink-soft)]">{data.staff.length} total registered</p>
        </div>
        <div className="border border-[var(--color-rule-strong)] bg-[var(--color-paper-raised)] p-5">
          <p className="mono text-xs uppercase tracking-wider text-[var(--color-ink-soft)]">Oncologists & Clinicians</p>
          <p className="mt-2 text-3xl font-semibold tracking-tight">{data.clinicians.length}</p>
          <p className="mt-1 text-xs text-[var(--color-ink-soft)]">Medical, Surgical & Radiation</p>
        </div>
        <div className="border border-[var(--color-rule-strong)] bg-[var(--color-paper-raised)] p-5">
          <p className="mono text-xs uppercase tracking-wider text-[var(--color-ink-soft)]">Departments & Units</p>
          <p className="mt-2 text-3xl font-semibold tracking-tight">{data.departments.length}</p>
          <p className="mt-1 text-xs text-[var(--color-ink-soft)]">{data.facilities.length} physical facility site(s)</p>
        </div>
        <div className="border border-[var(--color-rule-strong)] bg-[var(--color-paper-raised)] p-5">
          <p className="mono text-xs uppercase tracking-wider text-[var(--color-ink-soft)]">Pending Invitations</p>
          <p className="mt-2 text-3xl font-semibold tracking-tight">{pendingInvites}</p>
          <p className="mt-1 text-xs text-[var(--color-ink-soft)]">Awaiting activation</p>
        </div>
      </div>

      {/* Quick Navigation Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="border border-[var(--color-rule)] bg-[var(--color-paper)] p-5 flex flex-col justify-between">
          <div>
            <h3 className="font-semibold text-base">Staff & Roles Governance</h3>
            <p className="mt-1 text-sm text-[var(--color-ink-soft)]">
              Invite doctors, care coordinators, nurses and receptionists. Reassign roles and manage user activation states.
            </p>
          </div>
          <div className="mt-4">
            <Link
              href="/admin/users"
              className="mono inline-block text-xs uppercase tracking-wider underline decoration-dotted text-[var(--color-accent)] font-medium"
            >
              Manage Staff Roster →
            </Link>
          </div>
        </div>

        <div className="border border-[var(--color-rule)] bg-[var(--color-paper)] p-5 flex flex-col justify-between">
          <div>
            <h3 className="font-semibold text-base">Clinician Profiles & Specialties</h3>
            <p className="mt-1 text-sm text-[var(--color-ink-soft)]">
              Maintain medical oncology, surgical oncology and radiation oncology profiles, license records and consultation rooms.
            </p>
          </div>
          <div className="mt-4">
            <Link
              href="/admin/clinicians"
              className="mono inline-block text-xs uppercase tracking-wider underline decoration-dotted text-[var(--color-accent)] font-medium"
            >
              Configure Clinicians →
            </Link>
          </div>
        </div>

        <div className="border border-[var(--color-rule)] bg-[var(--color-paper)] p-5 flex flex-col justify-between">
          <div>
            <h3 className="font-semibold text-base">Hospital Departments & Facilities</h3>
            <p className="mt-1 text-sm text-[var(--color-ink-soft)]">
              Register cancer care service lines, outpatient clinics, labs, and inpatient wards across hospital sites.
            </p>
          </div>
          <div className="mt-4">
            <Link
              href="/admin/departments"
              className="mono inline-block text-xs uppercase tracking-wider underline decoration-dotted text-[var(--color-accent)] font-medium"
            >
              Manage Departments →
            </Link>
          </div>
        </div>
      </div>

      {/* Recent Admin Audit Activity */}
      <div className="border border-[var(--color-rule-strong)] bg-[var(--color-paper-raised)] p-6">
        <div className="flex items-center justify-between border-b border-[var(--color-rule)] pb-3">
          <h2 className="font-semibold text-lg">Recent Administrative & Operational Audit Events</h2>
          <Link
            href="/admin/settings"
            className="mono text-xs uppercase tracking-wider text-[var(--color-ink-soft)] hover:underline"
          >
            View all audit stream →
          </Link>
        </div>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-sm border-collapse">
            <thead>
              <tr className="mono text-[11px] uppercase tracking-wider text-[var(--color-ink-soft)] border-b border-[var(--color-rule)]">
                <th className="py-2 px-3">Timestamp</th>
                <th className="py-2 px-3">Actor</th>
                <th className="py-2 px-3">Role</th>
                <th className="py-2 px-3">Action</th>
                <th className="py-2 px-3">Entity</th>
                <th className="py-2 px-3">Outcome</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-rule)]">
              {data.auditLogs.slice(0, 8).map((evt) => (
                <tr key={evt.id} className="hover:bg-[var(--color-accent-soft)]">
                  <td className="mono py-2.5 px-3 text-xs text-[var(--color-ink-soft)]">
                    {new Date(evt.occurredAt).toLocaleString()}
                  </td>
                  <td className="py-2.5 px-3 font-medium text-xs">{evt.actorName || 'System'}</td>
                  <td className="mono py-2.5 px-3 text-[11px] uppercase text-[var(--color-ink-soft)]">{evt.actorRole || '—'}</td>
                  <td className="mono py-2.5 px-3 text-xs font-semibold">{evt.action}</td>
                  <td className="mono py-2.5 px-3 text-xs text-[var(--color-ink-soft)]">{evt.entityKind || '—'}</td>
                  <td className="py-2.5 px-3">
                    <span
                      className={`mono text-[10px] uppercase font-semibold px-2 py-0.5 rounded ${
                        evt.outcome === 'success'
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-rose-100 text-rose-800'
                      }`}
                    >
                      {evt.outcome}
                    </span>
                  </td>
                </tr>
              ))}
              {data.auditLogs.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-6 text-center text-sm text-[var(--color-ink-soft)]">
                    No recent audit activity.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
