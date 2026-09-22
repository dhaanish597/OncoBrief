import { getTimeline } from '@oncobrief/db';
import { withSession } from '@/lib/session';
import { EvidenceRow } from '@/components/EvidenceRow';
import { EmptyFinding, SectionHeading } from '@/components/evidence';

/**
 * The Evidence Journey. This page is a *view over the Evidence Ledger* — there
 * is no independent timeline store. Every row is a fact with its current
 * derived state, its confidence band and a link to the page it came from.
 */
export default async function EvidencePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const timeline = await withSession(async (q) => getTimeline(q, id));

  const unverified = timeline.filter((t) => t.state === 'extracted').length;
  const conflicting = timeline.filter((t) => t.state === 'conflicting').length;

  const groups = new Map<string, typeof timeline>();
  for (const row of timeline) {
    const key = row.displayDate?.slice(0, 7) ?? 'undated';
    const arr = groups.get(key) ?? [];
    arr.push(row);
    groups.set(key, arr);
  }

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <SectionHeading title="Evidence journey" count={timeline.length} />
        <p className="mono text-[11px] text-[var(--color-ink-soft)]">
          {unverified} unverified · {conflicting} conflicting
        </p>
      </div>

      <p className="mt-3 max-w-4xl text-sm leading-relaxed text-[var(--color-ink-soft)]">
        Each entry below is a fact extracted from a source document. Nothing here is verified until
        a person has confirmed it against the page. Open <em>why?</em> on any row to see the exact
        quoted text, the page it sits on, the extractor that produced it and who reviewed it.
      </p>

      {timeline.length === 0 ? (
        <div className="mt-6">
          <EmptyFinding>No evidence extracted for this patient yet.</EmptyFinding>
        </div>
      ) : null}

      {[...groups.entries()].map(([month, rows]) => (
        <section key={month} className="mt-8">
          <h3 className="mono mb-1 text-xs uppercase tracking-[0.2em] text-[var(--color-ink-soft)]">
            {month === 'undated' ? 'No date recorded' : month}
          </h3>
          <ul className="border-t border-[var(--color-rule-strong)] bg-[var(--color-paper-raised)]">
            {rows.map((row) => (
              <EvidenceRow
                key={row.evidenceFactId}
                row={{
                  evidenceFactId: row.evidenceFactId,
                  patientId: id,
                  factType: row.factType,
                  valueText: row.valueText,
                  displayDate: row.displayDate,
                  state: row.state,
                  documentId: row.documentId,
                  documentName: row.documentName,
                  pageNumber: row.pageNumber,
                  confidenceBand: row.confidenceBand,
                  extractorKind: row.extractorKind,
                  extractorName: row.extractorName,
                  extractorVersion: row.extractorVersion,
                  verbatimQuote: row.verbatimQuote,
                  reviewerName: row.reviewerName,
                  reviewedAt: row.reviewedAt,
                  correctsFactId: row.correctsFactId,
                  replacedByFactId: row.replacedByFactId,
                  version: row.version,
                }}
              />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
