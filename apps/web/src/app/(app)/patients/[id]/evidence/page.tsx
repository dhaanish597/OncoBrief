import Link from 'next/link';
import { getPatient, getTimeline, listDocuments, listTasks } from '@oncobrief/db';
import { withSession } from '@/lib/session';
import { EvidenceRow } from '@/components/EvidenceRow';
import { EmptyFinding, SectionHeading } from '@/components/evidence';
import { TimelineNodeView } from '@/components/TimelineNodeView';
import { GitCommit, ListFilter } from 'lucide-react';

/**
 * The Evidence Journey. This page is a *view over the Evidence Ledger* — there
 * is no independent timeline store. Every row is a fact with its current
 * derived state, its confidence band and a link to the page it came from.
 */
export default async function EvidencePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ filter?: string; view?: string }>;
}) {
  const { id } = await params;
  const { filter, view } = await searchParams;

  const data = await withSession(async (q) => {
    const timeline = await getTimeline(q, id);
    const patient = await getPatient(q, id);
    const docs = await listDocuments(q, id);
    const tasks = await listTasks(q, id);
    return { timeline, patient, docsCount: docs.length, tasksCount: tasks.length };
  });

  const { timeline, patient, docsCount, tasksCount } = data;

  const unverifiedCount = timeline.filter((t) => t.state === 'extracted').length;
  const conflictingCount = timeline.filter((t) => t.state === 'conflicting').length;
  const verifiedCount = timeline.filter((t) => t.state === 'verified').length;
  const historicalCount = timeline.filter((t) => t.state === 'corrected' || t.state === 'superseded').length;

  const currentFilter = filter ?? 'all';
  const filtered = timeline.filter((t) => {
    if (currentFilter === 'unverified') return t.state === 'extracted';
    if (currentFilter === 'conflicting') return t.state === 'conflicting';
    if (currentFilter === 'verified') return t.state === 'verified';
    if (currentFilter === 'historical') return t.state === 'corrected' || t.state === 'superseded';
    return true;
  });

  const currentView = view ?? 'timeline';

  const groups = new Map<string, typeof filtered>();
  for (const row of filtered) {
    const key = row.displayDate?.slice(0, 7) ?? 'undated';
    const arr = groups.get(key) ?? [];
    arr.push(row);
    groups.set(key, arr);
  }

  const FILTERS = [
    { key: 'all', label: 'All facts', count: timeline.length },
    { key: 'unverified', label: 'Unverified', count: unverifiedCount },
    { key: 'conflicting', label: 'Conflicting', count: conflictingCount },
    { key: 'verified', label: 'Verified', count: verifiedCount },
    { key: 'historical', label: 'Historical / superseded', count: historicalCount },
  ];

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <SectionHeading title="Evidence journey" count={timeline.length} />
          <p className="mono mt-1 text-[11px] text-[var(--color-ink-soft)]">
            {unverifiedCount} unverified · {conflictingCount} conflicting · {historicalCount} historical
          </p>
        </div>

        {/* View Mode Toggle: Timeline (Screen 5) vs Ledger Detail */}
        <div className="flex items-center rounded-lg border border-slate-200 bg-white p-1 text-xs font-medium shadow-2xs">
          <Link
            href={`/patients/${id}/evidence?view=timeline${currentFilter !== 'all' ? `&filter=${currentFilter}` : ''}`}
            aria-current={currentView === 'timeline' ? 'page' : undefined}
            className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1 transition-colors ${
              currentView === 'timeline'
                ? 'bg-blue-600 text-white font-semibold shadow-2xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
            }`}
          >
            <GitCommit className="h-3.5 w-3.5" />
            <span>Timeline View</span>
          </Link>
          <Link
            href={`/patients/${id}/evidence?view=ledger${currentFilter !== 'all' ? `&filter=${currentFilter}` : ''}`}
            aria-current={currentView === 'ledger' ? 'page' : undefined}
            className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1 transition-colors ${
              currentView === 'ledger'
                ? 'bg-blue-600 text-white font-semibold shadow-2xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
            }`}
          >
            <ListFilter className="h-3.5 w-3.5" />
            <span>Ledger Details</span>
          </Link>
        </div>
      </div>

      <p className="mt-3 max-w-4xl text-sm leading-relaxed text-[var(--color-ink-soft)]">
        Each entry below is a fact extracted from a source document. Nothing here is verified until
        a person has confirmed it against the page. Open <em>why?</em> or <em>View Source</em> on any row to see the exact
        quoted text, the page it sits on, the extractor that produced it and who reviewed it.
      </p>

      {/* Filter Chips */}
      <nav aria-label="Evidence status filters" className="mt-6 flex flex-wrap items-center gap-2">
        <span className="mono text-[11px] uppercase tracking-wider text-[var(--color-ink-soft)] mr-1">
          Filter:
        </span>
        {FILTERS.map((f) => {
          const isActive = currentFilter === f.key;
          return (
            <Link
              key={f.key}
              href={`/patients/${id}/evidence?${f.key === 'all' ? '' : `filter=${f.key}&`}view=${currentView}`}
              aria-current={isActive ? 'true' : undefined}
              className={`mono inline-flex items-center gap-1.5 border px-2.5 py-1 text-xs transition-colors rounded ${
                isActive
                  ? 'border-blue-600 bg-blue-600 text-white font-medium'
                  : 'border-[var(--color-rule-strong)] bg-[var(--color-paper-raised)] text-[var(--color-ink-soft)] hover:bg-[var(--color-accent-soft)] hover:text-[var(--color-ink)]'
              }`}
            >
              <span>{f.label}</span>
              <span
                className={`rounded-full px-1.5 text-[10px] ${
                  isActive ? 'bg-white/20 text-white' : 'bg-neutral-200/60'
                }`}
              >
                {f.count}
              </span>
            </Link>
          );
        })}
      </nav>

      {filtered.length === 0 ? (
        <div className="mt-6">
          <EmptyFinding>
            No evidence facts match the selected filter ({currentFilter}).
          </EmptyFinding>
        </div>
      ) : currentView === 'timeline' ? (
        /* Screen 5: Multi-Source Connected Longitudinal Timeline */
        <div className="mt-6">
          <TimelineNodeView
            patientId={id}
            rows={filtered}
            patientCode={patient?.demoCode || 'DEMO-001'}
            documentsCount={docsCount}
            openTasksCount={tasksCount}
          />
        </div>
      ) : (
        /* Classic Ledger Table Details View */
        [...groups.entries()].map(([month, rows]) => (
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
        ))
      )}
    </div>
  );
}
