import Link from 'next/link';
import { forbidden } from 'next/navigation';
import {
  can,
  OPD_TRANSITIONS,
  READINESS_BAND_LABEL,
  computeWorklistReadinessSummary,
  filterWorklistPatients,
} from '@oncobrief/domain';
import {
  listPatients,
  listOpdWorkspace,
  listClinicians,
  listDepartments,
  getTimeline,
  getPatient,
  listDocuments,
  listTasks,
} from '@oncobrief/db';
import { requireSession, withSession } from '@/lib/session';
import { ReadinessBand } from '@/components/evidence';
import { isClinicDate } from '@/lib/opd-presentation';
import { OpdWorkspace } from '@/components/OpdWorkspace';
import { TimelineNodeView } from '@/components/TimelineNodeView';

export default async function WorkspacePage({
  searchParams,
}: {
  searchParams: Promise<{
    date?: string;
    view?: string;
    patientId?: string;
    search?: string;
    clinicianId?: string;
    departmentId?: string;
    band?: string;
    category?: string;
  }>;
}) {
  const session = await requireSession();
  if (!can(session.role, 'patient:read')) {
    forbidden();
  }

  const params = await searchParams;
  const rawView = params.view?.toLowerCase();
  const currentView: 'list' | 'timeline' | 'opd' =
    rawView === 'timeline'
      ? 'timeline'
      : rawView === 'opd' || (params.date && !rawView)
      ? 'opd'
      : 'list';

  const date = isClinicDate(params.date) ? params.date : undefined;
  const searchFilter = params.search?.trim().toLowerCase() ?? '';
  const clinicianFilter = params.clinicianId ?? '';
  const departmentFilter = params.departmentId ?? '';
  const bandFilter = params.band ?? 'all';
  const categoryFilter = params.category ?? 'all';

  const data = await withSession(async (q) => {
    const rawPatients = await listPatients(q);
    const clinicians = await listClinicians(q);
    const departments = await listDepartments(q);
    const workspace = await listOpdWorkspace(q, { orgId: session.orgId, date });

    let selectedPatient = null;
    let timelineRows = null;
    let selectedDocsCount = 0;
    let selectedTasksCount = 0;

    if (currentView === 'timeline') {
      const targetId = params.patientId || rawPatients[0]?.id;
      if (targetId) {
        selectedPatient = await getPatient(q, targetId);
        timelineRows = await getTimeline(q, targetId);
        const docs = await listDocuments(q, targetId);
        const tasks = await listTasks(q, targetId);
        selectedDocsCount = docs.length;
        selectedTasksCount = tasks.length;
      }
    }

    return {
      allPatients: rawPatients,
      clinicians,
      departments,
      workspace,
      selectedPatient,
      timelineRows,
      selectedDocsCount,
      selectedTasksCount,
    };
  });

  const { allPatients, clinicians, departments, workspace, selectedPatient, timelineRows, selectedDocsCount, selectedTasksCount } = data;

  // Filter patients for the Readiness Worklist using canonical readiness states ('ready' | 'gaps' | 'blocked' | 'none')
  const filteredPatients = filterWorklistPatients(allPatients, {
    search: searchFilter,
    band: bandFilter,
    clinician: clinicianFilter,
    department: departmentFilter,
  });

  // Filter timeline rows by category if in timeline view
  const filteredTimeline = (timelineRows || []).filter((r) => {
    if (categoryFilter === 'all') return true;
    const cat = categoryFilter.toLowerCase();
    const ft = r.factType.toLowerCase();
    const val = r.valueText.toLowerCase();
    const doc = (r.documentName || '').toLowerCase();
    return ft.includes(cat) || val.includes(cat) || doc.includes(cat);
  });

  // Aggregate metrics from canonical readiness bands
  const {
    totalPatients,
    readyCount,
    gapsCount,
    blockedCount,
    totalConflicts,
    totalUnverified,
  } = computeWorklistReadinessSummary(allPatients);

  return (
    <main className="mx-auto max-w-[1500px] px-4 py-6 sm:px-6 sm:py-10">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-[var(--color-rule-strong)] pb-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Oncology Consultation Workspace</h1>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-[var(--color-ink-soft)]">
            Evidence-first oncology operational workspace. Every view is backed by the persistent <strong>Evidence Ledger</strong> and organization-scoped records.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {can(session.role, 'patient:create') && (
            <Link
              href="/patients/new"
              className="mono border border-[var(--color-ink)] bg-[var(--color-ink)] px-3.5 py-1.5 text-xs uppercase tracking-wider text-[var(--color-paper)] font-medium hover:opacity-90 transition-opacity"
            >
              + Register Patient
            </Link>
          )}
          <p className="mono text-xs text-[var(--color-ink-soft)]">
            {totalPatients} patient{totalPatients === 1 ? '' : 's'} registered
          </p>
        </div>
      </div>

      {/* View Switcher Tabs */}
      <div className="mt-6 flex flex-wrap items-center justify-between gap-4 border-b border-[var(--color-rule)] pb-px">
        <nav className="flex space-x-1" aria-label="Workspace View Modes">
          <Link
            href="/workspace?view=list"
            className={`mono text-xs uppercase tracking-wider px-4 py-2.5 font-medium border-b-2 transition-colors ${
              currentView === 'list'
                ? 'border-[var(--color-ink)] text-[var(--color-ink)] bg-[var(--color-paper-raised)] font-semibold'
                : 'border-transparent text-[var(--color-ink-soft)] hover:text-[var(--color-ink)]'
            }`}
          >
            📋 Readiness Worklist ({filteredPatients.length})
          </Link>
          <Link
            href={`/workspace?view=timeline${selectedPatient ? `&patientId=${selectedPatient.id}` : ''}`}
            className={`mono text-xs uppercase tracking-wider px-4 py-2.5 font-medium border-b-2 transition-colors ${
              currentView === 'timeline'
                ? 'border-[var(--color-ink)] text-[var(--color-ink)] bg-[var(--color-paper-raised)] font-semibold'
                : 'border-transparent text-[var(--color-ink-soft)] hover:text-[var(--color-ink)]'
            }`}
          >
            ⏳ Longitudinal Timeline
          </Link>
          <Link
            href="/workspace?view=opd"
            className={`mono text-xs uppercase tracking-wider px-4 py-2.5 font-medium border-b-2 transition-colors ${
              currentView === 'opd'
                ? 'border-[var(--color-ink)] text-[var(--color-ink)] bg-[var(--color-paper-raised)] font-semibold'
                : 'border-transparent text-[var(--color-ink-soft)] hover:text-[var(--color-ink)]'
            }`}
          >
            🏥 OPD Flow
          </Link>
        </nav>

        {currentView === 'list' && (
          <div className="flex items-center gap-2 text-xs mono text-[var(--color-ink-soft)]">
            <span>Sorted by Record Readiness</span>
          </div>
        )}
      </div>

      {/* VIEW MODE 1 & 3: READINESS WORKLIST & OPD FLOW */}
      {currentView !== 'timeline' && (
        <OpdWorkspace
          transitions={OPD_TRANSITIONS}
          containsSyntheticData={allPatients.some((p) => p.isDemoFixture)}
          workspace={workspace}
          canManage={can(session.role, 'opd:manage')}
          initialView={currentView === 'opd' ? 'opd' : 'readiness'}
          worklist={
            <div className="mt-6 space-y-6">
          {/* Quick Stats Grid */}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div className="border border-[var(--color-rule-strong)] bg-[var(--color-paper-raised)] p-4">
              <p className="mono text-[11px] uppercase tracking-wider text-[var(--color-ink-soft)]">Total Patients</p>
              <p className="mt-1 text-2xl font-semibold tracking-tight">{totalPatients}</p>
              <p className="mt-0.5 text-xs text-[var(--color-ink-soft)]">Tenant registry</p>
            </div>
            <div className="border border-[var(--color-rule-strong)] bg-[var(--color-paper-raised)] p-4">
              <p className="mono text-[11px] uppercase tracking-wider text-[var(--color-ink-soft)]">{READINESS_BAND_LABEL.ready}</p>
              <p className="mt-1 text-2xl font-semibold tracking-tight text-emerald-800" data-testid="worklist-ready-count">{readyCount}</p>
              <p className="mt-0.5 text-xs text-[var(--color-ink-soft)]">
                Ready for consultation ({gapsCount} gaps · {blockedCount} blocked)
              </p>
            </div>
            <div className="border border-[var(--color-rule-strong)] bg-[var(--color-paper-raised)] p-4">
              <p className="mono text-[11px] uppercase tracking-wider text-[var(--color-ink-soft)]">Unresolved Conflicts</p>
              <p className={`mt-1 text-2xl font-semibold tracking-tight ${totalConflicts > 0 ? 'text-amber-800' : ''}`}>
                {totalConflicts}
              </p>
              <p className="mt-0.5 text-xs text-[var(--color-ink-soft)]">Multi-source discrepancies</p>
            </div>
            <div className="border border-[var(--color-rule-strong)] bg-[var(--color-paper-raised)] p-4">
              <p className="mono text-[11px] uppercase tracking-wider text-[var(--color-ink-soft)]">Extracted Unverified</p>
              <p className={`mt-1 text-2xl font-semibold tracking-tight ${totalUnverified > 0 ? 'text-blue-800' : ''}`}>
                {totalUnverified}
              </p>
              <p className="mt-0.5 text-xs text-[var(--color-ink-soft)]">Awaiting clinician sign-off</p>
            </div>
          </div>

          {/* Filter Bar */}
          <div className="border border-[var(--color-rule-strong)] bg-[var(--color-paper-raised)] p-4">
            <form method="GET" action="/workspace" className="grid grid-cols-1 gap-3 sm:grid-cols-5">
              <input type="hidden" name="view" value="list" />

              <div>
                <label htmlFor="search-input" className="mono block text-[11px] uppercase text-[var(--color-ink-soft)]">
                  Search Patient / MRN
                </label>
                <input
                  id="search-input"
                  name="search"
                  type="text"
                  defaultValue={searchFilter}
                  placeholder="e.g. Meera, RCI-2026-001..."
                  className="mt-1 w-full border border-[var(--color-rule-strong)] bg-[var(--color-paper)] px-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]"
                />
              </div>

              <div>
                <label htmlFor="band-filter" className="mono block text-[11px] uppercase text-[var(--color-ink-soft)]">
                  Readiness Band
                </label>
                <select
                  id="band-filter"
                  name="band"
                  defaultValue={bandFilter}
                  className="mt-1 w-full border border-[var(--color-rule-strong)] bg-[var(--color-paper)] px-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]"
                >
                  <option value="all">All Bands</option>
                  <option value="ready">{READINESS_BAND_LABEL.ready}</option>
                  <option value="gaps">{READINESS_BAND_LABEL.gaps}</option>
                  <option value="blocked">{READINESS_BAND_LABEL.blocked}</option>
                  <option value="none">Not assessed</option>
                </select>
              </div>

              <div>
                <label htmlFor="clinician-filter" className="mono block text-[11px] uppercase text-[var(--color-ink-soft)]">
                  Clinician
                </label>
                <select
                  id="clinician-filter"
                  name="clinicianId"
                  defaultValue={clinicianFilter}
                  className="mt-1 w-full border border-[var(--color-rule-strong)] bg-[var(--color-paper)] px-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]"
                >
                  <option value="">All Clinicians</option>
                  {clinicians.map((c) => (
                    <option key={c.id} value={c.displayName}>
                      {c.displayName}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="dept-filter" className="mono block text-[11px] uppercase text-[var(--color-ink-soft)]">
                  Department
                </label>
                <select
                  id="dept-filter"
                  name="departmentId"
                  defaultValue={departmentFilter}
                  className="mt-1 w-full border border-[var(--color-rule-strong)] bg-[var(--color-paper)] px-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]"
                >
                  <option value="">All Departments</option>
                  {departments.map((d) => (
                    <option key={d.id} value={d.name}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-end gap-2">
                <button
                  type="submit"
                  className="mono border border-[var(--color-ink)] bg-[var(--color-ink)] px-4 py-1.5 text-xs uppercase tracking-wider text-[var(--color-paper)] hover:opacity-90"
                >
                  Filter
                </button>
                <Link
                  href="/workspace?view=list"
                  className="mono border border-[var(--color-rule-strong)] bg-[var(--color-paper)] px-3 py-1.5 text-xs uppercase tracking-wider text-[var(--color-ink-soft)] hover:bg-[var(--color-paper-raised)]"
                >
                  Clear
                </Link>
              </div>
            </form>
          </div>

          {/* Patient Worklist Table */}
          <div className="border border-[var(--color-rule-strong)] bg-[var(--color-paper-raised)]">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[850px] border-collapse text-sm">
                <thead>
                  <tr className="mono border-b border-[var(--color-rule-strong)] text-left text-[11px] uppercase tracking-wider text-[var(--color-ink-soft)]">
                    <th className="px-4 py-2.5">Patient / MRN</th>
                    <th className="px-4 py-2.5">Readiness</th>
                    <th className="px-4 py-2.5">Docs</th>
                    <th className="px-4 py-2.5">Missing</th>
                    <th className="px-4 py-2.5">Conflicts</th>
                    <th className="px-4 py-2.5">Unverified</th>
                    <th className="px-4 py-2.5">Tasks</th>
                    <th className="px-4 py-2.5 text-right">Quick Navigation</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--color-rule)]">
                  {filteredPatients.map((p) => (
                    <tr key={p.id} className="hover:bg-[var(--color-accent-soft)]">
                      <td className="px-4 py-3">
                        <Link href={`/patients/${p.id}/overview`} className="block hover:underline">
                          <span className="font-medium text-[var(--color-ink)]">{p.displayName}</span>
                          <span className="mono block text-[11px] text-[var(--color-ink-soft)]">
                            MRN: {p.mrn || p.demoCode || p.id.slice(0, 8)}
                          </span>
                        </Link>
                      </td>
                      <td className="px-4 py-3">
                        <ReadinessBand band={p.readinessBand} />
                      </td>
                      <td className="mono px-4 py-3 text-xs">{p.documentCount}</td>
                      <td
                        className="mono px-4 py-3 text-xs"
                        style={{ color: p.missingRequired > 0 ? 'var(--color-state-conflicting)' : undefined }}
                      >
                        {p.missingRequired > 0 ? p.missingRequired : '—'}
                      </td>
                      <td
                        className="mono px-4 py-3 text-xs"
                        style={{ color: p.openConflicts > 0 ? 'var(--color-state-conflicting)' : undefined }}
                      >
                        {p.openConflicts > 0 ? (
                          <Link href={`/patients/${p.id}/conflicts`} className="font-semibold text-rose-700 hover:underline">
                            {p.openConflicts} open
                          </Link>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="mono px-4 py-3 text-xs">
                        {p.unverifiedFacts > 0 ? (
                          <Link href={`/patients/${p.id}/evidence`} className="text-blue-700 hover:underline">
                            {p.unverifiedFacts}
                          </Link>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="mono px-4 py-3 text-xs">
                        {p.openTasks > 0 ? (
                          <Link href={`/patients/${p.id}/tasks`} className="hover:underline">
                            {p.openTasks}
                          </Link>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-2 mono text-xs">
                          <Link
                            href={`/workspace?view=timeline&patientId=${p.id}`}
                            className="border border-[var(--color-rule-strong)] px-2 py-1 text-[11px] uppercase hover:bg-[var(--color-accent-soft)]"
                            title="Open in Workspace Longitudinal Timeline"
                          >
                            Timeline
                          </Link>
                          <Link
                            href={`/patients/${p.id}/overview`}
                            className="border border-[var(--color-ink)] bg-[var(--color-ink)] px-2 py-1 text-[11px] uppercase text-[var(--color-paper)] hover:opacity-90"
                          >
                            Chart →
                          </Link>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {filteredPatients.length === 0 && (
                    <tr>
                      <td colSpan={8} className="mono px-4 py-12 text-center text-[var(--color-ink-soft)]">
                        No patients matching your search criteria.
                        <div className="mt-2">
                          <Link href="/patients/new" className="text-xs uppercase underline">
                            Register a new patient
                          </Link>
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
          }
        />
      )}

      {/* VIEW MODE 2: LONGITUDINAL PATIENT TIMELINE */}
      {currentView === 'timeline' && (
        <div className="mt-6 space-y-6">
          {/* Patient Selection Header */}
          <div className="border border-[var(--color-rule-strong)] bg-[var(--color-paper-raised)] p-5">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex flex-wrap items-center gap-3">
                <label htmlFor="patient-select" className="mono text-xs uppercase tracking-wider text-[var(--color-ink-soft)]">
                  Active Patient:
                </label>
                <form method="GET" action="/workspace" className="inline-block">
                  <input type="hidden" name="view" value="timeline" />
                  <select
                    id="patient-select"
                    name="patientId"
                    defaultValue={selectedPatient?.id}
                    className="border border-[var(--color-rule-strong)] bg-[var(--color-paper)] px-3 py-1.5 text-xs font-medium focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]"
                  >
                    {allPatients.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.displayName} ({p.mrn || p.demoCode || p.id.slice(0, 8)})
                      </option>
                    ))}
                  </select>
                  <button
                    type="submit"
                    className="ml-2 mono border border-[var(--color-ink)] bg-[var(--color-ink)] px-2.5 py-1 text-xs uppercase text-[var(--color-paper)]"
                  >
                    Load
                  </button>
                </form>
              </div>

              {selectedPatient && (
                <div className="flex items-center gap-3 text-xs mono">
                  <span className="text-[var(--color-ink-soft)]">
                    MRN: <strong className="text-[var(--color-ink)]">{selectedPatient.mrn || selectedPatient.demoCode || '—'}</strong>
                  </span>
                  <span>·</span>
                  <span className="text-[var(--color-ink-soft)]">
                    Events in Ledger: <strong className="text-[var(--color-ink)]">{timelineRows?.length || 0}</strong>
                  </span>
                  <span>·</span>
                  <Link
                    href={`/patients/${selectedPatient.id}/overview`}
                    className="underline text-[var(--color-ink)] font-semibold hover:opacity-80"
                  >
                    Patient Chart →
                  </Link>
                </div>
              )}
            </div>

            {/* Category / Modality Filter */}
            <div className="mt-4 pt-3 border-t border-[var(--color-rule)] flex flex-wrap items-center gap-2">
              <span className="mono text-[11px] uppercase tracking-wider text-[var(--color-ink-soft)] mr-2">
                Modality Filter:
              </span>
              {[
                { key: 'all', label: 'All Events' },
                { key: 'pathology', label: 'Pathology & Biopsy' },
                { key: 'radiology', label: 'Imaging & Scans' },
                { key: 'chemo', label: 'Chemotherapy' },
                { key: 'radiation', label: 'Radiotherapy' },
                { key: 'surgery', label: 'Surgical' },
                { key: 'lab', label: 'Lab Tests' },
              ].map((cat) => {
                const isActive = categoryFilter === cat.key;
                const nextUrl = `/workspace?view=timeline&patientId=${selectedPatient?.id || ''}&category=${cat.key}`;
                return (
                  <Link
                    key={cat.key}
                    href={nextUrl}
                    className={`mono text-[11px] uppercase px-2.5 py-1 border transition-colors ${
                      isActive
                        ? 'border-[var(--color-ink)] bg-[var(--color-ink)] text-[var(--color-paper)] font-semibold'
                        : 'border-[var(--color-rule-strong)] bg-[var(--color-paper)] text-[var(--color-ink-soft)] hover:bg-[var(--color-paper-raised)]'
                    }`}
                  >
                    {cat.label}
                  </Link>
                );
              })}
            </div>
          </div>

          {/* Timeline View Body */}
          {selectedPatient && timelineRows ? (
            <div className="border border-[var(--color-rule-strong)] bg-[var(--color-paper-raised)] p-6">
              <TimelineNodeView
                patientId={selectedPatient.id}
                patientCode={selectedPatient.demoCode || selectedPatient.mrn || 'ONCO-PATIENT'}
                rows={filteredTimeline}
                openTasksCount={selectedTasksCount}
                documentsCount={selectedDocsCount}
              />
            </div>
          ) : (
            <div className="border border-[var(--color-rule-strong)] bg-[var(--color-paper-raised)] p-12 text-center">
              <p className="mono text-xs text-[var(--color-ink-soft)]">
                No patient selected or available. Please register or select a patient to view their timeline.
              </p>
            </div>
          )}
        </div>
      )}
    </main>
  );
}
