import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getConflict } from '@oncobrief/db';
import { withSession } from '@/lib/session';
import { SourcePaneView } from '@/components/SourcePaneView';
import { ConfidenceBand, MachineBadge, StateBadge } from '@/components/evidence';
import { resolveConflictAction } from '@/lib/actions';

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
          <h2 className="mt-1 text-xl font-semibold tracking-tight">
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
          className="mono text-[11px] uppercase tracking-wider text-[var(--color-ink-soft)] underline decoration-dotted"
        >
          ← queue
        </Link>
      </div>

      {/* Members: preserved, side by side, neither privileged. */}
      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        {conflict.members.map((m, i) => (
          <div key={m.factId} data-testid="conflict-member">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <span className="mono border border-[var(--color-rule-strong)] bg-white px-2 py-0.5 text-[11px] uppercase tracking-wider">
                source {String.fromCharCode(65 + i)}
              </span>
              <StateBadge state={m.state} compact />
              <ConfidenceBand band={m.confidenceBand} />
              <MachineBadge kind={m.extractorKind} />
            </div>
            <p className="mono mb-2 text-sm">
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
            <p className="doc-text mt-2 border-l-2 border-[var(--color-accent)] pl-3 text-sm italic leading-relaxed">
              “{m.verbatimQuote}”
            </p>
            <p className="mono mt-1 text-[11px] text-[var(--color-ink-soft)]">
              {m.extractorName} · {m.reviewerName ? `reviewed by ${m.reviewerName}` : 'no reviewer'}
            </p>
          </div>
        ))}
      </div>

      {/* Outcomes */}
      {open ? (
        <section className="mt-10 border-t border-[var(--color-rule-strong)] pt-6">
          <h3 className="mono mb-3 text-[11px] uppercase tracking-[0.2em] text-[var(--color-ink-soft)]">
            Your decision — a reason is required either way
          </h3>

          <div className="grid gap-5 lg:grid-cols-3">
            <OutcomeCard
              title="Retain both as conflicting"
              description="Both sources stay on the record and the disagreement remains visible downstream. The honest answer when the record does not settle it."
              action={
                <OutcomeForm conflictId={conflict.id} patientId={id} resolutionKind="retain_both" buttonLabel="retain both" testId="resolve-retain-both">
                  <p className="mono text-[11px] leading-relaxed text-[var(--color-ink-soft)]">
                    Both facts move to <strong>verified</strong> and the conflict stays attached.
                  </p>
                </OutcomeForm>
              }
            />
            <OutcomeCard
              title="Mark one as superseded"
              description="One source is preferred; the other is retained and shown as superseded, never deleted."
              action={
                <OutcomeForm conflictId={conflict.id} patientId={id} resolutionKind="mark_superseded" buttonLabel="mark superseded" testId="resolve-mark-superseded">
                  <label className="mono block text-[11px] uppercase tracking-wider text-[var(--color-ink-soft)]">
                    Which source wins?
                  </label>
                  <select
                    name="winnerFactId"
                    required
                    className="mono mt-1 w-full border border-[var(--color-rule-strong)] bg-white px-2 py-1 text-xs"
                  >
                    <option value="">select a source…</option>
                    {conflict.members.map((m, i) => (
                      <option key={m.factId} value={m.factId}>
                        source {String.fromCharCode(65 + i)} — {m.valueText}
                      </option>
                    ))}
                  </select>
                </OutcomeForm>
              }
            />
            <OutcomeCard
              title="Correct the structured event"
              description="Both existing extractions are superseded and a human-authored value replaces them. The original values are preserved for audit."
              action={
                <OutcomeForm conflictId={conflict.id} patientId={id} resolutionKind="corrected" buttonLabel="correct both" testId="resolve-corrected">
                  <p className="mono text-[11px] leading-relaxed text-[var(--color-ink-soft)]">
                    No new value is typed here: correction of a single fact is done on the evidence
                    row, where its provenance anchor is preserved.
                  </p>
                </OutcomeForm>
              }
            />
          </div>
        </section>
      ) : (
        <section className="mt-10 border border-[var(--color-state-verified)] bg-[#e8f3ea] px-4 py-3">
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

function OutcomeCard({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action: React.ReactNode;
}) {
  return (
    <div className="border border-[var(--color-rule-strong)] bg-[var(--color-paper-raised)] p-4">
      <h4 className="text-sm font-semibold">{title}</h4>
      <p className="mt-1 text-xs leading-relaxed text-[var(--color-ink-soft)]">{description}</p>
      <div className="mt-3">{action}</div>
    </div>
  );
}

function OutcomeForm({
  conflictId,
  patientId,
  resolutionKind,
  buttonLabel,
  testId,
  children,
}: {
  conflictId: string;
  patientId: string;
  resolutionKind: string;
  buttonLabel: string;
  testId: string;
  children?: React.ReactNode;
}) {
  return (
    <form action={resolveConflictAction} className="space-y-2">
      <input type="hidden" name="patientId" value={patientId} />
      <input type="hidden" name="conflictId" value={conflictId} />
      <input type="hidden" name="resolutionKind" value={resolutionKind} />
      {children}
      <label className="mono block text-[11px] uppercase tracking-wider text-[var(--color-ink-soft)]">
        Reason (required)
      </label>
      <textarea
        name="reason"
        required
        minLength={3}
        rows={2}
        className="w-full border border-[var(--color-rule-strong)] bg-white px-2 py-1 text-xs"
      />
      <button
        type="submit"
        data-testid={testId}
        className="mono w-full border border-[var(--color-ink)] px-3 py-1.5 text-[11px] uppercase tracking-wider hover:bg-[var(--color-accent-soft)]"
      >
        {buttonLabel}
      </button>
    </form>
  );
}
