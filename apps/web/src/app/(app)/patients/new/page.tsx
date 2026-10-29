import Link from 'next/link';
import { forbidden } from 'next/navigation';
import { can } from '@oncobrief/domain';
import { listClinicians, listDepartments, listFacilities } from '@oncobrief/db';
import { requireSession, withSession } from '@/lib/session';
import { registerPatientAction } from '@/lib/patient-actions';

export default async function NewPatientPage() {
  const session = await requireSession();
  if (!can(session.role, 'patient:create')) {
    forbidden();
  }

  const { clinicians, departments, facilities } = await withSession(async (q) => ({
    clinicians: await listClinicians(q),
    departments: await listDepartments(q),
    facilities: await listFacilities(q),
  }));

  return (
    <main className="mx-auto max-w-4xl px-4 py-6 sm:px-6 sm:py-10">
      <div className="flex items-center justify-between border-b border-[var(--color-rule-strong)] pb-4">
        <div>
          <span className="mono text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--color-accent)]">
            Patient Intake
          </span>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">Register New Oncology Patient</h1>
          <p className="mt-1 text-sm text-[var(--color-ink-soft)]">
            Create an authoritative hospital patient record with validated demographics and care-team assignments.
          </p>
        </div>
        <Link
          href="/patients"
          className="mono text-xs uppercase tracking-wider text-[var(--color-ink-soft)] hover:underline"
        >
          ← Patient Index
        </Link>
      </div>

      <div className="mt-6 rounded border border-blue-200 bg-blue-50 p-4 text-xs text-blue-900 leading-relaxed">
        <strong>Strict Clinical Boundary:</strong> Patient registration captures administrative demographics and contact info only.
        Do not enter or fabricate cancer diagnosis, TNM staging, or treatment regimens here. Clinical facts must emerge with full provenance from uploaded medical source documents.
      </div>

      <form action={registerPatientAction} className="mt-6 space-y-8">
        {/* Core Identity */}
        <section className="border border-[var(--color-rule-strong)] bg-[var(--color-paper-raised)] p-6 space-y-4">
          <h2 className="mono text-xs font-semibold uppercase tracking-wider text-[var(--color-ink)] border-b border-[var(--color-rule)] pb-2">
            1. Core Identity & Hospital Identifiers
          </h2>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="reg-name" className="mono block text-[11px] uppercase tracking-wider text-[var(--color-ink-soft)]">
                Full Patient Name *
              </label>
              <input
                id="reg-name"
                name="displayName"
                type="text"
                required
                placeholder="e.g. Ramesh Kumar Patel"
                className="mt-1 w-full border border-[var(--color-rule-strong)] bg-[var(--color-paper)] px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]"
              />
            </div>

            <div>
              <label htmlFor="reg-mrn" className="mono block text-[11px] uppercase tracking-wider text-[var(--color-ink-soft)]">
                Hospital MRN / Registration Number *
              </label>
              <input
                id="reg-mrn"
                name="mrn"
                type="text"
                required
                placeholder="e.g. MRN-2026-9042"
                className="mt-1 w-full border border-[var(--color-rule-strong)] bg-[var(--color-paper)] px-3 py-2 text-sm uppercase focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]"
              />
              <span className="mono mt-1 block text-[10px] text-[var(--color-ink-soft)]">
                Must be unique within this hospital organization.
              </span>
            </div>

            <div>
              <label htmlFor="reg-dob" className="mono block text-[11px] uppercase tracking-wider text-[var(--color-ink-soft)]">
                Date of Birth
              </label>
              <input
                id="reg-dob"
                name="dob"
                type="date"
                className="mt-1 w-full border border-[var(--color-rule-strong)] bg-[var(--color-paper)] px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]"
              />
            </div>

            <div>
              <label htmlFor="reg-gender" className="mono block text-[11px] uppercase tracking-wider text-[var(--color-ink-soft)]">
                Documented Sex / Gender
              </label>
              <select
                id="reg-gender"
                name="gender"
                defaultValue=""
                className="mt-1 w-full border border-[var(--color-rule-strong)] bg-[var(--color-paper)] px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]"
              >
                <option value="">Unspecified / Unknown</option>
                <option value="female">Female</option>
                <option value="male">Male</option>
                <option value="other">Other</option>
              </select>
            </div>
          </div>
        </section>

        {/* Contact & Language */}
        <section className="border border-[var(--color-rule-strong)] bg-[var(--color-paper-raised)] p-6 space-y-4">
          <h2 className="mono text-xs font-semibold uppercase tracking-wider text-[var(--color-ink)] border-b border-[var(--color-rule)] pb-2">
            2. Contact Coordinates & Communication Preferences
          </h2>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="reg-phone" className="mono block text-[11px] uppercase tracking-wider text-[var(--color-ink-soft)]">
                Contact Phone Number
              </label>
              <input
                id="reg-phone"
                name="phone"
                type="tel"
                placeholder="e.g. +91 98765 43210"
                className="mt-1 w-full border border-[var(--color-rule-strong)] bg-[var(--color-paper)] px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]"
              />
            </div>

            <div>
              <label htmlFor="reg-email" className="mono block text-[11px] uppercase tracking-wider text-[var(--color-ink-soft)]">
                Patient / Caregiver Email
              </label>
              <input
                id="reg-email"
                name="email"
                type="email"
                placeholder="e.g. patient@example.com"
                className="mt-1 w-full border border-[var(--color-rule-strong)] bg-[var(--color-paper)] px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]"
              />
            </div>

            <div>
              <label htmlFor="reg-lang" className="mono block text-[11px] uppercase tracking-wider text-[var(--color-ink-soft)]">
                Preferred Language
              </label>
              <select
                id="reg-lang"
                name="primaryLanguage"
                defaultValue="en-IN"
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

            <div>
              <label htmlFor="reg-address" className="mono block text-[11px] uppercase tracking-wider text-[var(--color-ink-soft)]">
                Residential Address / District
              </label>
              <input
                id="reg-address"
                name="address"
                type="text"
                placeholder="e.g. 14 Gandhi Road, Bangalore, Karnataka"
                className="mt-1 w-full border border-[var(--color-rule-strong)] bg-[var(--color-paper)] px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]"
              />
            </div>
          </div>
        </section>

        {/* Clinical Care Team & Referral Assignments */}
        <section className="border border-[var(--color-rule-strong)] bg-[var(--color-paper-raised)] p-6 space-y-4">
          <h2 className="mono text-xs font-semibold uppercase tracking-wider text-[var(--color-ink)] border-b border-[var(--color-rule)] pb-2">
            3. Operational Referral & Care Team Assignment
          </h2>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="reg-clinician" className="mono block text-[11px] uppercase tracking-wider text-[var(--color-ink-soft)]">
                Primary Oncologist / Attending Clinician
              </label>
              <select
                id="reg-clinician"
                name="primaryClinicianId"
                defaultValue=""
                className="mt-1 w-full border border-[var(--color-rule-strong)] bg-[var(--color-paper)] px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]"
              >
                <option value="">Unassigned (Assign Later)</option>
                {clinicians.map((c) => (
                  <option key={c.userId} value={c.userId}>
                    {c.displayName} — {c.specialty}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="reg-dept" className="mono block text-[11px] uppercase tracking-wider text-[var(--color-ink-soft)]">
                Assigned Department / Service Line
              </label>
              <select
                id="reg-dept"
                name="departmentId"
                defaultValue=""
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
              <label htmlFor="reg-facility" className="mono block text-[11px] uppercase tracking-wider text-[var(--color-ink-soft)]">
                Hospital Site / Facility
              </label>
              <select
                id="reg-facility"
                name="facilityId"
                defaultValue=""
                className="mt-1 w-full border border-[var(--color-rule-strong)] bg-[var(--color-paper)] px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]"
              >
                <option value="">Main Hospital Campus</option>
                {facilities.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name} ({f.code})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="reg-referral" className="mono block text-[11px] uppercase tracking-wider text-[var(--color-ink-soft)]">
                Administrative Referral Source
              </label>
              <input
                id="reg-referral"
                name="referralSource"
                type="text"
                placeholder="e.g. District Hospital, Walk-in, Direct Specialist Referral"
                className="mt-1 w-full border border-[var(--color-rule-strong)] bg-[var(--color-paper)] px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]"
              />
            </div>

            <div className="sm:col-span-2">
              <label htmlFor="reg-notes" className="mono block text-[11px] uppercase tracking-wider text-[var(--color-ink-soft)]">
                Administrative Intake Notes (Non-Diagnostic)
              </label>
              <textarea
                id="reg-notes"
                name="referralNotes"
                rows={2}
                placeholder="Operational notes regarding records transfer, prior hospital files, or scheduling constraints..."
                className="mt-1 w-full border border-[var(--color-rule-strong)] bg-[var(--color-paper)] px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]"
              />
            </div>
          </div>
        </section>

        <div className="flex items-center justify-end gap-4 pt-4">
          <Link
            href="/patients"
            className="mono border border-[var(--color-rule-strong)] px-4 py-2 text-xs uppercase tracking-wider hover:bg-[var(--color-accent-soft)]"
          >
            Cancel
          </Link>
          <button
            type="submit"
            className="mono border border-[var(--color-rule-strong)] bg-[var(--color-accent)] px-6 py-2.5 text-xs uppercase tracking-wider text-white font-medium hover:opacity-90 transition-opacity"
          >
            Register Patient & Initialize Workspace →
          </button>
        </div>
      </form>
    </main>
  );
}
