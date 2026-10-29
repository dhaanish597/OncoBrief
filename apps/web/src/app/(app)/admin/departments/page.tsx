import { listDepartments, listFacilities } from '@oncobrief/db';
import { withSession } from '@/lib/session';
import { createDepartmentAction, createFacilityAction } from '@/lib/admin-actions';

export default async function AdminDepartmentsPage() {
  const data = await withSession(async (q) => {
    const departments = await listDepartments(q);
    const facilities = await listFacilities(q);
    return { departments, facilities };
  });

  return (
    <div className="space-y-10">
      {/* Facilities & Physical Sites */}
      <section className="border border-[var(--color-rule-strong)] bg-[var(--color-paper-raised)] p-6">
        <div className="border-b border-[var(--color-rule)] pb-3 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">Hospital Facilities & Sites</h2>
            <p className="mt-1 text-xs text-[var(--color-ink-soft)]">
              Physical hospital locations, cancer centres, and ambulatory wings.
            </p>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* Create Facility Form */}
          <div className="border border-[var(--color-rule)] bg-[var(--color-paper)] p-4">
            <h3 className="text-sm font-semibold uppercase tracking-wider mono text-[var(--color-ink)]">
              + Add Facility Site
            </h3>
            <form action={createFacilityAction} className="mt-4 space-y-3">
              <div>
                <label className="mono block text-[11px] uppercase tracking-wider text-[var(--color-ink-soft)]" htmlFor="fac-name">
                  Facility Name *
                </label>
                <input
                  id="fac-name"
                  name="name"
                  type="text"
                  required
                  placeholder="e.g. Main Oncology Pavilion"
                  className="mt-1 w-full border border-[var(--color-rule-strong)] bg-[var(--color-paper-raised)] px-2.5 py-1.5 text-xs"
                />
              </div>
              <div>
                <label className="mono block text-[11px] uppercase tracking-wider text-[var(--color-ink-soft)]" htmlFor="fac-code">
                  Facility Code *
                </label>
                <input
                  id="fac-code"
                  name="code"
                  type="text"
                  required
                  placeholder="e.g. MOP-01"
                  className="mt-1 w-full border border-[var(--color-rule-strong)] bg-[var(--color-paper-raised)] px-2.5 py-1.5 text-xs uppercase"
                />
              </div>
              <div>
                <label className="mono block text-[11px] uppercase tracking-wider text-[var(--color-ink-soft)]" htmlFor="fac-address">
                  Physical Address
                </label>
                <input
                  id="fac-address"
                  name="address"
                  type="text"
                  placeholder="e.g. Wing B, Cancer Block, Medical Enclave"
                  className="mt-1 w-full border border-[var(--color-rule-strong)] bg-[var(--color-paper-raised)] px-2.5 py-1.5 text-xs"
                />
              </div>
              <button
                type="submit"
                className="mono w-full border border-[var(--color-rule-strong)] bg-[var(--color-accent)] px-3 py-1.5 text-xs uppercase tracking-wider text-white font-medium hover:opacity-90"
              >
                Create Facility
              </button>
            </form>
          </div>

          {/* Facility Table */}
          <div className="lg:col-span-2 overflow-x-auto">
            <table className="w-full text-left text-sm border-collapse">
              <thead>
                <tr className="mono text-[11px] uppercase tracking-wider text-[var(--color-ink-soft)] border-b border-[var(--color-rule)]">
                  <th className="py-2 px-3">Code</th>
                  <th className="py-2 px-3">Facility Name</th>
                  <th className="py-2 px-3">Address</th>
                  <th className="py-2 px-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-rule)]">
                {data.facilities.map((f) => (
                  <tr key={f.id} className="hover:bg-[var(--color-accent-soft)]">
                    <td className="mono py-2.5 px-3 text-xs font-semibold">{f.code}</td>
                    <td className="py-2.5 px-3 font-medium text-xs">{f.name}</td>
                    <td className="py-2.5 px-3 text-xs text-[var(--color-ink-soft)]">{f.address || '—'}</td>
                    <td className="py-2.5 px-3">
                      <span className="mono text-[10px] uppercase font-semibold px-2 py-0.5 rounded bg-emerald-100 text-emerald-800">
                        {f.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                  </tr>
                ))}
                {data.facilities.length === 0 && (
                  <tr>
                    <td colSpan={4} className="py-6 text-center text-xs text-[var(--color-ink-soft)]">
                      No physical facility sites registered yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* Departments & Service Lines */}
      <section className="border border-[var(--color-rule-strong)] bg-[var(--color-paper-raised)] p-6">
        <div className="border-b border-[var(--color-rule)] pb-3 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">Clinical Departments & Cancer Service Lines</h2>
            <p className="mt-1 text-xs text-[var(--color-ink-soft)]">
              Specialties, outpatient clinics, diagnostics, and patient care units.
            </p>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* Create Department Form */}
          <div className="border border-[var(--color-rule)] bg-[var(--color-paper)] p-4">
            <h3 className="text-sm font-semibold uppercase tracking-wider mono text-[var(--color-ink)]">
              + Add Department
            </h3>
            <form action={createDepartmentAction} className="mt-4 space-y-3">
              <div>
                <label className="mono block text-[11px] uppercase tracking-wider text-[var(--color-ink-soft)]" htmlFor="dept-name">
                  Department Name *
                </label>
                <input
                  id="dept-name"
                  name="name"
                  type="text"
                  required
                  placeholder="e.g. Department of Radiation Oncology"
                  className="mt-1 w-full border border-[var(--color-rule-strong)] bg-[var(--color-paper-raised)] px-2.5 py-1.5 text-xs"
                />
              </div>
              <div>
                <label className="mono block text-[11px] uppercase tracking-wider text-[var(--color-ink-soft)]" htmlFor="dept-code">
                  Code *
                </label>
                <input
                  id="dept-code"
                  name="code"
                  type="text"
                  required
                  placeholder="e.g. RAD-ONC"
                  className="mt-1 w-full border border-[var(--color-rule-strong)] bg-[var(--color-paper-raised)] px-2.5 py-1.5 text-xs uppercase"
                />
              </div>
              <div>
                <label className="mono block text-[11px] uppercase tracking-wider text-[var(--color-ink-soft)]" htmlFor="dept-specialty">
                  Specialty Line
                </label>
                <input
                  id="dept-specialty"
                  name="specialty"
                  type="text"
                  placeholder="e.g. Radiation Oncology"
                  className="mt-1 w-full border border-[var(--color-rule-strong)] bg-[var(--color-paper-raised)] px-2.5 py-1.5 text-xs"
                />
              </div>
              <div>
                <label className="mono block text-[11px] uppercase tracking-wider text-[var(--color-ink-soft)]" htmlFor="dept-facility">
                  Facility Site
                </label>
                <select
                  id="dept-facility"
                  name="facilityId"
                  defaultValue=""
                  className="mt-1 w-full border border-[var(--color-rule-strong)] bg-[var(--color-paper-raised)] px-2.5 py-1.5 text-xs"
                >
                  <option value="">None / Main Campus</option>
                  {data.facilities.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name} ({f.code})
                    </option>
                  ))}
                </select>
              </div>
              <button
                type="submit"
                className="mono w-full border border-[var(--color-rule-strong)] bg-[var(--color-accent)] px-3 py-1.5 text-xs uppercase tracking-wider text-white font-medium hover:opacity-90"
              >
                Create Department
              </button>
            </form>
          </div>

          {/* Department Table */}
          <div className="lg:col-span-2 overflow-x-auto">
            <table className="w-full text-left text-sm border-collapse">
              <thead>
                <tr className="mono text-[11px] uppercase tracking-wider text-[var(--color-ink-soft)] border-b border-[var(--color-rule)]">
                  <th className="py-2 px-3">Code</th>
                  <th className="py-2 px-3">Department</th>
                  <th className="py-2 px-3">Specialty</th>
                  <th className="py-2 px-3">Facility</th>
                  <th className="py-2 px-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-rule)]">
                {data.departments.map((d) => (
                  <tr key={d.id} className="hover:bg-[var(--color-accent-soft)]">
                    <td className="mono py-2.5 px-3 text-xs font-semibold">{d.code}</td>
                    <td className="py-2.5 px-3 font-medium text-xs">{d.name}</td>
                    <td className="py-2.5 px-3 text-xs text-[var(--color-ink-soft)]">{d.specialty || '—'}</td>
                    <td className="py-2.5 px-3 text-xs text-[var(--color-ink-soft)]">{d.facilityName || 'Main Campus'}</td>
                    <td className="py-2.5 px-3">
                      <span className="mono text-[10px] uppercase font-semibold px-2 py-0.5 rounded bg-emerald-100 text-emerald-800">
                        {d.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                  </tr>
                ))}
                {data.departments.length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-6 text-center text-xs text-[var(--color-ink-soft)]">
                      No departments registered yet. Use the form to configure hospital departments.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
  );
}
