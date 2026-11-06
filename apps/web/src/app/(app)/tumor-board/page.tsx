import Link from 'next/link';
import { can } from '@oncobrief/domain';
import {
  listTumorBoardMeetings,
  getTumorBoardMeeting,
  listTumorBoardCases,
  listClinicians,
  listPatients,
  listVerifiedPatientStagingFacts,
  type TumorBoardStatus,
} from '@oncobrief/db';
import { requireSession, withSession } from '@/lib/session';
import { EmptyFinding } from '@/components/evidence';
import {
  createTumorBoardMeetingAction,
  registerTumorBoardCaseAction,
  updateTumorBoardCaseAction,
} from '@/lib/tumor-board-actions';

function meetingStatusBadge(status: TumorBoardStatus): string {
  switch (status) {
    case 'scheduled':
      return 'border-blue-300 bg-blue-50 text-blue-800';
    case 'in_progress':
      return 'border-purple-300 bg-purple-50 text-purple-800';
    case 'completed':
      return 'border-emerald-300 bg-emerald-50 text-emerald-800';
    case 'cancelled':
      return 'border-gray-300 bg-gray-50 text-gray-800';
    default:
      return 'border-gray-300 bg-gray-50 text-gray-800';
  }
}

export default async function TumorBoardPage({
  searchParams,
}: {
  searchParams: Promise<{ meetingId?: string; status?: string }>;
}) {
  const session = await requireSession();
  const params = await searchParams;

  const statusFilter = (params.status || undefined) as TumorBoardStatus | undefined;
  const requestedMeetingId = params.meetingId;

  const data = await withSession(async (q, s) => {
    const meetings = await listTumorBoardMeetings(q, s.orgId, statusFilter);
    const activeMeetingId = requestedMeetingId || meetings[0]?.id;
    const activeMeeting = activeMeetingId ? await getTumorBoardMeeting(q, s.orgId, activeMeetingId) : null;
    const cases = activeMeetingId ? await listTumorBoardCases(q, s.orgId, activeMeetingId) : [];
    const clinicians = await listClinicians(q);
    const patients = await listPatients(q);
    const stagingFacts = await listVerifiedPatientStagingFacts(q, s.orgId);

    return { meetings, activeMeeting, cases, clinicians, patients, stagingFacts };
  });

  const { meetings, activeMeeting, cases, clinicians, patients, stagingFacts } = data;
  const canManage = can(session.role, 'tumor_board:manage');

  return (
    <div className="mx-auto max-w-[1600px] px-4 py-8 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-[var(--color-rule-strong)] pb-4">
        <div>
          <div className="flex items-center gap-3">
            <span className="mono text-xs uppercase tracking-wider text-[var(--color-ink-soft)]">
              Multidisciplinary Review
            </span>
            <span className="mono border border-[var(--color-rule-strong)] px-2 py-0.5 text-[11px]">
              {meetings.length} meetings scheduled
            </span>
          </div>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">Tumor Board Administration</h1>
          <p className="mt-1 max-w-2xl text-xs text-[var(--color-ink-soft)]">
            Multidisciplinary oncology board coordination. Review complex cases, audit evidence-backed consultation packets,
            and record verified clinical consensus recommendations.
          </p>
        </div>

        {canManage ? (
          <details className="relative">
            <summary className="mono cursor-pointer border border-[var(--color-ink)] bg-[var(--color-ink)] px-4 py-2 text-xs uppercase tracking-wider text-white hover:bg-black">
              + Schedule Meeting
            </summary>
            <div className="absolute right-0 top-10 z-30 w-96 border border-[var(--color-rule-strong)] bg-white p-5 shadow-xl text-xs">
              <h3 className="font-semibold text-sm mb-3">Schedule Multidisciplinary Board</h3>
              <form action={createTumorBoardMeetingAction} className="space-y-3">
                <div>
                  <label htmlFor="tb-title" className="mono block text-[10px] uppercase text-[var(--color-ink-soft)]">Title *</label>
                  <input
                    id="tb-title"
                    name="title"
                    required
                    defaultValue="Thoracic Oncology Tumor Board"
                    className="mt-1 block w-full border border-[var(--color-rule-strong)] px-2 py-1 text-xs"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label htmlFor="tb-meeting-date" className="mono block text-[10px] uppercase text-[var(--color-ink-soft)]">Date *</label>
                    <input
                      id="tb-meeting-date"
                      name="meetingDate"
                      type="date"
                      required
                      className="mt-1 block w-full border border-[var(--color-rule-strong)] px-2 py-1 text-xs"
                    />
                  </div>
                  <div>
                    <label htmlFor="tb-location" className="mono block text-[10px] uppercase text-[var(--color-ink-soft)]">Location *</label>
                    <input
                      id="tb-location"
                      name="location"
                      required
                      defaultValue="Boardroom 2 / Telehealth"
                      className="mt-1 block w-full border border-[var(--color-rule-strong)] px-2 py-1 text-xs"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label htmlFor="tb-start-time" className="mono block text-[10px] uppercase text-[var(--color-ink-soft)]">Start *</label>
                    <input
                      id="tb-start-time"
                      name="startTime"
                      type="time"
                      required
                      defaultValue="16:00"
                      className="mt-1 block w-full border border-[var(--color-rule-strong)] px-2 py-1 text-xs"
                    />
                  </div>
                  <div>
                    <label htmlFor="tb-end-time" className="mono block text-[10px] uppercase text-[var(--color-ink-soft)]">End *</label>
                    <input
                      id="tb-end-time"
                      name="endTime"
                      type="time"
                      required
                      defaultValue="17:30"
                      className="mt-1 block w-full border border-[var(--color-rule-strong)] px-2 py-1 text-xs"
                    />
                  </div>
                </div>
                <div>
                  <label htmlFor="tb-moderator" className="mono block text-[10px] uppercase text-[var(--color-ink-soft)]">Moderator</label>
                  <select
                    id="tb-moderator"
                    name="moderatorUserId"
                    className="mt-1 block w-full border border-[var(--color-rule-strong)] px-2 py-1 text-xs"
                  >
                    <option value="">Select Moderator...</option>
                    {clinicians.map((c) => (
                      <option key={c.userId} value={c.userId}>
                        {c.displayName} ({c.specialty})
                      </option>
                    ))}
                  </select>
                </div>
                <button
                  type="submit"
                  className="mono mt-2 w-full border border-[var(--color-ink)] bg-[var(--color-ink)] py-1.5 text-xs uppercase text-white hover:bg-black"
                >
                  Create Board Meeting
                </button>
              </form>
            </div>
          </details>
        ) : null}
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-12">
        {/* Left Column: Meeting Directory */}
        <div className="space-y-4 lg:col-span-4">
          <div className="border border-[var(--color-rule-strong)] bg-[var(--color-paper-raised)] p-4">
            <h2 className="mono text-xs font-semibold uppercase tracking-wider border-b border-[var(--color-rule)] pb-2 mb-3">
              Tumor Board Meetings
            </h2>

            {meetings.length === 0 ? (
              <EmptyFinding>No tumor board meetings scheduled.</EmptyFinding>
            ) : (
              <div className="space-y-2">
                {meetings.map((m) => {
                  const isSelected = m.id === activeMeeting?.id;
                  return (
                    <Link
                      key={m.id}
                      href={`/tumor-board?meetingId=${m.id}`}
                      className={`block border p-3 text-xs transition-colors ${
                        isSelected
                          ? 'border-[var(--color-ink)] bg-white shadow-sm'
                          : 'border-[var(--color-rule)] bg-[var(--color-paper)] hover:bg-white'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-sm">{m.title}</span>
                        <span className={`mono border px-1.5 py-0.5 text-[9px] uppercase font-bold ${meetingStatusBadge(m.status)}`}>
                          {m.status}
                        </span>
                      </div>
                      <div className="mono mt-1 text-[11px] text-[var(--color-ink-soft)] flex items-center justify-between">
                        <span>{m.meeting_date} · {m.start_time.slice(0, 5)}–{m.end_time.slice(0, 5)}</span>
                        <span>{m.cases_count} cases</span>
                      </div>
                      <span className="mono block text-[10px] text-[var(--color-ink-soft)] mt-0.5">
                        📍 {m.location}
                      </span>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Active Meeting Agenda & Case Presentations */}
        <div className="space-y-6 lg:col-span-8">
          {activeMeeting ? (
            <>
              {/* Active Meeting Info Card */}
              <div className="border border-[var(--color-rule-strong)] bg-[var(--color-paper-raised)] p-5">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--color-rule)] pb-3">
                  <div>
                    <span className="mono text-[10px] uppercase tracking-wider text-[var(--color-ink-soft)]">
                      Current Meeting Agenda
                    </span>
                    <h2 className="text-xl font-bold">{activeMeeting.title}</h2>
                    <span className="mono text-xs text-[var(--color-ink-soft)]">
                      {activeMeeting.meeting_date} · {activeMeeting.start_time.slice(0, 5)}–{activeMeeting.end_time.slice(0, 5)} · {activeMeeting.location}
                    </span>
                  </div>

                  {canManage ? (
                    <details className="relative">
                      <summary className="mono cursor-pointer border border-[var(--color-rule-strong)] bg-white px-3 py-1.5 text-xs uppercase hover:bg-[var(--color-paper)]">
                        + Register Patient Case
                      </summary>
                      <div className="absolute right-0 top-10 z-20 w-80 border border-[var(--color-rule-strong)] bg-white p-4 shadow-xl text-xs">
                        <h4 className="font-semibold mb-2">Register Patient to Board</h4>
                        <form action={registerTumorBoardCaseAction} className="space-y-3">
                          <input type="hidden" name="meetingId" value={activeMeeting.id} />
                          <div>
                            <label htmlFor="tb-patient" className="mono block text-[10px] uppercase text-[var(--color-ink-soft)]">Patient *</label>
                            <select
                              id="tb-patient"
                              name="patientId"
                              required
                              className="mt-1 block w-full border border-[var(--color-rule-strong)] px-2 py-1 text-xs"
                            >
                              <option value="">Select patient...</option>
                              {patients.map((p) => (
                                <option key={p.id} value={p.id}>
                                  {p.displayName}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label htmlFor="tb-presenter" className="mono block text-[10px] uppercase text-[var(--color-ink-soft)]">Presenter</label>
                            <select
                              id="tb-presenter"
                              name="presenterUserId"
                              className="mt-1 block w-full border border-[var(--color-rule-strong)] px-2 py-1 text-xs"
                            >
                              <option value="">Select clinician presenter...</option>
                              {clinicians.map((c) => (
                                <option key={c.userId} value={c.userId}>
                                  {c.displayName}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label htmlFor="tb-staging-fact" className="mono block text-[10px] uppercase text-[var(--color-ink-soft)]">
                              Documented Staging Fact (Verified Evidence Ledger)
                            </label>
                            <select
                              id="tb-staging-fact"
                              name="stagingFactId"
                              className="mt-1 block w-full border border-[var(--color-rule-strong)] px-2 py-1 text-xs"
                            >
                              <option value="">Select verified staging evidence (optional)...</option>
                              {stagingFacts.map((sf) => (
                                <option key={sf.id} value={sf.id}>
                                  {sf.patient_name ? `${sf.patient_name}: ` : ''}{sf.value_normalized || sf.verbatim_quote} ({sf.document_name})
                                </option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label htmlFor="tb-clinical-staging" className="mono block text-[10px] uppercase text-[var(--color-ink-soft)]">
                              Clinical Staging Notes (Clinician Authored / Fallback)
                            </label>
                            <input
                              id="tb-clinical-staging"
                              name="clinicalStaging"
                              placeholder="e.g. cT2aN1M0 Stage IIB (used if not anchored to ledger)"
                              className="mt-1 block w-full border border-[var(--color-rule-strong)] px-2 py-1 text-xs"
                            />
                          </div>
                          <button
                            type="submit"
                            className="mono w-full border border-[var(--color-ink)] bg-[var(--color-ink)] py-1.5 text-xs uppercase text-white hover:bg-black"
                          >
                            Add to Board
                          </button>
                        </form>
                      </div>
                    </details>
                  ) : null}
                </div>

                {/* Case Presentation Cards */}
                <div className="mt-5 space-y-4">
                  {cases.length === 0 ? (
                    <EmptyFinding>
                      No patient cases registered for this board yet. Click &apos;Register Patient Case&apos; to submit a patient for multidisciplinary review.
                    </EmptyFinding>
                  ) : (
                    cases.map((c, idx) => (
                      <div
                        key={c.id}
                        className="border border-[var(--color-rule-strong)] bg-white p-4 text-xs"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--color-rule)] pb-2.5">
                          <div className="flex items-center gap-2">
                            <span className="mono border border-[var(--color-rule-strong)] px-1.5 py-0.5 text-[10px] font-bold">
                              #{idx + 1}
                            </span>
                            <Link
                              href={`/patients/${c.patient_id}/overview`}
                              className="font-semibold text-sm underline hover:text-[var(--color-accent)]"
                            >
                              {c.patient_name}
                            </Link>
                            <span className="mono text-[11px] text-[var(--color-ink-soft)]">
                              Presenter: {c.presenter_name || 'Unassigned'}
                            </span>
                          </div>

                          <div className="flex items-center gap-2">
                            <span className="mono border border-purple-200 bg-purple-50 px-2 py-0.5 text-[10px] uppercase font-bold text-purple-800">
                              {c.status}
                            </span>
                            <Link
                              href={`/patients/${c.patient_id}/packet`}
                              className="mono border border-[var(--color-rule-strong)] px-2 py-0.5 text-[10px] uppercase hover:bg-[var(--color-paper)]"
                            >
                              Consultation Packet →
                            </Link>
                          </div>
                        </div>

                        {/* Staging & Checklist Status */}
                        <div className="mt-3 grid gap-3 sm:grid-cols-2 bg-[var(--color-paper)] p-3 border border-[var(--color-rule)]">
                          <div>
                            <span className="mono block text-[10px] uppercase text-[var(--color-ink-soft)] font-semibold">
                              Documented Staging (As Written / Clinician Reviewed)
                            </span>
                            <span className="font-semibold text-sm block mt-0.5">
                              {c.clinical_staging || 'Pending verification'}
                            </span>
                            <span className="mono block text-[10px] text-[var(--color-ink-soft)] mt-1">
                              {c.staging_fact_id
                                ? `Anchored to verified staging fact (${c.cited_fact_ids?.length ?? 1} ledger citation(s))`
                                : `Administrative case entry (${c.cited_fact_ids?.length ?? 0} ledger citation(s))`}
                            </span>
                          </div>

                          <div>
                            <span className="mono block text-[10px] uppercase text-[var(--color-ink-soft)] font-semibold">
                              Multidisciplinary Checklist Verification
                            </span>
                            <div className="mono mt-1 grid grid-cols-2 gap-1 text-[10px]">
                              <span className={c.checklist_histology_verified ? 'text-emerald-700 font-bold' : 'text-gray-400'}>
                                {c.checklist_histology_verified ? '✓' : '○'} Histology Verified
                              </span>
                              <span className={c.checklist_imaging_verified ? 'text-emerald-700 font-bold' : 'text-gray-400'}>
                                {c.checklist_imaging_verified ? '✓' : '○'} Imaging Verified
                              </span>
                              <span className={c.checklist_staging_verified ? 'text-emerald-700 font-bold' : 'text-gray-400'}>
                                {c.checklist_staging_verified ? '✓' : '○'} Staging Verified
                              </span>
                              <span className={c.checklist_genomics_verified ? 'text-emerald-700 font-bold' : 'text-gray-400'}>
                                {c.checklist_genomics_verified ? '✓' : '○'} Genomics Verified
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Recommendation and Discussion Update Form */}
                        {canManage ? (
                          <form action={updateTumorBoardCaseAction} className="mt-3 space-y-2 border-t border-[var(--color-rule)] pt-3">
                            <input type="hidden" name="meetingId" value={activeMeeting.id} />
                            <input type="hidden" name="patientId" value={c.patient_id} />

                            <div className="flex flex-wrap items-center gap-4 text-xs">
                              <label className="flex items-center gap-1.5 cursor-pointer">
                                <input
                                  type="checkbox"
                                  name="checklist_histology"
                                  defaultChecked={c.checklist_histology_verified}
                                />
                                <span>Histology Verified</span>
                              </label>
                              <label className="flex items-center gap-1.5 cursor-pointer">
                                <input
                                  type="checkbox"
                                  name="checklist_imaging"
                                  defaultChecked={c.checklist_imaging_verified}
                                />
                                <span>Imaging Verified</span>
                              </label>
                              <label className="flex items-center gap-1.5 cursor-pointer">
                                <input
                                  type="checkbox"
                                  name="checklist_staging"
                                  defaultChecked={c.checklist_staging_verified}
                                />
                                <span>Staging Verified</span>
                              </label>
                              <label className="flex items-center gap-1.5 cursor-pointer">
                                <input
                                  type="checkbox"
                                  name="checklist_genomics"
                                  defaultChecked={c.checklist_genomics_verified}
                                />
                                <span>Genomics Verified</span>
                              </label>
                            </div>

                            <div className="grid gap-2 sm:grid-cols-2">
                              <div>
                                <label className="mono block text-[10px] uppercase text-[var(--color-ink-soft)]">
                                  Discussion Summary
                                </label>
                                <textarea
                                  name="discussionSummary"
                                  rows={2}
                                  defaultValue={c.discussion_summary || ''}
                                  placeholder="Multidisciplinary inputs, surgical opinions..."
                                  className="mt-0.5 block w-full border border-[var(--color-rule-strong)] p-1.5 text-xs"
                                />
                              </div>

                              <div>
                                <label className="mono block text-[10px] uppercase text-[var(--color-ink-soft)]">
                                  Consensus Recommendation Notes (Clinician Authored)
                                </label>
                                <textarea
                                  name="recommendationNotes"
                                  rows={2}
                                  defaultValue={c.recommendation_notes || ''}
                                  placeholder="Multidisciplinary clinician consensus, discussion notes, trial considerations..."
                                  className="mt-0.5 block w-full border border-[var(--color-rule-strong)] p-1.5 text-xs font-medium"
                                />
                              </div>
                            </div>

                            <div className="flex items-center justify-between pt-1">
                              <div className="flex items-center gap-2">
                                <label htmlFor={`tb-case-status-${c.id}`} className="mono text-[10px] uppercase text-[var(--color-ink-soft)]">Status:</label>
                                <select
                                  id={`tb-case-status-${c.id}`}
                                  name="status"
                                  defaultValue={c.status}
                                  className="mono border border-[var(--color-rule-strong)] px-2 py-0.5 text-xs"
                                >
                                  <option value="registered">Registered</option>
                                  <option value="presented">Presented</option>
                                  <option value="deferred">Deferred</option>
                                  <option value="concluded">Concluded</option>
                                </select>
                              </div>

                              <button
                                type="submit"
                                className="mono border border-[var(--color-ink)] px-3 py-1 text-xs uppercase hover:bg-[var(--color-accent-soft)]"
                              >
                                Save Consensus Record
                              </button>
                            </div>
                          </form>
                        ) : (
                          <div className="mt-2 text-xs">
                            <span className="mono text-[10px] uppercase text-[var(--color-ink-soft)] block">Consensus Recommendation:</span>
                            <p className="mt-0.5">{c.recommendation_notes || 'Pending presentation'}</p>
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>
            </>
          ) : (
            <div className="border border-[var(--color-rule-strong)] bg-[var(--color-paper-raised)] p-8 text-center text-sm text-[var(--color-ink-soft)]">
              Select or schedule a tumor board meeting to view the agenda and multidisciplinary patient reviews.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
