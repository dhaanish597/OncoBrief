import Link from 'next/link';
import { listMessageTemplates, listMessages, listMessageVariables, listVerifiedAppointments } from '@oncobrief/db';
import { withSession } from '@/lib/session';
import { EmptyFinding, SectionHeading, StateBadge } from '@/components/evidence';
import { approveMessageAction, composeMessageAction, deliverMessageAction } from '@/lib/actions';

/**
 * Care continuity (architecture §19).
 *
 * Messages are administrative only and rendered from human-approved templates.
 * Every substituted value is traced, and a value whose backing fact is not
 * verified or corrected blocks approval. Delivery is simulated and labelled as
 * such — never a green "Sent" tick for a message that never left the machine.
 */
export default async function ContinuityPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const data = await withSession(async (q) => {
    const [templates, messages, appointments] = await Promise.all([
      listMessageTemplates(q),
      listMessages(q, id),
      listVerifiedAppointments(q, id),
    ]);
    const variablesFor = new Map<string, Awaited<ReturnType<typeof listMessageVariables>>>();
    for (const m of messages) variablesFor.set(m.id, await listMessageVariables(q, m.id));
    return { templates, messages, appointments, variablesFor };
  });

  const { templates, messages, appointments } = data;

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <SectionHeading title="Care continuity" count={messages.length} />
        <p className="mono text-[11px] text-[var(--color-ink-soft)]">
          simulated delivery · administrative facts only
        </p>
      </div>

      <p className="mt-3 max-w-4xl text-sm leading-relaxed text-[var(--color-ink-soft)]">
        Messages relay verified administrative facts — an appointment date, a document to bring, a
        records-office contact. The system cannot generate medical advice, and it cannot tell a
        patient something the record has not confirmed.
      </p>

      <section className="mt-7">
        <h3 className="mono mb-2 text-[11px] uppercase tracking-[0.2em] text-[var(--color-ink-soft)]">
          Compose an administrative reminder
        </h3>

        {appointments.length === 0 ? (
          <EmptyFinding>
            No verified appointment fact on this record yet. A message cannot be approved without
            one.
          </EmptyFinding>
        ) : (
          <form
            action={composeMessageAction}
            className="grid gap-3 border border-[var(--color-rule-strong)] bg-[var(--color-paper-raised)] p-4 md:grid-cols-4"
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
                className="mono w-full border border-[var(--color-ink)] px-3 py-1.5 text-[11px] uppercase tracking-wider"
              >
                compose draft
              </button>
            </div>
          </form>
        )}
      </section>

      <section className="mt-8 space-y-4">
        {messages.map((m) => {
          const vars = data.variablesFor.get(m.id) ?? [];
          const blocked = vars.some(
            (v) => v.sourceKind === 'evidence' && v.factState !== 'verified' && v.factState !== 'corrected',
          );
          return (
            <article key={m.id} data-testid="message-row" className="border border-[var(--color-rule-strong)] bg-[var(--color-paper-raised)]">
              <header className="flex flex-wrap items-center gap-3 border-b border-[var(--color-rule)] px-4 py-2">
                <span className="mono text-[11px] uppercase tracking-wider">{m.templateCode} · {m.locale}</span>
                <span className="mono border border-[var(--color-rule-strong)] px-1.5 py-0.5 text-[11px] uppercase">
                  {m.status}
                </span>
                {m.simulated ? (
                  <span className="mono border border-dashed border-[var(--color-state-extracted)] px-1.5 py-0.5 text-[11px] uppercase text-[var(--color-state-extracted)]">
                    simulated delivery
                  </span>
                ) : null}
                <span className="mono ml-auto text-[11px] text-[var(--color-ink-soft)]">
                  {m.approverName ? `approved by ${m.approverName}` : 'awaiting clinician approval'}
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
                      <li key={v.variableName} className="border border-[var(--color-rule)] px-2 py-1">
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
                          <span className="text-[var(--color-ink-soft)]">literal · {v.literalValue}</span>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>

                {blocked ? (
                  <p className="mono mt-3 border border-[var(--color-state-conflicting)] bg-[#fbe9e8] px-3 py-2 text-[11px]">
                    Approval is blocked: at least one value is not backed by a verified or corrected
                    fact. Verify the source first.
                  </p>
                ) : null}
              </div>

              <footer className="flex flex-wrap items-center gap-3 border-t border-[var(--color-rule)] px-4 py-2">
                {m.status === 'draft' ? (
                  <form action={approveMessageAction}>
                    <input type="hidden" name="patientId" value={id} />
                    <input type="hidden" name="messageId" value={m.id} />
                    <button
                      type="submit"
                      data-testid="approve-message"
                      className="mono border border-[var(--color-state-verified)] px-3 py-1 text-[11px] uppercase text-[var(--color-state-verified)]"
                    >
                      clinician approve
                    </button>
                  </form>
                ) : null}
                {m.status === 'approved' ? (
                  <form action={deliverMessageAction}>
                    <input type="hidden" name="patientId" value={id} />
                    <input type="hidden" name="messageId" value={m.id} />
                    <button
                      type="submit"
                      data-testid="deliver-message"
                      className="mono border border-[var(--color-rule-strong)] px-3 py-1 text-[11px] uppercase"
                    >
                      simulate delivery
                    </button>
                  </form>
                ) : null}
                {m.status === 'delivered' ? (
                  <span className="mono text-[11px] text-[var(--color-ink-soft)]">
                    outbox: {m.externalRef ?? '—'} (simulated)
                  </span>
                ) : null}
              </footer>
            </article>
          );
        })}
        {messages.length === 0 ? <EmptyFinding>No messages composed for this patient.</EmptyFinding> : null}
      </section>

      <p className="mono mt-6 max-w-3xl text-[11px] leading-relaxed text-[var(--color-ink-soft)]">
        Real WhatsApp, SMS or IVR delivery needs credentials this environment does not have. The
        outbox is explicit that delivery was simulated.
      </p>
    </div>
  );
}
