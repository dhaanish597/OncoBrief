import { listClinicians, listDepartments } from '@oncobrief/db';
import { withSession } from '@/lib/session';
import { createClinicianAction, updateClinicianAction } from '@/lib/admin-actions';

export default async function AdminCliniciansPage() {
  const data = await withSession(async (q) => {
    const clinicians = await listClinicians(q);
    const departments = await listDepartments(q);
    return { clinicians, departments };
  });

  return (
    <div className="space-y-10">
      {/* Create New Clinician Section */}
      <section className="border border-[var(--color-rule-strong)] bg-[var(--color-paper-raised)] p-6">
        <div className="border-b border-[var(--color-rule)] pb-3">
          <h2 className="text-lg font-semibold tracking-tight">Register New Oncology Clinician</h2>
          <p className="mt-1 text-xs text-[var(--color-ink-soft)]">
            Create an oncologist profile with clinical specialty, department assignment and consultation room details.
          </p>
        </div>

        <form action={createClinicianAction} className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <label className="mono block text-[11px] uppercase tracking-wider text-[var(--color-ink-soft)]" htmlFor="clinician-name">
              Full Clinician Name *
            </label>
            <input
              id="clinician-name"
              name="displayName"
              type="text"
              required
              placeholder="e.g. Dr. Rajesh Sharma"
              className="mt-1 w-full border border-[var(--color-rule-strong)] bg-[var(--color-paper)] px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]"
            />
          </div>

          <div>
            <label className="mono block text-[11px] uppercase tracking-wider text-[var(--color-ink-soft)]" htmlFor="clinician-email">
              Hospital Email *
            </label>
            <input
              id="clinician-email"
              name="email"
              type="email"
              required
              placeholder="e.g. dr.sharma@hospital.example"
              className="mt-1 w-full border border-[var(--color-rule-strong)] bg-[var(--color-paper)] px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]"
            />
          </div>

          <div>
            <label className="mono block text-[11px] uppercase tracking-wider text-[var(--color-ink-soft)]" htmlFor="clinician-specialty">
              Oncology Specialty *
            </label>
            <select
              id="clinician-specialty"
              name="specialty"
              required
              defaultValue="Medical Oncology"
              className="mt-1 w-full border border-[var(--color-rule-strong)] bg-[var(--color-paper)] px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]"
            >
              <option value="Medical Oncology">Medical Oncology</option>
              <option value="Surgical Oncology">Surgical Oncology</option>
              <option value="Radiation Oncology">Radiation Oncology</option>
              <option value="Gynecologic Oncology">Gynecologic Oncology</option>
              <option value="Hematologic Oncology">Hematologic Oncology</option>
              <option value="Pediatric Oncology">Pediatric Oncology</option>
              <option value="Palliative Oncology">Palliative Care</option>
            </select>
          </div>

          <div>
            <label className="mono block text-[11px] uppercase tracking-wider text-[var(--color-ink-soft)]" htmlFor="clinician-subspecialty">
              Sub-specialty / Focus Area
            </label>
            <input
              id="clinician-subspecialty"
              name="subSpecialty"
              type="text"
              placeholder="e.g. Breast Oncology, GI Cancers"
              className="mt-1 w-full border border-[var(--color-rule-strong)] bg-[var(--color-paper)] px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]"
            />
          </div>

          <div>
            <label className="mono block text-[11px] uppercase tracking-wider text-[var(--color-ink-soft)]" htmlFor="clinician-department">
              Department
            </label>
            <select
              id="clinician-department"
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
            <label className="mono block text-[11px] uppercase tracking-wider text-[var(--color-ink-soft)]" htmlFor="clinician-room">
              Consultation Room / Clinic
            </label>
            <input
              id="clinician-room"
              name="consultationRoom"
              type="text"
              placeholder="e.g. Room 102, OPD Wing A"
              className="mt-1 w-full border border-[var(--color-rule-strong)] bg-[var(--color-paper)] px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]"
            />
          </div>

          <div>
            <label className="mono block text-[11px] uppercase tracking-wider text-[var(--color-ink-soft)]" htmlFor="clinician-license">
              Medical License Number
            </label>
            <input
              id="clinician-license"
              name="licenseNumber"
              type="text"
              placeholder="e.g. MCI-2018-8849"
              className="mt-1 w-full border border-[var(--color-rule-strong)] bg-[var(--color-paper)] px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]"
            />
          </div>

          <div>
            <label className="mono block text-[11px] uppercase tracking-wider text-[var(--color-ink-soft)]" htmlFor="clinician-password">
              Temporary Password
            </label>
            <input
              id="clinician-password"
              name="password"
              type="password"
              defaultValue="oncobrief-clinician"
              className="mt-1 w-full border border-[var(--color-rule-strong)] bg-[var(--color-paper)] px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]"
            />
          </div>

          <div className="flex items-end">
            <button
              type="submit"
              className="mono w-full border border-[var(--color-rule-strong)] bg-[var(--color-accent)] px-4 py-2 text-xs uppercase tracking-wider text-white font-medium hover:opacity-90"
            >
              Provision Clinician Account
            </button>
          </div>
        </form>
      </section>

      {/* Clinicians List Section */}
      <section className="border border-[var(--color-rule-strong)] bg-[var(--color-paper-raised)] p-6">
        <div className="border-b border-[var(--color-rule)] pb-3 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">Active Oncology Clinicians</h2>
            <p className="mt-1 text-xs text-[var(--color-ink-soft)]">
              {data.clinicians.length} clinician profiles registered in this hospital.
            </p>
          </div>
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-sm border-collapse min-w-[750px]">
            <thead>
              <tr className="mono text-[11px] uppercase tracking-wider text-[var(--color-ink-soft)] border-b border-[var(--color-rule)]">
                <th className="py-2.5 px-3">Clinician</th>
                <th className="py-2.5 px-3">Specialty</th>
                <th className="py-2.5 px-3">Department</th>
                <th className="py-2.5 px-3">Room / Clinic</th>
                <th className="py-2.5 px-3">License No.</th>
                <th className="py-2.5 px-3">Active Patients</th>
                <th className="py-2.5 px-3">Quick Edit</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-rule)]">
              {data.clinicians.map((c) => (
                <tr key={c.id} className="hover:bg-[var(--color-accent-soft)]">
                  <td className="py-2.5 px-3">
                    <p className="font-medium text-xs text-[var(--color-ink)]">{c.displayName}</p>
                    <p className="mono text-[11px] text-[var(--color-ink-soft)]">{c.email}</p>
                  </td>
                  <td className="py-2.5 px-3 text-xs">
                    <span className="font-medium">{c.specialty}</span>
                    {c.subSpecialty ? <span className="block text-[11px] text-[var(--color-ink-soft)]">{c.subSpecialty}</span> : null}
                  </td>
                  <td className="py-2.5 px-3 text-xs text-[var(--color-ink-soft)]">{c.departmentName || '—'}</td>
                  <td className="py-2.5 px-3 text-xs">{c.consultationRoom || '—'}</td>
                  <td className="mono py-2.5 px-3 text-xs text-[var(--color-ink-soft)]">{c.licenseNumber || '—'}</td>
                  <td className="mono py-2.5 px-3 text-xs font-semibold">{c.assignedPatientCount}</td>
                  <td className="py-2.5 px-3">
                    <form action={updateClinicianAction} className="flex items-center gap-1.5">
                      <input type="hidden" name="clinicianProfileId" value={c.id} />
                      <input
                        type="text"
                        name="consultationRoom"
                        defaultValue={c.consultationRoom || ''}
                        placeholder="Room"
                        className="mono text-xs border border-[var(--color-rule)] bg-[var(--color-paper)] px-2 py-1 w-20"
                      />
                      <button
                        type="submit"
                        className="mono border border-[var(--color-rule-strong)] px-2 py-1 text-[10px] uppercase hover:bg-[var(--color-accent-soft)]"
                      >
                        Update
                      </button>
                    </form>
                  </td>
                </tr>
              ))}
              {data.clinicians.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-sm text-[var(--color-ink-soft)]">
                    No clinician profiles configured. Use the form above to add an oncologist.
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
