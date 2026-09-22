import { listPatientAudit, verifyLedgerChain } from '@oncobrief/db';
import { withSession } from '@/lib/session';
import { EmptyFinding, SectionHeading } from '@/components/evidence';

/**
 * The audit trail. Two append-only streams, deliberately separate: the ledger
 * answers "what does the record believe, and why?"; the audit stream answers
 * "who did what in this system?". The page ends on a hash-chain verification —
 * the final claim is not "our AI is accurate" but "here is a tamper-evident
 * record of every human decision."
 */
export default async function AuditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const data = await withSession(async (q, s) => {
    const [events, chain] = await Promise.all([
      listPatientAudit(q, id),
      verifyLedgerChain(q, s.orgId),
    ]);
    return { events, chain };
  });

  const denied = data.events.filter((e) => e.outcome === 'denied');

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <SectionHeading title="Audit trail" count={data.events.length} />
        <div className="mono text-right text-[11px]">
          <p
            data-testid="ledger-verify"
            data-ok={data.chain.ok ? 'true' : 'false'}
            className="border px-2 py-1"
            style={{
              color: data.chain.ok ? 'var(--color-state-verified)' : 'var(--color-state-conflicting)',
              borderColor: data.chain.ok ? 'var(--color-state-verified)' : 'var(--color-state-conflicting)',
            }}
          >
            ledger hash chain: {data.chain.ok ? 'verified' : 'DIVERGED'} · {data.chain.length} entries
          </p>
          {!data.chain.ok ? <p className="mt-1">{data.chain.reason}</p> : null}
        </div>
      </div>

      <p className="mt-3 max-w-4xl text-sm leading-relaxed text-[var(--color-ink-soft)]">
        Every consequential action is recorded with an actor, a timestamp and, where required, a
        reason. Refusals are recorded too: an authorisation denial is exactly what a security
        reviewer needs to see. Metadata is redacted before it reaches this stream — it records that
        a page was viewed, never what it said.
      </p>

      {denied.length > 0 ? (
        <p className="mono mt-4 border border-[var(--color-state-conflicting)] bg-[#fbe9e8] px-3 py-2 text-[11px]">
          {denied.length} denied action{denied.length === 1 ? '' : 's'} on this record.
        </p>
      ) : null}

      {data.events.length === 0 ? (
        <div className="mt-6">
          <EmptyFinding>No audit events recorded for this patient yet.</EmptyFinding>
        </div>
      ) : (
        <ol className="mt-6 border-l border-[var(--color-rule-strong)] pl-4">
          {data.events.map((e) => (
            <li key={e.id} className="relative pb-4">
              <span
                className="absolute -left-[1.30rem] top-1.5 h-2 w-2 rounded-full"
                style={{
                  background:
                    e.outcome === 'denied'
                      ? 'var(--color-state-conflicting)'
                      : e.outcome === 'error'
                        ? 'var(--color-state-extracted)'
                        : 'var(--color-rule-strong)',
                }}
              />
              <p className="mono text-xs">
                <span className="text-[var(--color-ink-soft)]">#{e.seq}</span>{' '}
                <span className="font-medium">{e.action}</span>{' '}
                <span className="text-[var(--color-ink-soft)]">
                  {e.entityKind}
                  {e.entityId ? `:${e.entityId.slice(0, 8)}` : ''}
                </span>{' '}
                {e.outcome !== 'success' ? (
                  <span style={{ color: 'var(--color-state-conflicting)' }}>[{e.outcome}]</span>
                ) : null}
              </p>
              <p className="mono mt-0.5 text-[11px] text-[var(--color-ink-soft)]">
                {e.actorName ?? 'system'}
                {e.actorRole ? ` (${e.actorRole.replaceAll('_', ' ')})` : ''} ·{' '}
                {new Date(e.occurredAt).toLocaleString('en-GB')}
                {e.metadata && Object.keys(e.metadata as object).length > 0
                  ? ` · ${JSON.stringify(e.metadata)}`
                  : ''}
              </p>
            </li>
          ))}
        </ol>
      )}

      <p className="mono mt-6 max-w-3xl text-[11px] leading-relaxed text-[var(--color-ink-soft)]">
        Both streams are append-only at the database level: the application role holds no
        UPDATE or DELETE grant, and a row trigger refuses mutation even for the schema owner.
        Verification recomputes the links; a stored chain that has been edited reports its first
        divergence rather than passing.
      </p>
    </div>
  );
}
