import { listAudit } from '@oncobrief/db';
import { withSession } from '@/lib/session';

export default async function AdminSettingsPage() {
  const data = await withSession(async (q, s) => {
    const orgRes = await q.query<{
      id: string;
      slug: string;
      name: string;
      is_demo_fixture: boolean;
      created_at: Date;
      abdm_hip_id: string | null;
      abdm_hiu_id: string | null;
      hfr_facility_id: string | null;
    }>(
      `SELECT id, slug, name, is_demo_fixture, created_at, abdm_hip_id, abdm_hiu_id, hfr_facility_id
       FROM organization
       WHERE id = $1`,
      [s.orgId],
    );
    const auditLogs = await listAudit(q, { limit: 50 });
    return { org: orgRes.rows[0], auditLogs };
  });

  const org = data.org;

  return (
    <div className="space-y-10">
      {/* Organization Details */}
      <section className="border border-[var(--color-rule-strong)] bg-[var(--color-paper-raised)] p-6">
        <div className="border-b border-[var(--color-rule)] pb-3 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">Hospital Tenant Identity & Configuration</h2>
            <p className="mt-1 text-xs text-[var(--color-ink-soft)]">
              Primary organization metadata and ABDM gateway linkage for this tenant.
            </p>
          </div>
          {org?.is_demo_fixture ? (
            <span className="mono text-xs uppercase px-2.5 py-1 bg-amber-100 text-amber-900 border border-amber-300 rounded font-semibold">
              Synthetic Demo Tenant
            </span>
          ) : (
            <span className="mono text-xs uppercase px-2.5 py-1 bg-emerald-100 text-emerald-900 border border-emerald-300 rounded font-semibold">
              Production Tenant
            </span>
          )}
        </div>

        {org && (
          <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="border border-[var(--color-rule)] bg-[var(--color-paper)] p-3.5">
              <p className="mono text-[11px] uppercase tracking-wider text-[var(--color-ink-soft)]">Hospital Name</p>
              <p className="mt-1 font-semibold text-sm">{org.name}</p>
            </div>
            <div className="border border-[var(--color-rule)] bg-[var(--color-paper)] p-3.5">
              <p className="mono text-[11px] uppercase tracking-wider text-[var(--color-ink-soft)]">Tenant Slug & UUID</p>
              <p className="mt-1 font-medium text-xs mono">{org.slug}</p>
              <p className="mono text-[10px] text-[var(--color-ink-soft)] truncate">{org.id}</p>
            </div>
            <div className="border border-[var(--color-rule)] bg-[var(--color-paper)] p-3.5">
              <p className="mono text-[11px] uppercase tracking-wider text-[var(--color-ink-soft)]">HFR Facility ID</p>
              <p className="mt-1 font-medium text-xs mono">{org.hfr_facility_id || 'Not registered'}</p>
            </div>
            <div className="border border-[var(--color-rule)] bg-[var(--color-paper)] p-3.5">
              <p className="mono text-[11px] uppercase tracking-wider text-[var(--color-ink-soft)]">ABDM HIP Identifier</p>
              <p className="mt-1 font-medium text-xs mono">{org.abdm_hip_id || '—'}</p>
            </div>
            <div className="border border-[var(--color-rule)] bg-[var(--color-paper)] p-3.5">
              <p className="mono text-[11px] uppercase tracking-wider text-[var(--color-ink-soft)]">ABDM HIU Identifier</p>
              <p className="mt-1 font-medium text-xs mono">{org.abdm_hiu_id || '—'}</p>
            </div>
            <div className="border border-[var(--color-rule)] bg-[var(--color-paper)] p-3.5">
              <p className="mono text-[11px] uppercase tracking-wider text-[var(--color-ink-soft)]">Tenant Provisioned At</p>
              <p className="mt-1 font-medium text-xs mono">{new Date(org.created_at).toLocaleDateString()}</p>
            </div>
          </div>
        )}
      </section>

      {/* Audit Log Stream */}
      <section className="border border-[var(--color-rule-strong)] bg-[var(--color-paper-raised)] p-6">
        <div className="border-b border-[var(--color-rule)] pb-3">
          <h2 className="text-lg font-semibold tracking-tight">Organization Audit Log Stream</h2>
          <p className="mt-1 text-xs text-[var(--color-ink-soft)]">
            Append-only, SHA-256 hash-chained security and clinical operation logs. Showing latest 50 events.
          </p>
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-sm border-collapse min-w-[800px]">
            <thead>
              <tr className="mono text-[11px] uppercase tracking-wider text-[var(--color-ink-soft)] border-b border-[var(--color-rule)]">
                <th className="py-2.5 px-3">Time</th>
                <th className="py-2.5 px-3">Actor</th>
                <th className="py-2.5 px-3">Role</th>
                <th className="py-2.5 px-3">Action</th>
                <th className="py-2.5 px-3">Entity Kind</th>
                <th className="py-2.5 px-3">Entity ID</th>
                <th className="py-2.5 px-3">Outcome</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-rule)]">
              {data.auditLogs.map((log) => (
                <tr key={log.id} className="hover:bg-[var(--color-accent-soft)]">
                  <td className="mono py-2 px-3 text-xs text-[var(--color-ink-soft)]">
                    {new Date(log.occurredAt).toLocaleString()}
                  </td>
                  <td className="py-2 px-3 text-xs font-medium">{log.actorName || 'System'}</td>
                  <td className="mono py-2 px-3 text-[11px] uppercase text-[var(--color-ink-soft)]">{log.actorRole || '—'}</td>
                  <td className="mono py-2 px-3 text-xs font-semibold">{log.action}</td>
                  <td className="mono py-2 px-3 text-xs text-[var(--color-ink-soft)]">{log.entityKind || '—'}</td>
                  <td className="mono py-2 px-3 text-[11px] text-[var(--color-ink-soft)] truncate max-w-[120px]" title={log.entityId || ''}>
                    {log.entityId ? log.entityId.slice(0, 8) + '...' : '—'}
                  </td>
                  <td className="py-2 px-3">
                    <span
                      className={`mono text-[10px] uppercase font-semibold px-2 py-0.5 rounded ${
                        log.outcome === 'success'
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-rose-100 text-rose-800'
                      }`}
                    >
                      {log.outcome}
                    </span>
                  </td>
                </tr>
              ))}
              {data.auditLogs.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-sm text-[var(--color-ink-soft)]">
                    No audit records recorded yet.
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
