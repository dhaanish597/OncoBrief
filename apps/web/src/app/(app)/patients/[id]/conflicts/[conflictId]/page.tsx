import Link from 'next/link';
import { notFound } from 'next/navigation';
import { can } from '@oncobrief/domain';
import { getConflict } from '@oncobrief/db';
import { requireSession, withSession } from '@/lib/session';
import { SourcePaneView } from '@/components/SourcePaneView';
import { ConfidenceBand, MachineBadge, StateBadge } from '@/components/evidence';
import { OutcomeCard, OutcomeForm } from '@/components/ReconciliationForms';

/**
 * The Reconciliation Room (architecture §8.4, §22.3).
 *
 * Two or more source panes side by side, each with its own page render and
 * highlight, the comparator's verdict, and three explicit outcome buttons. No
 * default selection, no pre-checked winner, no "recommended" badge. The absence
 * of a default is a deliberate design statement: the system has no opinion.
 */
export default async function ReconciliationRoom({
  params,
}: {
  params: Promise<{ id: string; conflictId: string }>;
}) {
  const { id, conflictId } = await params;
  const session = await requireSession();
  const canResolve = can(session.role, 'conflict:resolve');

  const data = await withSession(async (q) => getConflict(q, id, conflictId));
  if (!data) notFound();
  const conflict = data;
  const open = conflict.status === 'open';

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="mono text-[11px] uppercase tracking-[0.2em] text-[var(--color-ink-soft)]">
            Reconciliation room
          </p>
          <h2 className="mt-1 text-xl font-semibold tracking-tight text-[var(--color-ink)]">
            {conflict.factType.replaceAll('.', ' · ').replaceAll('_', ' ')}
          </h2>
          <p className="mono mt-1 text-[11px] text-[var(--color-ink-soft)]">
            slot {conflict.slotKey} · detected{' '}
            {new Date(conflict.detectedAt).toLocaleString('en-GB')} ·{' '}
            {conflict.detectionReason === 'incomparable'
              ? 'the comparator could not decide — needs human comparison'
              : 'the comparator found a disagreement'}
          </p>
        </div>
        <Link
          href={`/patients/${id}/conflicts`}
          className="mono text-[11px] uppercase tracking-wider text-[var(--color-ink-soft)] underline decoration-dotted hover:text-[var(--color-ink)]"
        >
          ← queue
        </Link>
      </div>

      {!canResolve && open ? (
        <aside
          role="status"
          aria-label="Permission notice"
          className="mt-5 border border-[var(--color-rule-strong)] bg-[#f6f4ee] p-3 text-xs leading-relaxed text-[var(--color-ink-soft)]"
        >
          <div className="flex items-start gap-2.5">
            <span aria-hidden="true" className="text-sm">🔒</span>
            <div>
              <strong className="mono block text-[11px] uppercase tracking-wider text-[var(--color-ink)]">
                Read-only review mode ({session.role.replaceAll('_', ' ')})
              </strong>
              <p className="mt-0.5">
                Resolving conflicts requires clinical or organizational authority (<code>conflict:resolve</code>).
                You can inspect the sources below, but resolution actions are disabled.
              </p>
            </div>
          </div>
        </aside>
      ) : null}

      {/* Members: preserved, side by side, neither privileged. */}
      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        {conflict.members.map((m, i) => (
          <div
            key={m.factId}
            data-testid="conflict-member"
            className="flex flex-col justify-between border border-[var(--color-rule-strong)] bg-[var(--color-paper-raised)] p-4 shadow-xs"
          >
            <div>
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <span className="mono border border-[var(--color-rule-strong)] bg-white px-2 py-0.5 text-[11px] font-medium uppercase tracking-wider">
                  source {String.fromCharCode(65 + i)}
                </span>
                <StateBadge state={m.state} compact />
                <ConfidenceBand band={m.confidenceBand} />
                <MachineBadge kind={m.extractorKind} />
              </div>
              <p className="mono mb-2 text-sm text-[var(--color-ink)]">
                value recorded: <strong>{m.valueText}</strong>
                {m.observedOn ? <span className="text-[var(--color-ink-soft)]"> · dated {m.observedOn}</span> : null}
              </p>
              <SourcePaneView
                documentName={m.documentName}
                pageNumber={m.pageNumber}
                spans={m.pageSpans}
                highlightSpanIds={m.spanIds}
                label={`source ${String.fromCharCode(65 + i)}`}
                tone="conflict"
              />
              <blockquote className="doc-text mt-3 border-l-2 border-[var(--color-accent)] pl-3 text-sm italic leading-relaxed text-[var(--color-ink)]">
                “{m.verbatimQuote}”
              </blockquote>
            </div>

            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-[var(--color-rule)] pt-2.5">
              <p className="mono text-[11px] text-[var(--color-ink-soft)]">
                {m.extractorName} · {m.reviewerName ? `reviewed by ${m.reviewerName}` : 'no human review'}
              </p>
              {m.documentId ? (
                <Link
                  href={`/patients/${id}/sources/${m.documentId}?fact=${m.factId}&page=${m.pageNumber ?? 1}`}
                  className="mono text-[11px] text-[var(--color-accent)] underline decoration-dotted underline-offset-2 hover:decoration-solid"
                  aria-label={`Inspect in Source Inspector: source ${String.fromCharCode(65 + i)}`}
                >
                  Inspect in Source Inspector →
                </Link>
              ) : null}
            </div>
          </div>
        ))}
      </div>

      {/* Outcomes */}
      {open ? (
        <section className="mt-10 border-t border-[var(--color-rule-strong)] pt-6" aria-labelledby="outcomes-heading">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 id="outcomes-heading" className="mono text-[11px] uppercase tracking-[0.2em] text-[var(--color-ink-soft)]">
              Your decision — a reason is required either way
            </h3>
            <span className="mono text-[11px] text-[var(--color-ink-soft)]">
              Human-only consequential action · Never auto-resolved
            </span>
          </div>

          <div className="mt-4 grid gap-5 lg:grid-cols-3">
            <OutcomeCard
              title="Retain both as conflicting"
              badge="Equally valid"
              description="Both sources stay on the patient record and the contradiction remains visible downstream in packets and continuity. The honest operational answer when the record does not settle it."
              action={
                <OutcomeForm
                  conflictId={conflict.id}
                  patientId={id}
                  resolutionKind="retain_both"
                  buttonLabel="retain both sources"
                  testId="resolve-retain-both"
                  canResolve={canResolve}
                >
                  <p className="mono text-[11px] leading-relaxed text-[var(--color-ink-soft)]">
                    Both facts move to <strong>verified</strong> with the conflict flag permanently attached.
                  </p>
                </OutcomeForm>
              }
            />
            <OutcomeCard
              title="Mark one as superseded"
              badge="One preferred"
              description="One source is chosen as currently active. The other source is retained and marked superseded for the audit trail, never deleted from the evidence ledger."
              action={
                <OutcomeForm
                  conflictId={conflict.id}
                  patientId={id}
                  resolutionKind="mark_superseded"
                  buttonLabel="mark superseded"
                  testId="resolve-mark-superseded"
                  canResolve={canResolve}
                >
                  <div>
                    <label
                      htmlFor="winner-supersede-select"
                      className="mono block text-[11px] uppercase tracking-wider text-[var(--color-ink-soft)]"
                    >
                      Which source wins? <span className="text-[var(--color-accent)]">*</span>
                    </label>
                    <select
                      id="winner-supersede-select"
                      name="winnerFactId"
                      required
                      disabled={!canResolve}
                      className="mono mt-1 w-full border border-[var(--color-rule-strong)] bg-white px-2 py-1.5 text-xs text-[var(--color-ink)] focus:border-[var(--color-accent)] focus:outline-hidden disabled:bg-neutral-100 disabled:text-neutral-500"
                    >
                      <option value="">select a source…</option>
                      {conflict.members.map((m, i) => (
                        <option key={m.factId} value={m.factId}>
                          source {String.fromCharCode(65 + i)} — {m.valueText} ({m.documentName})
                        </option>
                      ))}
                    </select>
                    <p className="mono mt-1 text-[10px] text-[var(--color-ink-soft)]">
                      Winning fact becomes verified; loser becomes superseded (retained for audit).
                    </p>
                  </div>
                </OutcomeForm>
              }
            />
            <OutcomeCard
              title="Correct the structured event"
              badge="Author replacement"
              description="Both existing machine extractions are marked superseded and an authorized human value replaces them, linked to a base document for provenance."
              action={
                <OutcomeForm
                  conflictId={conflict.id}
                  patientId={id}
                  resolutionKind="corrected"
                  buttonLabel="record human correction"
                  testId="resolve-corrected"
                  canResolve={canResolve}
                >
                  <div>
                    <label
                      htmlFor="base-source-select"
                      className="mono block text-[11px] uppercase tracking-wider text-[var(--color-ink-soft)]"
                    >
                      Base source for provenance anchor <span className="text-[var(--color-accent)]">*</span>
                    </label>
                    <select
                      id="base-source-select"
                      name="winnerFactId"
                      required
                      disabled={!canResolve}
                      className="mono mt-1 w-full border border-[var(--color-rule-strong)] bg-white px-2 py-1.5 text-xs text-[var(--color-ink)] focus:border-[var(--color-accent)] focus:outline-hidden disabled:bg-neutral-100 disabled:text-neutral-500"
                    >
                      {conflict.members.map((m, i) => (
                        <option key={m.factId} value={m.factId}>
                          source {String.fromCharCode(65 + i)} — {m.documentName} (p. {m.pageNumber ?? 1})
                        </option>
                      ))}
                    </select>

                    <label
                      htmlFor="corrected-value-input"
                      className="mono mt-2 block text-[11px] uppercase tracking-wider text-[var(--color-ink-soft)]"
                    >
                      Human-authored corrected value <span className="text-[var(--color-accent)]">*</span>
                    </label>
                    <input
                      id="corrected-value-input"
                      name="valueText"
                      required
                      disabled={!canResolve}
                      placeholder="Enter verified correct value…"
                      defaultValue={conflict.members[0]?.valueText ?? ''}
                      className="mono mt-1 w-full border border-[var(--color-rule-strong)] bg-white px-2 py-1.5 text-xs text-[var(--color-ink)] focus:border-[var(--color-accent)] focus:outline-hidden disabled:bg-neutral-100 disabled:text-neutral-500"
                    />
                    <p className="mono mt-1 text-[10px] text-[var(--color-ink-soft)]">
                      Both conflicting extractions are superseded; a human-authored verified fact replaces them.
                    </p>
                  </div>
                </OutcomeForm>
              }
            />
          </div>
        </section>
      ) : (
        <section
          role="status"
          aria-label="Resolved conflict status"
          className="mt-10 border border-[var(--color-state-verified)] bg-[#e8f3ea] px-4 py-3"
        >
          <p className="mono text-xs">
            Resolved as <strong>{conflict.resolvedKind?.replaceAll('_', ' ')}</strong>
            {conflict.resolvedByName ? ` by ${conflict.resolvedByName}` : ''}
            {conflict.resolvedAt ? ` · ${new Date(conflict.resolvedAt).toLocaleString('en-GB')}` : ''}
          </p>
          {conflict.resolvedReason ? (
            <p className="doc-text mt-1 text-sm italic">“{conflict.resolvedReason}”</p>
          ) : null}
        </section>
      )}
    </div>
  );
}
