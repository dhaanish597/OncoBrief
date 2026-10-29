import Link from 'next/link';
import { notFound } from 'next/navigation';
import { can } from '@oncobrief/domain';
import { getPatient, listClinicians, listDepartments, listFacilities } from '@oncobrief/db';
import { requireSession, withSession } from '@/lib/session';
import {
  updatePatientAction,
  archivePatientAction,
  reactivatePatientAction,
} from '@/lib/patient-actions';

export default async function EditPatientPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await requireSession();

  const data = await withSession(async (q) => {
    const patient = await getPatient(q, id);
    if (!patient) return null;
    const clinicians = await listClinicians(q);
    const departments = await listDepartments(q);
    const facilities = await listFacilities(q);
    return { patient, clinicians, departments, facilities };
  });

  if (!data) notFound();
  const { patient, clinicians, departments, facilities } = data;

  const canUpdate = can(session.role, 'patient:update');
  const canArchive = can(session.role, 'patient:archive');

  return (
    <div className="space-y-10 max-w-4xl">
      <div className="border-b border-[var(--color-rule-strong)] pb-4 flex items-center justify-between">
        <div>
          <span className="mono text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--color-accent)]">
            Patient Governance
          </span>
          <h2 className="mt-1 text-2xl font-semibold tracking-tight">Edit Demographic & Administrative Details</h2>
          <p className="mt-1 text-sm text-[var(--color-ink-soft)]">
            Updating {patient.displayName} (MRN: {patient.mrn || patient.demoCode || id.slice(0, 8)})
          </p>
        </div>
        <Link
          href={`/patients/${id}/overview`}
          className="mono text-xs uppercase tracking-wider text-[var(--color-ink-soft)] hover:underline"
        >
          ← Patient Overview
        </Link>
      </div>

      {/* Edit Form */}
      <form action={updatePatientAction} className="space-y-6">
        <input type="hidden" name="patientId" value={id} />

        <div className="border border-[var(--color-rule-strong)] bg-[var(--color-paper-raised)] p-6 space-y-4">
          <h3 className="mono text-xs font-semibold uppercase tracking-wider text-[var(--color-ink)] border-b border-[var(--color-rule)] pb-2">
            Demographic Information
          </h3>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="edit-name" className="mono block text-[11px] uppercase tracking-wider text-[var(--color-ink-soft)]">
                Full Patient Name *
              </label>
              <input
                id="edit-name"
                name="displayName"
                type="text"
                required
                defaultValue={patient.displayName}
                className="mt-1 w-full border border-[var(--color-rule-strong)] bg-[var(--color-paper)] px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]"
              />
            </div>

            <div>
              <label htmlFor="edit-dob" className="mono block text-[11px] uppercase tracking-wider text-[var(--color-ink-soft)]">
                Date of Birth
              </label>
              <input
                id="edit-dob"
                name="dob"
                type="date"
                defaultValue={patient.dob || ''}
                className="mt-1 w-full border border-[var(--color-rule-strong)] bg-[var(--color-paper)] px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]"
              />
            </div>

            <div>
              <label htmlFor="edit-gender" className="mono block text-[11px] uppercase tracking-wider text-[var(--color-ink-soft)]">
                Gender
              </label>
              <select
                id="edit-gender"
                name="gender"
                defaultValue={patient.gender || ''}
                className="mt-1 w-full border border-[var(--color-rule-strong)] bg-[var(--color-paper)] px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]"
              >
                <option value="">Unspecified</option>
                <option value="female">Female</option>
                <option value="male">Male</option>
                <option value="other">Other</option>
              </select>
            </div>

            <div>
              <label htmlFor="edit-phone" className="mono block text-[11px] uppercase tracking-wider text-[var(--color-ink-soft)]">
                Phone Number
              </label>
              <input
                id="edit-phone"
                name="phone"
                type="tel"
                defaultValue={patient.phone || ''}
                className="mt-1 w-full border border-[var(--color-rule-strong)] bg-[var(--color-paper)] px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]"
              />
            </div>

            <div>
              <label htmlFor="edit-email" className="mono block text-[11px] uppercase tracking-wider text-[var(--color-ink-soft)]">
                Email Address
              </label>
              <input
                id="edit-email"
                name="email"
                type="email"
                defaultValue={patient.email || ''}
                className="mt-1 w-full border border-[var(--color-rule-strong)] bg-[var(--color-paper)] px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]"
              />
            </div>

            <div>
              <label htmlFor="edit-lang" className="mono block text-[11px] uppercase tracking-wider text-[var(--color-ink-soft)]">
                Primary Language
              </label>
              <select
                id="edit-lang"
                name="primaryLanguage"
                defaultValue={patient.primaryLanguage || 'en-IN'}
                className="mt-1 w-full border border-[var(--color-rule-strong)] bg-[var(--color-paper)] px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]"
              >
                <option value="en-IN">English (India)</option>
                <option value="hi-IN">Hindi (हिन्दी)</option>
                <option value="ta-IN">Tamil (தமிழ்)</option>
                <option value="te-IN">Telugu (తెలుగు)</option>
                <option value="kn-IN">Kannada (ಕನ್ನಡ)</option>
                <option value="mr-IN">Marathi (मराठी)</option>
                <option value="bn-IN">Bengali (বাংলা)</option>
              </select>
            </div>

            <div className="sm:col-span-2">
              <label htmlFor="edit-address" className="mono block text-[11px] uppercase tracking-wider text-[var(--color-ink-soft)]">
                Address
              </label>
              <input
                id="edit-address"
                name="address"
                type="text"
                defaultValue={patient.address || ''}
                className="mt-1 w-full border border-[var(--color-rule-strong)] bg-[var(--color-paper)] px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]"
              />
            </div>
          </div>
        </div>

        {/* Operational Assignments */}
        <div className="border border-[var(--color-rule-strong)] bg-[var(--color-paper-raised)] p-6 space-y-4">
          <h3 className="mono text-xs font-semibold uppercase tracking-wider text-[var(--color-ink)] border-b border-[var(--color-rule)] pb-2">
            Clinical Care Team & Location Assignment
          </h3>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="edit-clinician" className="mono block text-[11px] uppercase tracking-wider text-[var(--color-ink-soft)]">
                Primary Oncologist
              </label>
              <select
                id="edit-clinician"
                name="primaryClinicianId"
                defaultValue={patient.primaryClinicianId || ''}
                className="mt-1 w-full border border-[var(--color-rule-strong)] bg-[var(--color-paper)] px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]"
              >
                <option value="">Unassigned</option>
                {clinicians.map((c) => (
                  <option key={c.userId} value={c.userId}>
                    {c.displayName} — {c.specialty}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="edit-dept" className="mono block text-[11px] uppercase tracking-wider text-[var(--color-ink-soft)]">
                Department
              </label>
              <select
                id="edit-dept"
                name="departmentId"
                defaultValue={patient.departmentId || ''}
                className="mt-1 w-full border border-[var(--color-rule-strong)] bg-[var(--color-paper)] px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]"
              >
                <option value="">Unassigned</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name} ({d.code})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="edit-facility" className="mono block text-[11px] uppercase tracking-wider text-[var(--color-ink-soft)]">
                Facility Site
              </label>
              <select
                id="edit-facility"
                name="facilityId"
                defaultValue={patient.facilityId || ''}
                className="mt-1 w-full border border-[var(--color-rule-strong)] bg-[var(--color-paper)] px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]"
              >
                <option value="">Main Campus</option>
                {facilities.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name} ({f.code})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="edit-ref-source" className="mono block text-[11px] uppercase tracking-wider text-[var(--color-ink-soft)]">
                Referral Source
              </label>
              <input
                id="edit-ref-source"
                name="referralSource"
                type="text"
                defaultValue={patient.referralSource || ''}
                className="mt-1 w-full border border-[var(--color-rule-strong)] bg-[var(--color-paper)] px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]"
              />
            </div>
          </div>
        </div>

        {canUpdate && (
          <div className="flex justify-end">
            <button
              type="submit"
              className="mono border border-[var(--color-rule-strong)] bg-[var(--color-accent)] px-6 py-2.5 text-xs uppercase tracking-wider text-white font-medium hover:opacity-90 transition-opacity"
            >
              Save Demographic Changes
            </button>
          </div>
        )}
      </form>

      {/* Archival / Reactivation Section */}
      {canArchive && (
        <div className="border border-rose-300 bg-rose-50/50 p-6 space-y-4">
          <h3 className="mono text-xs font-semibold uppercase tracking-wider text-rose-900 border-b border-rose-200 pb-2">
            Record Archival & Lifecycle
          </h3>
          <p className="text-xs text-rose-800 leading-relaxed">
            Archiving soft-deactivates the patient from active daily consultation worklists while preserving all historical documents, Evidence Ledger entries, hash-chained audit events, and consultation packets. Medical records are never destroyed.
          </p>

          {patient.status === 'archived' ? (
            <div className="space-y-3">
              <div className="text-xs text-rose-900">
                <span className="font-semibold">Archived:</span> {patient.archivalReason || 'No reason specified'}
              </div>
              <form action={reactivatePatientAction}>
                <input type="hidden" name="patientId" value={id} />
                <button
                  type="submit"
                  className="mono border border-emerald-600 bg-emerald-600 px-4 py-2 text-xs uppercase tracking-wider text-white font-medium hover:opacity-90"
                >
                  Reactivate Patient Record
                </button>
              </form>
            </div>
          ) : (
            <form action={archivePatientAction} className="space-y-3">
              <input type="hidden" name="patientId" value={id} />
              <div>
                <label htmlFor="archive-reason" className="mono block text-[11px] uppercase tracking-wider text-rose-900">
                  Mandatory Archival Reason *
                </label>
                <input
                  id="archive-reason"
                  name="reason"
                  type="text"
                  required
                  placeholder="e.g. Treatment completed / Transferred to external cancer centre"
                  className="mt-1 w-full border border-rose-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-rose-500"
                />
              </div>
              <button
                type="submit"
                className="mono border border-rose-600 bg-rose-600 px-4 py-2 text-xs uppercase tracking-wider text-white font-medium hover:opacity-90"
              >
                Archive Patient Record
              </button>
            </form>
          )}
        </div>
      )}
    </div>
  );
}
