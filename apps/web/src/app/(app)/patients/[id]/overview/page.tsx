import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  getPatient,
  listCareTeam,
  listRecordMap,
  listTasks,
  listDocuments,
  getTimeline,
  listAppointments,
  listEncounters,
} from '@oncobrief/db';
import { withSession } from '@/lib/session';
import { ReadinessBand } from '@/components/evidence';

export default async function PatientOverviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const data = await withSession(async (q, s) => {
    const patient = await getPatient(q, id);
    if (!patient) return null;
    const careTeam = await listCareTeam(q, id);
    const recordMap = await listRecordMap(q, id);
    const tasks = await listTasks(q, id);
    const documents = await listDocuments(q, id);
    const timeline = await getTimeline(q, id);
    const appointments = await listAppointments(q, s.orgId, { patientId: id, limit: 5 });
    const encounters = await listEncounters(q, s.orgId, id);
    return { patient, careTeam, recordMap, tasks, documents, timeline, appointments, encounters };
  });

  if (!data) notFound();
  const { patient, careTeam, recordMap, tasks, documents, timeline, appointments, encounters } = data;

  const openTasks = tasks.filter((t) => !['done', 'cancelled'].includes(t.status));
  const recentTimeline = timeline.slice(-6).reverse();
  const verifiedCount = timeline.filter((t) => t.state === 'verified').length;
  const unverifiedCount = timeline.filter((t) => t.state === 'extracted').length;
  const conflictCount = timeline.filter((t) => t.state === 'conflicting').length;

  return (
    <div className="space-y-8">
      {/* Top Identity & Action Header */}
      <div className="border border-[var(--color-rule-strong)] bg-[var(--color-paper-raised)] p-6">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[var(--color-rule)] pb-5">
          <div>
            <div className="flex items-center gap-3">
              <h2 className="text-2xl font-bold tracking-tight text-[var(--color-ink)]">
                {patient.displayName}
              </h2>
              <span
                className={`mono text-[10px] uppercase font-semibold px-2 py-0.5 rounded ${
                  patient.status === 'archived'
                    ? 'bg-rose-100 text-rose-800'
                    : 'bg-emerald-100 text-emerald-800'
                }`}
              >
                {patient.status || 'active'}
              </span>
              {patient.isDemoFixture && (
                <span className="mono text-[10px] uppercase px-1.5 py-0.5 bg-slate-200 text-slate-700 rounded font-medium">
                  Synthetic Demo Record
                </span>
              )}
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs mono text-[var(--color-ink-soft)]">
              <span><strong>MRN:</strong> {patient.mrn || patient.demoCode || '—'}</span>
              <span><strong>DOB:</strong> {patient.dob || '—'}</span>
              <span><strong>Gender:</strong> {patient.gender || '—'}</span>
              <span><strong>Language:</strong> {patient.primaryLanguage}</span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={`/appointments/new?patientId=${id}`}
              className="mono border border-[var(--color-ink)] bg-[var(--color-ink)] px-3.5 py-2 text-xs uppercase tracking-wider text-white font-medium hover:bg-black"
            >
              + Book Appointment
            </Link>
            <Link
              href={`/patients/${id}/sources`}
              className="mono border border-[var(--color-rule-strong)] bg-[var(--color-accent)] px-3.5 py-2 text-xs uppercase tracking-wider text-white font-medium hover:opacity-90"
            >
              + Upload Document
            </Link>
            <Link
              href={`/patients/${id}/encounters`}
              className="mono border border-[var(--color-rule-strong)] bg-[var(--color-paper)] px-3.5 py-2 text-xs uppercase tracking-wider hover:bg-[var(--color-accent-soft)]"
            >
              Encounters
            </Link>
            <Link
              href={`/patients/${id}/evidence`}
              className="mono border border-[var(--color-rule-strong)] bg-[var(--color-paper)] px-3.5 py-2 text-xs uppercase tracking-wider hover:bg-[var(--color-accent-soft)]"
            >
              Review Evidence
            </Link>
            <Link
              href={`/patients/${id}/edit`}
              className="mono border border-[var(--color-rule-strong)] bg-[var(--color-paper)] px-3.5 py-2 text-xs uppercase tracking-wider hover:bg-[var(--color-accent-soft)]"
            >
              Edit Details
            </Link>
          </div>
        </div>

        {/* Demographics & Clinical Assignment Cards */}
        <div className="mt-5 grid grid-cols-1 gap-6 md:grid-cols-3">
          {/* Contact Details */}
          <div className="border border-[var(--color-rule)] bg-[var(--color-paper)] p-4">
            <h3 className="mono text-xs font-semibold uppercase tracking-wider text-[var(--color-ink)] border-b border-[var(--color-rule)] pb-1.5">
              Contact Coordinates
            </h3>
            <div className="mt-3 space-y-1.5 text-xs">
              <p><span className="mono text-[var(--color-ink-soft)]">Phone:</span> {patient.phone || 'Not recorded'}</p>
              <p><span className="mono text-[var(--color-ink-soft)]">Email:</span> {patient.email || 'Not recorded'}</p>
              <p><span className="mono text-[var(--color-ink-soft)]">Address:</span> {patient.address || 'Not recorded'}</p>
              <p><span className="mono text-[var(--color-ink-soft)]">Referral:</span> {patient.referralSource || 'Direct intake'}</p>
            </div>
          </div>

          {/* Clinician & Care Team */}
          <div className="border border-[var(--color-rule)] bg-[var(--color-paper)] p-4">
            <div className="flex items-center justify-between border-b border-[var(--color-rule)] pb-1.5">
              <h3 className="mono text-xs font-semibold uppercase tracking-wider text-[var(--color-ink)]">
                Assigned Care Team
              </h3>
              <Link
                href={`/patients/${id}/care-team`}
                className="mono text-[10px] uppercase text-[var(--color-accent)] hover:underline"
              >
                Manage →
              </Link>
            </div>
            <div className="mt-3 space-y-2 text-xs">
              <div>
                <span className="mono text-[10px] uppercase text-[var(--color-ink-soft)] block">Primary Oncologist</span>
                <span className="font-semibold text-sm">
                  {patient.primaryClinicianName || 'Unassigned'}
                </span>
                {patient.primaryClinicianSpecialty ? (
                  <span className="text-[11px] text-[var(--color-ink-soft)] block">
                    {patient.primaryClinicianSpecialty}
                  </span>
                ) : null}
              </div>
              <div className="pt-1 text-[11px] text-[var(--color-ink-soft)]">
                <span>{careTeam.length} active care team member{careTeam.length === 1 ? '' : 's'}</span>
              </div>
            </div>
          </div>

          {/* Operational Readiness Status */}
          <div className="border border-[var(--color-rule)] bg-[var(--color-paper)] p-4">
            <div className="flex items-center justify-between border-b border-[var(--color-rule)] pb-1.5">
              <h3 className="mono text-xs font-semibold uppercase tracking-wider text-[var(--color-ink)]">
                Record Readiness
              </h3>
              <ReadinessBand band={recordMap.readiness?.band ?? null} />
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 text-xs mono">
              <div>
                <span className="text-[var(--color-ink-soft)] block text-[10px] uppercase">Documents</span>
                <span className="font-bold text-base">{documents.length}</span>
              </div>
              <div>
                <span className="text-[var(--color-ink-soft)] block text-[10px] uppercase">Open Tasks</span>
                <span className="font-bold text-base">{openTasks.length}</span>
              </div>
              <div>
                <span className="text-[var(--color-ink-soft)] block text-[10px] uppercase">Verified Facts</span>
                <span className="font-semibold text-emerald-700">{verifiedCount}</span>
              </div>
              <div>
                <span className="text-[var(--color-ink-soft)] block text-[10px] uppercase">Conflicts / Unverified</span>
                <span className="font-semibold text-amber-700">{conflictCount} / {unverifiedCount}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Grid: Appointments & Encounters */}
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
        {/* Appointments Card */}
        <div className="border border-[var(--color-rule-strong)] bg-[var(--color-paper-raised)] p-6">
          <div className="flex items-center justify-between border-b border-[var(--color-rule)] pb-3">
            <div>
              <h3 className="text-base font-semibold">Scheduled Appointments ({appointments.length})</h3>
              <span className="mono text-[11px] text-[var(--color-ink-soft)]">
                Clinic visits and OPD consultations
              </span>
            </div>
            <Link
              href={`/appointments/new?patientId=${id}`}
              className="mono text-xs uppercase tracking-wider text-[var(--color-accent)] hover:underline"
            >
              + Book New →
            </Link>
          </div>

          <div className="mt-4 divide-y divide-[var(--color-rule)]">
            {appointments.slice(0, 4).map((appt) => (
              <div key={appt.id} className="py-3 flex items-start justify-between gap-3 text-xs">
                <div>
                  <span className="font-semibold block text-[var(--color-ink)]">
                    {new Date(appt.scheduled_start).toLocaleDateString('en-IN', {
                      weekday: 'short',
                      month: 'short',
                      day: 'numeric',
                    })}{' '}
                    at {new Date(appt.scheduled_start).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                  <p className="mono text-[11px] text-[var(--color-ink-soft)]">
                    {appt.clinician_name} · {appt.room_label} {appt.token_number ? `(${appt.token_number})` : ''}
                  </p>
                </div>
                <div className="mono text-right text-[11px] shrink-0">
                  <span className="uppercase font-semibold block text-blue-700">{appt.status}</span>
                  <span className="text-[10px] text-[var(--color-ink-soft)] uppercase">{appt.appointment_type.replaceAll('_', ' ')}</span>
                </div>
              </div>
            ))}
            {appointments.length === 0 && (
              <div className="py-6 text-center text-xs mono text-[var(--color-ink-soft)]">
                No appointments scheduled. Click &apos;Book New&apos; to schedule a clinic visit.
              </div>
            )}
          </div>
        </div>

        {/* Encounters Card */}
        <div className="border border-[var(--color-rule-strong)] bg-[var(--color-paper-raised)] p-6">
          <div className="flex items-center justify-between border-b border-[var(--color-rule)] pb-3">
            <div>
              <h3 className="text-base font-semibold">Consultation Encounters ({encounters.length})</h3>
              <span className="mono text-[11px] text-[var(--color-ink-soft)]">
                Documented clinical consultations
              </span>
            </div>
            <Link
              href={`/patients/${id}/encounters`}
              className="mono text-xs uppercase tracking-wider text-[var(--color-accent)] hover:underline"
            >
              View All Encounters →
            </Link>
          </div>

          <div className="mt-4 divide-y divide-[var(--color-rule)]">
            {encounters.slice(0, 4).map((enc) => (
              <div key={enc.id} className="py-3 flex items-start justify-between gap-3 text-xs">
                <div>
                  <Link
                    href={`/patients/${id}/encounters/${enc.id}`}
                    className="font-semibold text-[var(--color-ink)] hover:underline block"
                  >
                    {enc.latest_note?.title || `${enc.encounter_type} Consultation`}
                  </Link>
                  <p className="mono text-[11px] text-[var(--color-ink-soft)]">
                    Clinician: {enc.clinician_name} · Started {new Date(enc.started_at).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                  </p>
                </div>
                <div className="mono text-right text-[11px] shrink-0">
                  <span className="uppercase font-semibold block text-purple-700">{enc.status}</span>
                  <Link
                    href={`/patients/${id}/encounters/${enc.id}`}
                    className="text-[10px] underline hover:text-[var(--color-ink)]"
                  >
                    Open Record →
                  </Link>
                </div>
              </div>
            ))}
            {encounters.length === 0 && (
              <div className="py-6 text-center text-xs mono text-[var(--color-ink-soft)]">
                No consultations recorded yet. Start an encounter when patient arrives in OPD.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Grid: Recent Timeline & Source Documents */}
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
        {/* Recent Timeline Activity */}
        <div className="border border-[var(--color-rule-strong)] bg-[var(--color-paper-raised)] p-6">
          <div className="flex items-center justify-between border-b border-[var(--color-rule)] pb-3">
            <h3 className="text-base font-semibold">Latest Documented Evidence Events</h3>
            <Link
              href={`/patients/${id}/evidence`}
              className="mono text-xs uppercase tracking-wider text-[var(--color-accent)] hover:underline"
            >
              Full Evidence Ledger →
            </Link>
          </div>

          <div className="mt-4 divide-y divide-[var(--color-rule)]">
            {recentTimeline.map((item) => (
              <div key={item.id} className="py-3 flex items-start justify-between gap-3 text-xs">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="mono font-semibold text-[var(--color-ink)]">{item.factType}</span>
                    <span
                      className={`mono text-[9px] uppercase px-1.5 py-0.2 rounded font-semibold ${
                        item.state === 'verified'
                          ? 'bg-emerald-100 text-emerald-800'
                          : item.state === 'conflicting'
                          ? 'bg-rose-100 text-rose-800'
                          : 'bg-amber-100 text-amber-800'
                      }`}
                    >
                      {item.state}
                    </span>
                  </div>
                  <p className="mt-1 text-[var(--color-ink)] font-medium">{item.valueText}</p>
                  <p className="mono text-[11px] text-[var(--color-ink-soft)]">
                    Source: {item.documentName} {item.pageNumber ? `(p. ${item.pageNumber})` : ''}
                  </p>
                </div>
                <div className="mono text-right text-[11px] text-[var(--color-ink-soft)] shrink-0">
                  {item.displayDate || item.observedOn || 'Undated'}
                </div>
              </div>
            ))}
            {timeline.length === 0 && (
              <div className="py-8 text-center text-xs mono text-[var(--color-ink-soft)]">
                No clinical evidence extracted yet. Upload patient records to begin extraction.
              </div>
            )}
          </div>
        </div>

        {/* Source Documents Inventory */}
        <div className="border border-[var(--color-rule-strong)] bg-[var(--color-paper-raised)] p-6">
          <div className="flex items-center justify-between border-b border-[var(--color-rule)] pb-3">
            <h3 className="text-base font-semibold">Source Documents ({documents.length})</h3>
            <Link
              href={`/patients/${id}/sources`}
              className="mono text-xs uppercase tracking-wider text-[var(--color-accent)] hover:underline"
            >
              Manage Sources →
            </Link>
          </div>

          <div className="mt-4 divide-y divide-[var(--color-rule)]">
            {documents.slice(0, 6).map((doc) => (
              <div key={doc.id} className="py-3 flex items-start justify-between gap-3 text-xs">
                <div>
                  <Link
                    href={`/patients/${id}/sources/${doc.id}`}
                    className="font-medium text-[var(--color-ink)] hover:underline block"
                  >
                    {doc.filename}
                  </Link>
                  <p className="mono text-[11px] text-[var(--color-ink-soft)]">
                    Origin: {doc.recordOrigin} · {doc.documentType || 'Unclassified'}
                  </p>
                </div>
                <div className="mono text-right text-[11px] text-[var(--color-ink-soft)] shrink-0">
                  <span className="block">{doc.documentDate || 'No date'}</span>
                  <span className="uppercase text-[10px] text-emerald-700 font-semibold">{doc.ingestStatus}</span>
                </div>
              </div>
            ))}
            {documents.length === 0 && (
              <div className="py-8 text-center text-xs mono text-[var(--color-ink-soft)]">
                No documents uploaded yet. This is a valid patient waiting for source documents.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
