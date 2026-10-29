import Link from 'next/link';
import { forbidden } from 'next/navigation';
import { can } from '@oncobrief/domain';
import { searchAndFilterPatients, listClinicians, listDepartments } from '@oncobrief/db';
import { requireSession, withSession } from '@/lib/session';
import { ReadinessBand } from '@/components/evidence';

export default async function PatientsPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    clinician?: string;
    department?: string;
    status?: 'active' | 'archived' | 'all';
    sortBy?: 'name' | 'readiness' | 'date';
    sortOrder?: 'asc' | 'desc';
    page?: string;
  }>;
}) {
  const session = await requireSession();
  if (!can(session.role, 'patient:read')) {
    forbidden();
  }

  const params = await searchParams;
  const pageNum = Math.max(1, parseInt(params.page || '1', 10));
  const query = params.q || '';
  const clinicianId = params.clinician || '';
  const departmentId = params.department || '';
  const status = params.status || 'active';
  const sortBy = params.sortBy || 'readiness';
  const sortOrder = params.sortOrder || 'desc';

  const data = await withSession(async (q) => {
    const paginated = await searchAndFilterPatients(q, {
      query: query || undefined,
      clinicianId: clinicianId || undefined,
      departmentId: departmentId || undefined,
      status,
      sortBy,
      sortOrder,
      page: pageNum,
      pageSize: 20,
    });
    const clinicians = await listClinicians(q);
    const departments = await listDepartments(q);
    return { ...paginated, clinicians, departments };
  });

  const canCreatePatient = can(session.role, 'patient:create');

  return (
    <main className="mx-auto max-w-[1500px] px-4 py-6 sm:px-6 sm:py-10">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-[var(--color-rule-strong)] pb-4">
        <div>
          <span className="mono text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--color-accent)]">
            Patient Registry
          </span>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">Hospital Oncology Patient Index</h1>
          <p className="mt-2 text-sm text-[var(--color-ink-soft)]">
            Centralized hospital patient directory. Search by name, MRN, clinician, or department.
          </p>
        </div>

        {canCreatePatient && (
          <Link
            href="/patients/new"
            className="mono border border-[var(--color-rule-strong)] bg-[var(--color-accent)] px-4 py-2 text-xs uppercase tracking-wider text-white font-medium hover:opacity-90 transition-opacity"
          >
            + Register New Patient
          </Link>
        )}
      </div>

      {/* Filter and Search Bar */}
      <div className="mt-6 border border-[var(--color-rule-strong)] bg-[var(--color-paper-raised)] p-4">
        <form method="GET" className="grid grid-cols-1 gap-3 sm:grid-cols-5">
          <div className="sm:col-span-2">
            <label htmlFor="search-q" className="sr-only">Search by name or MRN</label>
            <input
              id="search-q"
              name="q"
              type="text"
              defaultValue={query}
              placeholder="Search by name, MRN or demo code..."
              className="w-full border border-[var(--color-rule-strong)] bg-[var(--color-paper)] px-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]"
            />
          </div>

          <div>
            <label htmlFor="filter-clinician" className="sr-only">Filter by Clinician</label>
            <select
              id="filter-clinician"
              name="clinician"
              defaultValue={clinicianId}
              className="w-full border border-[var(--color-rule-strong)] bg-[var(--color-paper)] px-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]"
            >
              <option value="">All Clinicians</option>
              {data.clinicians.map((c) => (
                <option key={c.userId} value={c.userId}>
                  {c.displayName} ({c.specialty})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="filter-department" className="sr-only">Filter by Department</label>
            <select
              id="filter-department"
              name="department"
              defaultValue={departmentId}
              className="w-full border border-[var(--color-rule-strong)] bg-[var(--color-paper)] px-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]"
            >
              <option value="">All Departments</option>
              {data.departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex gap-2">
            <select
              name="status"
              defaultValue={status}
              aria-label="Filter by patient status"
              className="w-full border border-[var(--color-rule-strong)] bg-[var(--color-paper)] px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]"
            >
              <option value="active">Active Patients</option>
              <option value="archived">Archived Only</option>
              <option value="all">All Patients</option>
            </select>
            <button
              type="submit"
              className="mono border border-[var(--color-rule-strong)] bg-[var(--color-paper-raised)] px-3 py-1.5 text-xs uppercase font-medium hover:bg-[var(--color-accent-soft)]"
            >
              Filter
            </button>
          </div>
        </form>
      </div>

      {/* Patient Table */}
      <div className="mt-6 border border-[var(--color-rule-strong)] bg-[var(--color-paper-raised)]">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[850px] border-collapse text-sm">
            <caption className="sr-only">Hospital patient registry</caption>
            <thead>
              <tr className="mono border-b border-[var(--color-rule-strong)] text-left text-[11px] uppercase tracking-wider text-[var(--color-ink-soft)]">
                <th scope="col" className="px-4 py-2.5">Patient & Identity</th>
                <th scope="col" className="px-4 py-2.5">Hospital MRN</th>
                <th scope="col" className="px-4 py-2.5">Primary Clinician</th>
                <th scope="col" className="px-4 py-2.5">Department</th>
                <th scope="col" className="px-4 py-2.5">Readiness</th>
                <th scope="col" className="px-4 py-2.5">Docs</th>
                <th scope="col" className="px-4 py-2.5">Conflicts</th>
                <th scope="col" className="px-4 py-2.5">Unverified</th>
                <th scope="col" className="px-4 py-2.5">Status</th>
              </tr>
            </thead>
            <tbody>
              {data.patients.map((p) => (
                <tr
                  key={p.id}
                  className="border-b border-[var(--color-rule)] last:border-b-0 hover:bg-[var(--color-accent-soft)] transition-colors"
                >
                  <td className="px-4 py-3">
                    <Link
                      href={`/patients/${p.id}/overview`}
                      className="block hover:underline"
                    >
                      <span className="font-semibold text-[var(--color-ink)]">{p.displayName}</span>
                      {p.isDemoFixture && (
                        <span className="ml-2 mono text-[10px] uppercase px-1.5 py-0.2 bg-slate-200 text-slate-700 rounded">
                          Synthetic Demo
                        </span>
                      )}
                    </Link>
                  </td>
                  <td className="mono px-4 py-3 text-xs font-semibold text-[var(--color-ink)]">
                    {p.mrn || p.demoCode || '—'}
                  </td>
                  <td className="px-4 py-3 text-xs text-[var(--color-ink-soft)]">
                    {p.primaryClinicianName ? (
                      <span className="font-medium text-[var(--color-ink)]">{p.primaryClinicianName}</span>
                    ) : (
                      <span className="italic">Unassigned</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-[var(--color-ink-soft)]">
                    {p.departmentName || '—'}
                  </td>
                  <td className="px-4 py-3">
                    <ReadinessBand band={p.readinessBand} />
                  </td>
                  <td className="mono px-4 py-3 text-xs">{p.documentCount}</td>
                  <td
                    className="mono px-4 py-3 text-xs"
                    style={{ color: p.openConflicts > 0 ? 'var(--color-state-conflicting)' : undefined }}
                  >
                    {p.openConflicts > 0 ? p.openConflicts : '—'}
                  </td>
                  <td className="mono px-4 py-3 text-xs">{p.unverifiedFacts > 0 ? p.unverifiedFacts : '—'}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`mono text-[10px] uppercase font-semibold px-2 py-0.5 rounded ${
                        p.status === 'archived'
                          ? 'bg-rose-100 text-rose-800'
                          : 'bg-emerald-100 text-emerald-800'
                      }`}
                    >
                      {p.status || 'active'}
                    </span>
                  </td>
                </tr>
              ))}
              {data.patients.length === 0 && (
                <tr>
                  <td colSpan={9} className="mono px-4 py-12 text-center text-sm text-[var(--color-ink-soft)]">
                    No patients found matching the selected filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Bar */}
        <div className="border-t border-[var(--color-rule)] px-4 py-3 flex items-center justify-between text-xs mono text-[var(--color-ink-soft)]">
          <div>
            Showing {data.patients.length} of {data.totalCount} patient{data.totalCount === 1 ? '' : 's'}
          </div>
          {data.totalPages > 1 && (
            <div className="flex items-center gap-2">
              {pageNum > 1 && (
                <Link
                  href={`/patients?page=${pageNum - 1}&q=${encodeURIComponent(query)}&clinician=${clinicianId}&department=${departmentId}&status=${status}&sortBy=${sortBy}`}
                  className="border border-[var(--color-rule-strong)] px-2 py-1 uppercase hover:bg-[var(--color-accent-soft)]"
                >
                  ← Prev
                </Link>
              )}
              <span>Page {pageNum} of {data.totalPages}</span>
              {pageNum < data.totalPages && (
                <Link
                  href={`/patients?page=${pageNum + 1}&q=${encodeURIComponent(query)}&clinician=${clinicianId}&department=${departmentId}&status=${status}&sortBy=${sortBy}`}
                  className="border border-[var(--color-rule-strong)] px-2 py-1 uppercase hover:bg-[var(--color-accent-soft)]"
                >
                  Next →
                </Link>
              )}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
