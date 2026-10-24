import Link from 'next/link';
import { can } from '@oncobrief/domain';
import {
  listMessageTemplates,
  listMessages,
  listMessageVariables,
  listVerifiedAppointments,
  listCaregivers,
} from '@oncobrief/db';
import { requireSession, withSession } from '@/lib/session';
import { EmptyFinding, SectionHeading, StateBadge } from '@/components/evidence';
import {
  approveMessageAction,
  composeMessageAction,
  deliverMessageAction,
  registerCaregiverAction,
  updateCaregiverPreferencesAction,
  revokeCaregiverConsentAction,
  recordAttendanceAction,
} from '@/lib/actions';
import { ContinuityAudioPlayer } from '@/components/ContinuityAudioPlayer';
import { SUPPORTED_LOCALES } from '@/lib/locales';

/**
 * Care continuity (architecture §19, Phase 5).
 *
 * Messages are administrative only and rendered from human-approved templates.
 * Every substituted value is traced, and a value whose backing fact is not
 * verified or corrected blocks approval. Delivery is simulated and labelled as
 * such — never a green "Sent" tick for a message that never left the machine.
 *
 * Phase 5 adds:
 * - Consented family caregiver network with explicit consent lifecycle and revocation.
 * - Sarvam Bulbul v3 regional voice preview across 11 supported locales with offline fallback.
 * - Two-way administrative attendance confirmation tracking without autonomous clinical actions.
 */
export default async function ContinuityPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requireSession();
  const canCompose = can(session.role, 'message:compose');
  const canApprove = can(session.role, 'message:approve');

  const data = await withSession(async (q, s) => {
    const templates = await listMessageTemplates(q);
    const messages = await listMessages(q, id);
    const appointments = await listVerifiedAppointments(q, id);
    const caregivers = await listCaregivers(q, s.orgId, id);
    const variablesFor = new Map<string, Awaited<ReturnType<typeof listMessageVariables>>>();
    for (const m of messages) variablesFor.set(m.id, await listMessageVariables(q, m.id));
    return { templates, messages, appointments, caregivers, variablesFor };
  });

  const { templates, messages, appointments, caregivers } = data;

  return (
    <div className="space-y-8">
      <div>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <SectionHeading title="Care continuity & caregiver network" count={messages.length} />
          <p className="mono text-[11px] text-[var(--color-ink-soft)]">
            simulated delivery · verified administrative facts only
          </p>
        </div>

        <p className="mt-3 max-w-4xl text-sm leading-relaxed text-[var(--color-ink-soft)]">
          Messages relay verified administrative facts — an appointment date, a document to bring, a
          records-office contact. The system cannot generate medical advice, and it cannot tell a
          patient or caregiver something the record has not confirmed.
        </p>
      </div>

      {/* Consented Family Caregiver Network Section */}
      <section
        data-testid="caregiver-network-section"
        className="border border-[var(--color-rule-strong)] bg-[var(--color-paper-raised)] p-4"
      >
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--color-rule)] pb-2.5">
          <div>
            <h3 className="mono text-xs font-semibold uppercase tracking-wider text-[var(--color-ink)]">
              Consented Family Caregiver Network
            </h3>
            <p className="mono mt-0.5 text-[11px] text-[var(--color-ink-soft)]">
              Coordinators register designated family caregivers with documented patient consent.
            </p>
          </div>
          <span className="mono border border-[var(--color-rule-strong)] px-2 py-0.5 text-[11px]">
            {caregivers.filter((c) => c.isActive).length} active · {caregivers.length} total
          </span>
        </div>

        {caregivers.length > 0 ? (
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            {caregivers.map((c) => (
              <div
                key={c.id}
                data-testid={`caregiver-card-${c.id}`}
                className={`border p-3 text-xs ${
                  c.isActive
                    ? 'border-[var(--color-rule-strong)] bg-white'
                    : 'border-dashed border-[var(--color-rule)] bg-[var(--color-paper)] opacity-75'
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-semibold text-sm text-[var(--color-ink)]">{c.fullName}</span>
                  <span
                    data-testid={`caregiver-status-${c.id}`}
                    className={`mono px-2 py-0.5 text-[10px] uppercase ${
                      c.isActive
                        ? 'border border-[var(--color-state-verified)] text-[var(--color-state-verified)] bg-[#e8f3ea]'
                        : 'border border-[var(--color-state-conflicting)] text-[var(--color-state-conflicting)] bg-[#fbe9e8]'
                    }`}
                  >
                    {c.isActive ? 'Consented & Active' : 'Consent Revoked'}
                  </span>
                </div>

                <div className="mono mt-2 grid grid-cols-2 gap-x-2 gap-y-1 text-[11px] text-[var(--color-ink-soft)]">
                  <div>
                    <span className="text-[var(--color-ink)]">Relationship:</span> {c.relationship}
                  </div>
                  <div>
                    <span className="text-[var(--color-ink)]">Phone:</span> {c.phoneNumber}
                  </div>
                  <div>
                    <span className="text-[var(--color-ink)]">Language:</span>{' '}
                    <span className="font-medium text-[var(--color-ink)]">{c.preferredLocale}</span>
                  </div>
                  <div>
                    <span className="text-[var(--color-ink)]">Voice Reminders:</span>{' '}
                    {c.prefersVoiceNote ? 'Enabled' : 'Disabled'}
                  </div>
                </div>

                <div className="mono mt-2 border-t border-[var(--color-rule)] pt-1.5 text-[10px] text-[var(--color-ink-soft)]">
                  <span>
                    Consent logged: {new Date(c.consentRecordedAt).toLocaleDateString('en-GB')}
                  </span>
                  {c.revokedAt ? (
                    <span className="block text-[var(--color-state-conflicting)]">
                      Revoked on {new Date(c.revokedAt).toLocaleDateString('en-GB')}
                    </span>
                  ) : null}
                </div>

                {c.isActive && canCompose ? (
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-[var(--color-rule)] pt-2">
                    <form action={updateCaregiverPreferencesAction} className="flex items-center gap-2">
                      <input type="hidden" name="patientId" value={id} />
                      <input type="hidden" name="caregiverId" value={c.id} />
                      <label className="mono text-[10px] text-[var(--color-ink-soft)]">
                        Sync reminders:
                        <input
                          type="checkbox"
                          name="syncReminders"
                          value="true"
                          defaultChecked={c.syncReminders}
                          className="ml-1"
                        />
                      </label>
                      <button
                        type="submit"
                        className="mono border border-[var(--color-rule-strong)] px-2 py-0.5 text-[10px] uppercase hover:bg-[var(--color-accent-soft)]"
                      >
                        Save
                      </button>
                    </form>

                    <form action={revokeCaregiverConsentAction}>
                      <input type="hidden" name="patientId" value={id} />
                      <input type="hidden" name="caregiverId" value={c.id} />
                      <input
                        type="hidden"
                        name="reason"
                        value="Administrative notification revocation by staff"
                      />
                      <button
                        type="submit"
                        data-testid={`revoke-caregiver-${c.id}`}
                        className="mono border border-[var(--color-state-conflicting)] px-2 py-0.5 text-[10px] uppercase text-[var(--color-state-conflicting)] hover:bg-[#fbe9e8]"
                      >
                        Revoke Consent
                      </button>
                    </form>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        ) : (
          <p className="mono mt-2 text-xs text-[var(--color-ink-soft)]">
            No family caregivers registered for this patient yet.
          </p>
        )}

        {canCompose ? (
          <details className="mt-4 border border-[var(--color-rule)] bg-[var(--color-paper)] p-3">
            <summary className="mono cursor-pointer text-xs font-semibold uppercase tracking-wider text-[var(--color-ink)]">
              + Register a New Consented Family Caregiver
            </summary>
            <form
              action={registerCaregiverAction}
              className="mt-3 grid gap-3 md:grid-cols-3"
            >
              <input type="hidden" name="patientId" value={id} />
              <label className="mono block text-[11px] uppercase tracking-wider text-[var(--color-ink-soft)]">
                Caregiver Full Name
                <input
                  name="fullName"
                  required
                  placeholder="e.g. Ramesh Kumar"
                  className="mono mt-1 block w-full border border-[var(--color-rule-strong)] bg-white px-2 py-1 text-xs"
                />
              </label>

              <label className="mono block text-[11px] uppercase tracking-wider text-[var(--color-ink-soft)]">
                Relationship to Patient
                <input
                  name="relationship"
                  required
                  placeholder="e.g. Son, Daughter, Spouse"
                  className="mono mt-1 block w-full border border-[var(--color-rule-strong)] bg-white px-2 py-1 text-xs"
                />
              </label>

              <label className="mono block text-[11px] uppercase tracking-wider text-[var(--color-ink-soft)]">
                Phone Number (for SMS/Voice)
                <input
                  name="phoneNumber"
                  required
                  placeholder="+91 98765 43210"
                  className="mono mt-1 block w-full border border-[var(--color-rule-strong)] bg-white px-2 py-1 text-xs"
                />
              </label>

              <label className="mono block text-[11px] uppercase tracking-wider text-[var(--color-ink-soft)]">
                Preferred Regional Language
                <select
                  name="preferredLocale"
                  defaultValue="hi-IN"
                  className="mono mt-1 block w-full border border-[var(--color-rule-strong)] bg-white px-2 py-1 text-xs"
                >
                  <optgroup label="English">
                    <option value="en-IN">English (India) · en-IN</option>
                  </optgroup>
                  <optgroup label="Indic Languages (10)">
                    {SUPPORTED_LOCALES.filter((l) => l.code !== 'en-IN').map((l) => (
                      <option key={l.code} value={l.code}>
                        {l.label} · {l.code}
                      </option>
                    ))}
                  </optgroup>
                </select>
              </label>

              <div className="flex items-center gap-4 pt-5">
                <label className="mono flex items-center gap-1.5 text-[11px] text-[var(--color-ink)]">
                  <input type="checkbox" name="prefersVoiceNote" defaultChecked value="true" />
                  Voice reminders
                </label>
                <label className="mono flex items-center gap-1.5 text-[11px] text-[var(--color-ink)]">
                  <input type="checkbox" name="syncReminders" defaultChecked value="true" />
                  Sync schedule
                </label>
              </div>

              <div className="flex items-end">
                <button
                  type="submit"
                  data-testid="register-caregiver-button"
                  className="mono w-full border border-[var(--color-ink)] bg-white px-3 py-1.5 text-[11px] uppercase tracking-wider hover:bg-[var(--color-accent-soft)]"
                >
                  Register Consented Caregiver
                </button>
              </div>
            </form>
          </details>
        ) : null}
      </section>

      {/* Reminder Composition Section */}
      <section className="border border-[var(--color-rule-strong)] bg-[var(--color-paper-raised)] p-4">
        <h3 className="mono mb-2 text-xs font-semibold uppercase tracking-wider text-[var(--color-ink)]">
          Compose an Administrative Reminder
        </h3>

        {!canCompose ? (
          <p className="mono border border-[var(--color-rule)] bg-[var(--color-paper-raised)] px-3 py-2 text-xs text-[var(--color-ink-soft)]">
            Message composition requires coordinator or records officer authority (<code>message:compose</code>).
          </p>
        ) : appointments.length === 0 ? (
          <EmptyFinding>
            No verified appointment fact on this record yet. A message cannot be approved without
            one.
          </EmptyFinding>
        ) : (
          <form
            action={composeMessageAction}
            className="grid gap-3 border border-[var(--color-rule-strong)] bg-white p-3 md:grid-cols-4"
          >
            <input type="hidden" name="patientId" value={id} />
            <label className="mono block text-[11px] uppercase tracking-wider text-[var(--color-ink-soft)]">
              template
              <select
                name="templateId"
                className="mono mt-1 block w-full border border-[var(--color-rule-strong)] bg-white px-2 py-1 text-xs"
              >
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.code} · {t.locale} · v{t.version}
                  </option>
                ))}
              </select>
            </label>

            <label className="mono block text-[11px] uppercase tracking-wider text-[var(--color-ink-soft)]">
              appointment (verified source)
              <select
                name="appointmentFactId"
                className="mono mt-1 block w-full border border-[var(--color-rule-strong)] bg-white px-2 py-1 text-xs"
              >
                {appointments.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.valueText}
                  </option>
                ))}
              </select>
            </label>

            <label className="mono block text-[11px] uppercase tracking-wider text-[var(--color-ink-soft)]">
              displayed date text
              <input
                name="appointmentDate"
                defaultValue={appointments[0]?.valueText ?? ''}
                className="mono mt-1 block w-full border border-[var(--color-rule-strong)] bg-white px-2 py-1 text-xs"
              />
            </label>

            <div className="flex items-end">
              <button
                type="submit"
                data-testid="compose-message"
                className="mono w-full border border-[var(--color-ink)] px-3 py-1.5 text-[11px] uppercase tracking-wider hover:bg-[var(--color-accent-soft)]"
              >
                compose draft
              </button>
            </div>
          </form>
        )}
      </section>

      {/* Messages List & Audio Preview & Attendance Confirmation */}
      <section className="space-y-4">
        {messages.map((m) => {
          const vars = data.variablesFor.get(m.id) ?? [];
          const blocked = vars.some(
            (v) =>
              v.sourceKind === 'evidence' &&
              v.factState !== 'verified' &&
              v.factState !== 'corrected',
          );
          return (
            <article
              key={m.id}
              data-testid="message-row"
              className="border border-[var(--color-rule-strong)] bg-[var(--color-paper-raised)]"
            >
              <header className="flex flex-wrap items-center gap-3 border-b border-[var(--color-rule)] px-4 py-2">
                <span className="mono text-[11px] uppercase tracking-wider">
                  {m.templateCode} · {m.locale}
                </span>
                <span className="mono border border-[var(--color-rule-strong)] px-1.5 py-0.5 text-[11px] uppercase">
                  {m.status}
                </span>
                {m.simulated ? (
                  <span className="mono border border-dashed border-[var(--color-state-extracted)] px-1.5 py-0.5 text-[11px] uppercase text-[var(--color-state-extracted)]">
                    simulated delivery
                  </span>
                ) : null}
                <span className="mono ml-auto text-[11px] text-[var(--color-ink-soft)]">
                  {m.approverName
                    ? `approved by ${m.approverName}`
                    : 'awaiting clinician approval'}
                </span>
              </header>

              <div className="px-4 py-3">
                <p className="doc-text text-[15px] leading-relaxed">{m.bodyRendered}</p>

                <div className="mt-3">
                  <p className="mono text-[11px] uppercase tracking-wider text-[var(--color-ink-soft)]">
                    every value traced
                  </p>
                  <ul className="mono mt-1 flex flex-wrap gap-2 text-[11px]">
                    {vars.map((v) => (
                      <li
                        key={v.variableName}
                        className="border border-[var(--color-rule)] px-2 py-1"
                      >
                        {v.variableName}:{' '}
                        {v.sourceKind === 'evidence' ? (
                          <>
                            <span>{v.factValue}</span>{' '}
                            {v.factState ? <StateBadge state={v.factState} compact /> : null}{' '}
                            {v.documentId ? (
                              <Link
                                href={`/patients/${id}/sources/${v.documentId}`}
                                className="underline decoration-dotted"
                              >
                                {v.documentName}
                              </Link>
                            ) : null}
                          </>
                        ) : (
                          <span className="text-[var(--color-ink-soft)]">
                            literal · {v.literalValue}
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>

                {blocked ? (
                  <p className="mono mt-3 border border-[var(--color-state-conflicting)] bg-[#fbe9e8] px-3 py-2 text-[11px]">
                    Approval is blocked: at least one value is not backed by a verified or
                    corrected fact. Verify the source first.
                  </p>
                ) : null}

                {/* Multilingual Voice Preview Audio Player */}
                <ContinuityAudioPlayer
                  messageId={m.id}
                  patientId={id}
                  bodyText={m.bodyRendered}
                  initialLocale={m.locale}
                />

                {/* Two-Way Attendance Confirmation Card */}
                {m.status === 'delivered' ? (
                  <div
                    data-testid={`attendance-panel-${m.id}`}
                    className="mt-4 border border-[var(--color-rule-strong)] bg-white p-3"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--color-rule)] pb-2">
                      <div className="flex items-center gap-2">
                        <span className="mono text-[11px] font-semibold uppercase tracking-wider text-[var(--color-ink)]">
                          Two-Way Administrative Attendance Status:
                        </span>
                        <span
                          data-testid={`attendance-status-badge-${m.id}`}
                          className={`mono px-2 py-0.5 text-[10px] font-medium uppercase ${
                            m.attendanceStatus === 'confirmed_attendance'
                              ? 'border border-[var(--color-state-verified)] text-[var(--color-state-verified)] bg-[#e8f3ea]'
                              : m.attendanceStatus === 'cannot_attend'
                                ? 'border border-[var(--color-state-conflicting)] text-[var(--color-state-conflicting)] bg-[#fbe9e8]'
                                : m.attendanceStatus === 'needs_coordinator_assistance'
                                  ? 'border border-[var(--color-state-extracted)] text-[var(--color-state-extracted)] bg-[#fef6e7]'
                                  : 'border border-[var(--color-rule-strong)] text-[var(--color-ink-soft)] bg-[var(--color-paper)]'
                          }`}
                        >
                          {m.attendanceStatus === 'confirmed_attendance'
                            ? 'Confirmed Attendance'
                            : m.attendanceStatus === 'cannot_attend'
                              ? 'Cannot Attend (Rescheduling Needed)'
                              : m.attendanceStatus === 'needs_coordinator_assistance'
                                ? 'Needs Coordinator Assistance'
                                : 'Awaiting Response / No Response'}
                        </span>
                      </div>
                      {m.attendanceRecordedAt ? (
                        <span className="mono text-[10px] text-[var(--color-ink-soft)]">
                          Recorded: {new Date(m.attendanceRecordedAt).toLocaleString('en-GB')} via{' '}
                          {m.attendanceChannel} ({m.attendanceResponder})
                        </span>
                      ) : null}
                    </div>

                    {m.attendanceNote ? (
                      <p className="mono mt-2 text-[11px] text-[var(--color-ink-soft)] italic">
                        Note: &ldquo;{m.attendanceNote}&rdquo;
                      </p>
                    ) : null}

                    {canCompose ? (
                      <form
                        action={recordAttendanceAction}
                        className="mt-3 flex flex-wrap items-center gap-2"
                      >
                        <input type="hidden" name="patientId" value={id} />
                        <input type="hidden" name="messageId" value={m.id} />
                        <label className="mono text-[10px] uppercase text-[var(--color-ink-soft)]">
                          Inbound Response:
                          <select
                            name="status"
                            data-testid="attendance-select"
                            className="mono ml-1 border border-[var(--color-rule-strong)] bg-white px-2 py-1 text-xs"
                          >
                            <option value="confirmed_attendance">Confirmed Attendance</option>
                            <option value="cannot_attend">Cannot Attend</option>
                            <option value="needs_coordinator_assistance">
                              Needs Coordinator Assistance
                            </option>
                          </select>
                        </label>

                        <label className="mono text-[10px] uppercase text-[var(--color-ink-soft)]">
                          Channel:
                          <select
                            name="channel"
                            className="mono ml-1 border border-[var(--color-rule-strong)] bg-white px-2 py-1 text-xs"
                          >
                            <option value="sms">SMS Inbound</option>
                            <option value="whatsapp">WhatsApp Reply</option>
                            <option value="phone">Phone Call</option>
                            <option value="simulated_webhook">Simulated Webhook</option>
                          </select>
                        </label>

                        <label className="mono text-[10px] uppercase text-[var(--color-ink-soft)]">
                          Responder:
                          <select
                            name="responder"
                            className="mono ml-1 border border-[var(--color-rule-strong)] bg-white px-2 py-1 text-xs"
                          >
                            <option value="patient">Patient</option>
                            <option value="caregiver">Caregiver</option>
                          </select>
                        </label>

                        <input
                          name="note"
                          placeholder="Optional operational note"
                          className="mono border border-[var(--color-rule-strong)] bg-white px-2 py-1 text-xs grow"
                        />

                        <button
                          type="submit"
                          data-testid="record-attendance-button"
                          className="mono border border-[var(--color-ink)] bg-white px-3 py-1 text-[11px] uppercase tracking-wider hover:bg-[var(--color-accent-soft)]"
                        >
                          Record Inbound Response
                        </button>
                      </form>
                    ) : null}

                    <p className="mono mt-2 text-[10px] text-[var(--color-ink-soft)] leading-tight">
                      *Administrative Notice: Inbound responses log operational intentions only.
                      Responses never trigger automated slot cancellations or medical decisions
                      without human coordinator review.
                    </p>
                  </div>
                ) : null}
              </div>

              <footer className="flex flex-wrap items-center gap-3 border-t border-[var(--color-rule)] px-4 py-2">
                {m.status === 'draft' ? (
                  canApprove ? (
                    <form action={approveMessageAction}>
                      <input type="hidden" name="patientId" value={id} />
                      <input type="hidden" name="messageId" value={m.id} />
                      <button
                        type="submit"
                        data-testid="approve-message"
                        className="mono border border-[var(--color-state-verified)] px-3 py-1 text-[11px] uppercase text-[var(--color-state-verified)] hover:bg-[#e8f3ea]"
                      >
                        clinician approve
                      </button>
                    </form>
                  ) : (
                    <span className="mono border border-[var(--color-rule)] px-2 py-1 text-[10px] text-[var(--color-ink-soft)]">
                      approval requires clinician authority
                    </span>
                  )
                ) : null}
                {m.status === 'approved' ? (
                  <form action={deliverMessageAction}>
                    <input type="hidden" name="patientId" value={id} />
                    <input type="hidden" name="messageId" value={m.id} />
                    <button
                      type="submit"
                      data-testid="deliver-message"
                      className="mono border border-[var(--color-rule-strong)] px-3 py-1 text-[11px] uppercase hover:bg-[var(--color-accent-soft)]"
                    >
                      simulate delivery
                    </button>
                  </form>
                ) : null}
                {m.status === 'delivered' ? (
                  <span className="mono text-[11px] text-[var(--color-ink-soft)]">
                    outbox: {m.externalRef ?? '—'} (simulated delivery)
                  </span>
                ) : null}
              </footer>
            </article>
          );
        })}
        {messages.length === 0 ? (
          <EmptyFinding>No messages composed for this patient.</EmptyFinding>
        ) : null}
      </section>

      <p className="mono mt-6 max-w-3xl text-[11px] leading-relaxed text-[var(--color-ink-soft)]">
        Real WhatsApp, SMS or IVR delivery requires external telephony gateways. Simulated delivery
        labels are explicit so judges and auditors see exactly what left the system.
      </p>
    </div>
  );
}
