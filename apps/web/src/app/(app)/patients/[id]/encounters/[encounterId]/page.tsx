import Link from 'next/link';
import { notFound } from 'next/navigation';
import { can, TASK_KINDS, TASK_KIND_LABEL, type TaskKind } from '@oncobrief/domain';
import {
  getPatient,
  getEncounter,
  listEncounterNotes,
  getTimeline,
  listClinicians,
  listPermittedTaskAssignees,
} from '@oncobrief/db';
import { requireSession, withSession } from '@/lib/session';
import { StateBadge, EmptyFinding } from '@/components/evidence';
import {
  saveEncounterNoteDraftAction,
  finalizeEncounterNoteAction,
  amendEncounterNoteAction,
  addEncounterParticipantAction,
  completeEncounterAction,
} from '@/lib/encounter-actions';
import { createEncounterTaskAction } from '@/lib/actions';

export default async function EncounterConsultationPage({
  params,
}: {
  params: Promise<{ id: string; encounterId: string }>;
}) {
  const { id: patientId, encounterId } = await params;
  const session = await requireSession();

  const data = await withSession(async (q, s) => {
    const patient = await getPatient(q, patientId);
    if (!patient) return null;
    const encounter = await getEncounter(q, s.orgId, encounterId);
    if (!encounter) return null;
    const notes = await listEncounterNotes(q, s.orgId, encounterId);
    const timeline = await getTimeline(q, patientId);
    const clinicians = await listClinicians(q);
    const assignees = await listPermittedTaskAssignees(q);

    return {
      patient,
      encounter,
      notes,
      timeline,
      clinicians,
      assignees,
    };
  });

  if (!data) notFound();

  const { patient, encounter, notes, timeline, clinicians, assignees } = data;
  const currentNote = notes[0] ?? null;

  const canAuthorNote = can(session.role, 'encounter:note');
  const canManageEncounter = can(session.role, 'encounter:create');
  const canCreateTask = can(session.role, 'task:create');

  return (
    <div className="space-y-6">
      {/* Consultation Header */}
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[var(--color-rule-strong)] pb-4">
        <div>
          <div className="flex items-center gap-2">
            <Link
              href={`/patients/${patientId}/encounters`}
              className="mono text-xs uppercase tracking-wider text-[var(--color-ink-soft)] hover:text-[var(--color-ink)]"
            >
              ← Back to Encounters
            </Link>
            <span className="text-[var(--color-ink-soft)]">/</span>
            <span className="mono text-xs uppercase text-[var(--color-ink-soft)]">
              Consultation Room
            </span>
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight">
              {patient.displayName}
            </h1>
            <span className="mono border border-[var(--color-rule-strong)] bg-white px-2 py-0.5 text-xs font-semibold uppercase">
              {encounter.status.replaceAll('_', ' ')}
            </span>
            <span className="mono text-xs text-[var(--color-ink-soft)]">
              {encounter.encounter_type.toUpperCase()} · Started {new Date(encounter.started_at).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}
            </span>
          </div>

          <div className="mt-1 flex flex-wrap gap-4 text-xs text-[var(--color-ink-soft)]">
            <span>Primary Clinician: <strong className="text-[var(--color-ink)]">{encounter.clinician_name}</strong></span>
            <span>Facility: <strong className="text-[var(--color-ink)]">{encounter.facility_name || 'Hospital Campus'}</strong></span>
            <span>Department: <strong className="text-[var(--color-ink)]">{encounter.department_name || 'Oncology'}</strong></span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {canManageEncounter && encounter.status !== 'completed' && encounter.status !== 'cancelled' ? (
            <form action={completeEncounterAction}>
              <input type="hidden" name="encounterId" value={encounter.id} />
              <input type="hidden" name="patientId" value={patientId} />
              <button
                type="submit"
                className="mono border border-emerald-600 bg-emerald-600 px-3.5 py-1.5 text-xs uppercase tracking-wider text-white hover:bg-emerald-700"
              >
                Complete Encounter
              </button>
            </form>
          ) : null}
          <Link
            href={`/patients/${patientId}/packet`}
            className="mono border border-[var(--color-rule-strong)] bg-white px-3 py-1.5 text-xs uppercase tracking-wider hover:bg-[var(--color-accent-soft)]"
          >
            Consultation Packet
          </Link>
        </div>
      </div>

      {/* Clinical Boundary Notice */}
      <div className="border-l-4 border-amber-600 bg-amber-50 p-3 text-xs text-amber-900">
        <p className="font-semibold uppercase tracking-wider mono text-[11px]">
          Strict Non-Diagnostic Clinical Boundary
        </p>
        <p className="mt-0.5">
          Consultation assessments, clinical staging, and treatment plans are strictly authored by authorized oncology clinicians.
          OncoBrief does NOT autonomously infer diagnoses, recommend regimens, or compute risk scores.
        </p>
      </div>

      {/* Two-Column Consultation Layout */}
      <div className="grid gap-6 lg:grid-cols-12">
        {/* Left Column: Evidence Facts & Timeline View */}
        <div className="space-y-6 lg:col-span-5">
          <div className="border border-[var(--color-rule-strong)] bg-[var(--color-paper-raised)] p-4">
            <div className="flex items-center justify-between border-b border-[var(--color-rule)] pb-2 mb-3">
              <h2 className="mono text-xs font-semibold uppercase tracking-wider">
                Verified Evidence Ledger ({timeline.length})
              </h2>
              <Link
                href={`/patients/${patientId}/evidence`}
                className="mono text-[11px] underline hover:text-[var(--color-accent)]"
              >
                Full Journey →
              </Link>
            </div>

            <p className="text-xs text-[var(--color-ink-soft)] mb-3">
              Source-backed findings available for consultation review. Every item cites its underlying document and page.
            </p>

            {timeline.length === 0 ? (
              <EmptyFinding>No verified ledger facts yet.</EmptyFinding>
            ) : (
              <div className="max-h-[500px] space-y-2.5 overflow-y-auto pr-1">
                {timeline.slice(0, 15).map((evt) => (
                  <div
                    key={evt.id}
                    className="border border-[var(--color-rule)] bg-white p-2.5 text-xs"
                  >
                    <div className="flex flex-wrap items-baseline gap-2">
                      <span className="mono text-[10px] font-semibold uppercase text-[var(--color-ink-soft)]">
                        {evt.factType.replaceAll('.', ' · ')}
                      </span>
                      <StateBadge state={evt.state} compact />
                    </div>
                    <p className="mt-1 font-medium text-sm text-[var(--color-ink)]">
                      {evt.valueText}
                    </p>
                    <div className="mt-1.5 flex flex-wrap items-center justify-between text-[10px] text-[var(--color-ink-soft)] border-t border-[var(--color-rule)] pt-1">
                      <span>{evt.documentName} (p.{evt.pageNumber ?? 1})</span>
                      <Link
                        href={`/patients/${patientId}/sources/${evt.documentId}`}
                        className="underline hover:text-[var(--color-ink)]"
                      >
                        Inspect source
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Multidisciplinary Attending Participants */}
          <div className="border border-[var(--color-rule-strong)] bg-[var(--color-paper-raised)] p-4">
            <h2 className="mono text-xs font-semibold uppercase tracking-wider border-b border-[var(--color-rule)] pb-2 mb-3">
              Attending Care Team ({encounter.participants.length})
            </h2>

            <div className="space-y-2">
              {encounter.participants.map((p) => (
                <div
                  key={p.id}
                  className="flex items-center justify-between border border-[var(--color-rule)] bg-white p-2 text-xs"
                >
                  <div>
                    <span className="font-medium block">{p.user_name}</span>
                    <span className="mono text-[10px] uppercase text-[var(--color-ink-soft)]">
                      {p.role.replaceAll('_', ' ')}
                    </span>
                  </div>
                  <span className="mono text-[10px] text-[var(--color-ink-soft)]">
                    Joined {new Date(p.joined_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              ))}
            </div>

            {canManageEncounter && encounter.status !== 'completed' ? (
              <form action={addEncounterParticipantAction} className="mt-3 border-t border-[var(--color-rule)] pt-3 flex gap-2">
                <input type="hidden" name="encounterId" value={encounter.id} />
                <input type="hidden" name="patientId" value={patientId} />
                <select
                  name="userId"
                  required
                  className="mono border border-[var(--color-rule-strong)] bg-white px-2 py-1 text-xs w-full"
                >
                  <option value="">Add Clinician Participant...</option>
                  {clinicians
                    .filter((c) => !encounter.participants.some((p) => p.user_id === c.userId))
                    .map((c) => (
                      <option key={c.userId} value={c.userId}>
                        {c.displayName} ({c.specialty})
                      </option>
                    ))}
                </select>
                <select
                  name="role"
                  className="mono border border-[var(--color-rule-strong)] bg-white px-2 py-1 text-xs"
                >
                  <option value="attending_oncologist">Attending</option>
                  <option value="fellow_oncologist">Fellow</option>
                  <option value="surgical_oncologist">Surgeon</option>
                  <option value="radiation_oncologist">Rad Onc</option>
                  <option value="care_coordinator">Coordinator</option>
                </select>
                <button
                  type="submit"
                  className="mono border border-[var(--color-ink)] px-2.5 py-1 text-xs uppercase hover:bg-[var(--color-accent-soft)]"
                >
                  Add
                </button>
              </form>
            ) : null}
          </div>
        </div>

        {/* Right Column: Clinician Note Editor & Follow-up Actions */}
        <div className="space-y-6 lg:col-span-7">
          {/* Note Version History & Selector */}
          <div className="border border-[var(--color-rule-strong)] bg-[var(--color-paper-raised)] p-5">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--color-rule)] pb-3">
              <div>
                <h2 className="mono text-xs font-semibold uppercase tracking-wider">
                  Consultation Documentation
                </h2>
                <span className="mono text-[11px] text-[var(--color-ink-soft)]">
                  {currentNote ? `Version ${currentNote.version} · ${currentNote.status.toUpperCase()}` : 'New Documentation Draft'}
                </span>
              </div>

              {notes.length > 1 ? (
                <div className="flex items-center gap-1.5">
                  <span className="mono text-[10px] uppercase text-[var(--color-ink-soft)]">Versions:</span>
                  {notes.map((n) => (
                    <span
                      key={n.id}
                      className={`mono border px-2 py-0.5 text-[10px] ${
                        n.id === currentNote?.id
                          ? 'border-[var(--color-ink)] bg-[var(--color-ink)] text-white'
                          : 'border-[var(--color-rule-strong)] bg-white'
                      }`}
                    >
                      v{n.version} ({n.status})
                    </span>
                  ))}
                </div>
              ) : null}
            </div>

            {/* Note Editor Form */}
            {currentNote?.status === 'finalized' ? (
              <div className="mt-4 space-y-4">
                <div className="border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-900 flex items-center justify-between">
                  <div>
                    <span className="font-semibold block">Signed & Finalized Note</span>
                    <span className="mono text-[10px] block">
                      Signed by {currentNote.finalizer_name || currentNote.author_name} at {currentNote.finalized_at}
                    </span>
                  </div>
                  <span className="mono border border-emerald-400 bg-white px-2 py-0.5 text-[10px] uppercase font-bold text-emerald-800">
                    LOCKED (V{currentNote.version})
                  </span>
                </div>

                <div className="space-y-3 bg-white p-4 border border-[var(--color-rule)] text-xs">
                  <div>
                    <span className="mono text-[10px] uppercase text-[var(--color-ink-soft)] block">Note Title</span>
                    <h3 className="font-semibold text-sm">{currentNote.title}</h3>
                  </div>

                  {currentNote.chief_complaint ? (
                    <div>
                      <span className="mono text-[10px] uppercase text-[var(--color-ink-soft)] block">Chief Complaint</span>
                      <p className="mt-0.5">{currentNote.chief_complaint}</p>
                    </div>
                  ) : null}

                  {currentNote.history_present_illness ? (
                    <div>
                      <span className="mono text-[10px] uppercase text-[var(--color-ink-soft)] block">History of Present Illness</span>
                      <p className="mt-0.5 whitespace-pre-wrap">{currentNote.history_present_illness}</p>
                    </div>
                  ) : null}

                  {currentNote.clinical_assessment ? (
                    <div>
                      <span className="mono text-[10px] uppercase text-[var(--color-ink-soft)] block">Clinical Assessment</span>
                      <p className="mt-0.5 whitespace-pre-wrap font-medium">{currentNote.clinical_assessment}</p>
                    </div>
                  ) : null}

                  {currentNote.plan_and_instructions ? (
                    <div>
                      <span className="mono text-[10px] uppercase text-[var(--color-ink-soft)] block">Plan & Instructions</span>
                      <p className="mt-0.5 whitespace-pre-wrap">{currentNote.plan_and_instructions}</p>
                    </div>
                  ) : null}

                  {currentNote.follow_up_instructions ? (
                    <div>
                      <span className="mono text-[10px] uppercase text-[var(--color-ink-soft)] block">Follow-up Instructions</span>
                      <p className="mt-0.5 whitespace-pre-wrap">{currentNote.follow_up_instructions}</p>
                    </div>
                  ) : null}
                </div>

                {/* Amendment Affordance */}
                {canAuthorNote ? (
                  <details className="border border-[var(--color-rule-strong)] bg-white p-4">
                    <summary className="mono cursor-pointer text-xs font-semibold uppercase text-amber-900">
                      Amend Signed Note (Creates Version {currentNote.version + 1})
                    </summary>
                    <form action={amendEncounterNoteAction} className="mt-4 space-y-3">
                      <input type="hidden" name="encounterId" value={encounter.id} />
                      <input type="hidden" name="patientId" value={patientId} />
                      <input type="hidden" name="noteId" value={currentNote.id} />

                      <div>
                        <label className="mono block text-[11px] uppercase tracking-wider text-red-800 font-semibold">
                          Documented Amendment Reason (Required) *
                        </label>
                        <input
                          name="amendmentReason"
                          required
                          placeholder="e.g., Corrected medication dosage or added pathology addendum..."
                          className="mt-1 block w-full border border-red-300 bg-red-50/30 px-2.5 py-1.5 text-xs text-[var(--color-ink)]"
                        />
                      </div>

                      <div>
                        <label className="mono block text-[10px] uppercase tracking-wider text-[var(--color-ink-soft)]">
                          Clinical Assessment (Amended)
                        </label>
                        <textarea
                          name="clinicalAssessment"
                          rows={3}
                          defaultValue={currentNote.clinical_assessment || ''}
                          className="mt-1 block w-full border border-[var(--color-rule-strong)] bg-white px-2.5 py-1.5 text-xs text-[var(--color-ink)]"
                        />
                      </div>

                      <div>
                        <label className="mono block text-[10px] uppercase tracking-wider text-[var(--color-ink-soft)]">
                          Plan & Instructions (Amended)
                        </label>
                        <textarea
                          name="planAndInstructions"
                          rows={3}
                          defaultValue={currentNote.plan_and_instructions || ''}
                          className="mt-1 block w-full border border-[var(--color-rule-strong)] bg-white px-2.5 py-1.5 text-xs text-[var(--color-ink)]"
                        />
                      </div>

                      <button
                        type="submit"
                        className="mono border border-amber-600 bg-amber-600 px-4 py-1.5 text-xs uppercase tracking-wider text-white hover:bg-amber-700"
                      >
                        Publish Audited Amendment
                      </button>
                    </form>
                  </details>
                ) : null}
              </div>
            ) : (
              /* Draft Note Form */
              <form action={saveEncounterNoteDraftAction} className="mt-4 space-y-4">
                <input type="hidden" name="encounterId" value={encounter.id} />
                <input type="hidden" name="patientId" value={patientId} />
                <input type="hidden" name="noteId" value={currentNote?.id || ''} />

                <div>
                  <label className="mono block text-[10px] uppercase tracking-wider text-[var(--color-ink-soft)] font-medium">
                    Note Title
                  </label>
                  <input
                    name="title"
                    defaultValue={currentNote?.title || 'Oncology Consultation Note'}
                    className="mt-1 block w-full border border-[var(--color-rule-strong)] bg-white px-2.5 py-1.5 text-xs text-[var(--color-ink)] font-medium"
                  />
                </div>

                <div>
                  <label className="mono block text-[10px] uppercase tracking-wider text-[var(--color-ink-soft)] font-medium">
                    Chief Complaint / Reason for Visit
                  </label>
                  <input
                    name="chiefComplaint"
                    defaultValue={currentNote?.chief_complaint || ''}
                    placeholder="e.g. Routine follow-up post-radiotherapy..."
                    className="mt-1 block w-full border border-[var(--color-rule-strong)] bg-white px-2.5 py-1.5 text-xs text-[var(--color-ink)]"
                  />
                </div>

                <div>
                  <label className="mono block text-[10px] uppercase tracking-wider text-[var(--color-ink-soft)] font-medium">
                    History of Present Illness
                  </label>
                  <textarea
                    name="historyPresentIllness"
                    rows={3}
                    defaultValue={currentNote?.history_present_illness || ''}
                    placeholder="Patient reports ECOG performance status 1, tolerance to therapy..."
                    className="mt-1 block w-full border border-[var(--color-rule-strong)] bg-white px-2.5 py-1.5 text-xs text-[var(--color-ink)]"
                  />
                </div>

                <div>
                  <label className="mono block text-[10px] uppercase tracking-wider text-[var(--color-ink-soft)] font-medium">
                    Clinical Assessment (Human Clinician Authoring) *
                  </label>
                  <textarea
                    name="clinicalAssessment"
                    rows={4}
                    defaultValue={currentNote?.clinical_assessment || ''}
                    placeholder="Attending evaluation, clinical examination findings, response assessment..."
                    className="mt-1 block w-full border border-[var(--color-rule-strong)] bg-white px-2.5 py-1.5 text-xs text-[var(--color-ink)]"
                  />
                </div>

                <div>
                  <label className="mono block text-[10px] uppercase tracking-wider text-[var(--color-ink-soft)] font-medium">
                    Plan & Medical Instructions
                  </label>
                  <textarea
                    name="planAndInstructions"
                    rows={3}
                    defaultValue={currentNote?.plan_and_instructions || ''}
                    placeholder="Supportive medications, therapy schedule, clinical next steps..."
                    className="mt-1 block w-full border border-[var(--color-rule-strong)] bg-white px-2.5 py-1.5 text-xs text-[var(--color-ink)]"
                  />
                </div>

                <div>
                  <label className="mono block text-[10px] uppercase tracking-wider text-[var(--color-ink-soft)] font-medium">
                    Follow-up Instructions for Patient & Coordinator
                  </label>
                  <textarea
                    name="followUpInstructions"
                    rows={2}
                    defaultValue={currentNote?.follow_up_instructions || ''}
                    placeholder="Next visit interval, required bloodwork or imaging before next cycle..."
                    className="mt-1 block w-full border border-[var(--color-rule-strong)] bg-white px-2.5 py-1.5 text-xs text-[var(--color-ink)]"
                  />
                </div>

                {/* Evidence Ledger Provenance Citations (TASK-004, ADR-004) */}
                <div className="border border-[var(--color-rule)] bg-[var(--color-paper)] p-3 space-y-2">
                  <span className="mono block text-[10px] uppercase tracking-wider text-[var(--color-ink)] font-semibold">
                    Evidence Ledger Citations (Provenance Anchoring)
                  </span>
                  <p className="text-[11px] text-[var(--color-ink-soft)]">
                    Select verified or extracted ledger facts referenced in this consultation note:
                  </p>
                  {timeline.length === 0 ? (
                    <p className="mono text-[11px] text-[var(--color-ink-soft)] italic">
                      No ledger facts available yet; note will be recorded under human operational coordination governance.
                    </p>
                  ) : (
                    <div className="max-h-36 overflow-y-auto space-y-1.5 border border-[var(--color-rule)] bg-white p-2">
                      {timeline.slice(0, 12).map((evt) => (
                        <label key={evt.evidenceFactId || evt.id} className="flex items-start gap-2 text-xs cursor-pointer">
                          <input
                            type="checkbox"
                            name="citedFactIds"
                            value={evt.evidenceFactId || evt.id}
                            defaultChecked={currentNote?.cited_fact_ids?.includes(evt.evidenceFactId || evt.id)}
                            className="mt-0.5"
                          />
                          <span className="mono text-[11px]">
                            <strong>{evt.factType.replaceAll('.', ' · ')}:</strong> {evt.valueText} ({evt.documentName})
                          </span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--color-rule)] pt-3">
                  <button
                    type="submit"
                    className="mono border border-[var(--color-rule-strong)] bg-white px-4 py-2 text-xs uppercase tracking-wider hover:bg-[var(--color-paper)]"
                  >
                    Save Draft
                  </button>

                  {canAuthorNote && currentNote ? (
                    <button
                      type="submit"
                      formAction={finalizeEncounterNoteAction}
                      className="mono border border-emerald-600 bg-emerald-600 px-4 py-2 text-xs uppercase tracking-wider text-white hover:bg-emerald-700"
                    >
                      Finalize & Sign Documentation
                    </button>
                  ) : null}
                </div>
              </form>
            )}
          </div>

          {/* Administrative Follow-Up Task Handoff */}
          <div className="border border-[var(--color-rule-strong)] bg-[var(--color-paper-raised)] p-5">
            <h2 className="mono text-xs font-semibold uppercase tracking-wider border-b border-[var(--color-rule)] pb-2 mb-3">
              Administrative Follow-up Task Creation
            </h2>
            <p className="text-xs text-[var(--color-ink-soft)] mb-3">
              Generates an explicit care-coordination task anchored to this encounter record.
            </p>

            {canCreateTask ? (
              <form action={createEncounterTaskAction} className="space-y-3 bg-white p-4 border border-[var(--color-rule)] text-xs">
                <input type="hidden" name="encounterId" value={encounter.id} />
                <input type="hidden" name="patientId" value={patientId} />

                <div>
                  <label className="mono block text-[10px] uppercase tracking-wider text-[var(--color-ink-soft)]">
                    Task Title *
                  </label>
                  <input
                    name="title"
                    required
                    placeholder="e.g. Schedule restaging CT chest/abdomen/pelvis in 3 weeks"
                    className="mt-1 block w-full border border-[var(--color-rule-strong)] bg-white px-2.5 py-1.5 text-xs text-[var(--color-ink)]"
                  />
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="mono block text-[10px] uppercase tracking-wider text-[var(--color-ink-soft)]">
                      Task Kind
                    </label>
                    <select
                      name="taskKind"
                      className="mt-1 block w-full border border-[var(--color-rule-strong)] bg-white px-2.5 py-1.5 text-xs text-[var(--color-ink)]"
                    >
                      {TASK_KINDS.map((k) => (
                        <option key={k} value={k}>
                          {TASK_KIND_LABEL[k as TaskKind] || k}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="mono block text-[10px] uppercase tracking-wider text-[var(--color-ink-soft)]">
                      Due Date
                    </label>
                    <input
                      name="dueOn"
                      type="date"
                      className="mt-1 block w-full border border-[var(--color-rule-strong)] bg-white px-2.5 py-1.5 text-xs text-[var(--color-ink)]"
                    />
                  </div>
                </div>

                <div>
                  <label className="mono block text-[10px] uppercase tracking-wider text-[var(--color-ink-soft)]">
                    Assignee
                  </label>
                  <select
                    name="assignedTo"
                    className="mt-1 block w-full border border-[var(--color-rule-strong)] bg-white px-2.5 py-1.5 text-xs text-[var(--color-ink)]"
                  >
                    <option value="">Unassigned</option>
                    {assignees.map((a) => (
                      <option key={a.userId} value={a.userId}>
                        {a.displayName} ({a.role})
                      </option>
                    ))}
                  </select>
                </div>

                <button
                  type="submit"
                  className="mono border border-[var(--color-ink)] px-3.5 py-1.5 text-xs uppercase tracking-wider hover:bg-[var(--color-accent-soft)]"
                >
                  Create Handoff Task
                </button>
              </form>
            ) : (
              <span className="mono text-xs text-[var(--color-ink-soft)] italic">
                Task creation requires coordinator or clinician authority
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
