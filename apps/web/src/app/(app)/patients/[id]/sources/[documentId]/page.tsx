import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getDocument, getPageSpans, getProvenance, getStorage, getTimeline } from '@oncobrief/db';
import { segmentDocumentPacket } from '@oncobrief/domain';
import { withSession } from '@/lib/session';
import { EvidenceRow } from '@/components/EvidenceRow';
import { PageViewBeacon } from '@/components/PageViewBeacon';
import { MachineBadge, StateBadge } from '@/components/evidence';
import { SourcePaneView } from '@/components/SourcePaneView';

/**
 * The Source Inspector (architecture §22.3). A rendered page on the left with
 * the bounding box drawn from stored normalised `text_span` geometry, and the
 * fact, its ledger history and the verify/correct/reject actions on the right.
 *
 * The highlight is computed from stored coordinates, so it is real provenance,
 * not a re-search of the text at render time.
 */
export default async function SourceInspectorPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; documentId: string }>;
  searchParams: Promise<{ fact?: string; page?: string }>;
}) {
  const { id, documentId } = await params;
  const { fact: factId, page: pageParam } = await searchParams;

  const data = await withSession(async (q) => {
    const doc = await getDocument(q, id, documentId);
    if (!doc) return null;
    let effectiveFactId = factId ?? null;
    let provenance = effectiveFactId ? await getProvenance(q, effectiveFactId) : null;
    if (provenance && provenance.fact.documentId !== documentId) {
      // Cross-document guard: never cross-associate a fact from another document
      provenance = null;
      effectiveFactId = null;
    }
    if (!provenance) {
      // Find the first fact explicitly anchored to this specific document
      const firstFactRes = await q.query<{ id: string }>(
        'SELECT id FROM evidence_fact WHERE document_id = $1 ORDER BY created_at LIMIT 1',
        [documentId],
      );
      if (firstFactRes.rows[0]) {
        effectiveFactId = firstFactRes.rows[0].id;
        provenance = await getProvenance(q, effectiveFactId);
      }
    }
    const pageNumber = Number(pageParam) || provenance?.spans[0]?.pageNumber || 1;
    const page = await getPageSpans(q, documentId, pageNumber);
    const timeline = effectiveFactId ? await getTimeline(q, id) : [];
    const row = effectiveFactId ? (timeline.find((t) => t.evidenceFactId === effectiveFactId) ?? null) : null;

    let documentUrl: string | null = null;
    if (doc.storageKey) {
      try {
        const storage = getStorage();
        documentUrl = await storage.presignGet(doc.storageKey, 3600);
      } catch {
        // Storage unconfigured or offline
      }
    }

    const allPagesRes = await q.query<{ page_number: number; plain_text: string }>(
      'SELECT page_number, plain_text FROM document_page WHERE document_id = $1 ORDER BY page_number',
      [documentId],
    );
    const subDocs = segmentDocumentPacket(
      allPagesRes.rows.map((r) => ({
        pageNumber: r.page_number,
        plainText: r.plain_text,
      })),
    );

    return { doc, provenance, page, pageNumber, row, documentUrl, subDocs };
  });

  if (!data) notFound();
  const { doc, provenance, page, pageNumber, row, documentUrl, subDocs } = data;
  const highlightSpanIds = provenance?.spans.map((s) => s.id) ?? [];

  return (
    <div>
      <PageViewBeacon patientId={id} documentId={documentId} pageNumber={pageNumber} />

      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="mono text-[11px] uppercase tracking-[0.2em] text-[var(--color-ink-soft)]">
            Source inspector
          </p>
          <h2 className="mt-1 text-xl font-semibold tracking-tight">{doc.filename}</h2>
        </div>
        <Link
          href={`/patients/${id}/sources`}
          className="mono text-[11px] uppercase tracking-wider text-[var(--color-ink-soft)] underline decoration-dotted"
        >
          ← all sources
        </Link>
      </div>

      <dl className="mono mt-3 flex flex-wrap gap-x-6 gap-y-1 text-[11px] text-[var(--color-ink-soft)]">
        <div>
          <dt className="inline">sha256 </dt>
          <dd className="inline text-[var(--color-ink)]">{doc.contentSha256.slice(0, 16)}…</dd>
        </div>
        <div>
          <dt className="inline">version </dt>
          <dd className="inline text-[var(--color-ink)]">v{doc.docVersion}</dd>
        </div>
        <div>
          <dt className="inline">pages </dt>
          <dd className="inline text-[var(--color-ink)]">{doc.pageCount ?? '—'}</dd>
        </div>
        <div>
          <dt className="inline">ingest </dt>
          <dd className="inline text-[var(--color-ink)]">{doc.ingestStatus}</dd>
        </div>
      </dl>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1.25fr_1fr]">
        {/* rendered page */}
        <section>
          <div className="flex items-center justify-between border border-[var(--color-rule-strong)] bg-[var(--color-paper-raised)] px-3 py-2">
            <span className="mono text-[11px] uppercase tracking-wider text-[var(--color-ink-soft)]">
              page {pageNumber}
            </span>
            <span className="mono text-[11px] text-[var(--color-ink-soft)]">
              {(doc.pageCount ?? 1) > 1
                ? Array.from({ length: doc.pageCount ?? 1 }, (_, i) => i + 1).map((n) => (
                    <Link
                      key={n}
                      href={`/patients/${id}/sources/${documentId}?${factId ? `fact=${factId}&` : ''}page=${n}`}
                      aria-label={`Go to page ${n}`}
                      aria-current={n === pageNumber ? 'page' : undefined}
                      className="ml-2 underline decoration-dotted hover:decoration-solid"
                      style={{ color: n === pageNumber ? 'var(--color-ink)' : undefined, fontWeight: n === pageNumber ? 600 : 400 }}
                    >
                      {n}
                    </Link>
                  ))
                : null}
            </span>
          </div>

          <SourcePaneView
            documentName={doc.filename}
            pageNumber={pageNumber}
            spans={page?.spans ?? []}
            highlightSpanIds={highlightSpanIds}
            label="Source"
            documentUrl={documentUrl}
            mimeType={doc.mimeType}
            widthPx={page?.widthPx}
            heightPx={page?.heightPx}
            subDocs={subDocs}
            patientId={id}
            documentId={documentId}
            activeFactId={factId}
          />

          <p className="mono mt-2 text-[11px] text-[var(--color-ink-soft)]">
            Highlight geometry is read from <code>text_span</code> normalised coordinates. Engine:{' '}
            {page?.spans[0] ? `${page.spans[0].ocrEngine} · ${page.spans[0].ocrEngineVersion}` : '—'}
          </p>
        </section>

        {/* fact + provenance */}
        <section>
          {provenance && row ? (
            <>
              <div className="border border-[var(--color-rule-strong)] bg-[var(--color-paper-raised)]">
                <div className="border-b border-[var(--color-rule)] px-3 py-2">
                  <p className="mono text-[11px] uppercase tracking-wider text-[var(--color-ink-soft)]">
                    Fact under inspection
                  </p>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <StateBadge state={provenance.state} />
                    <MachineBadge kind={provenance.fact.extractorKind} />
                    <span className="mono text-[11px] text-[var(--color-ink-soft)]">
                      {provenance.fact.extractorName} · {provenance.fact.extractorVersion}
                    </span>
                  </div>
                  <p className="doc-text mt-3 border-l-2 border-[var(--color-accent)] pl-3 italic leading-relaxed">
                    “{provenance.fact.verbatimQuote}”
                  </p>
                </div>

                <ul className="bg-[var(--color-paper-raised)]">
                  <EvidenceRow
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
                </ul>
              </div>

              <div className="mt-5">
                <h3 className="mono mb-2 text-[11px] uppercase tracking-[0.2em] text-[var(--color-ink-soft)]">
                  Ledger history ({provenance.history.length})
                </h3>
                <ol className="border-l border-[var(--color-rule-strong)] pl-4">
                  {provenance.history.map((h) => (
                    <li key={h.id} className="relative pb-4">
                      <span className="absolute -left-[1.30rem] top-1.5 h-2 w-2 rounded-full bg-[var(--color-rule-strong)]" />
                      <p className="mono text-xs">
                        <span className="text-[var(--color-ink-soft)]">#{h.seq}</span>{' '}
                        <span className="font-medium">{h.action.replaceAll('_', ' ')}</span>{' '}
                        {h.fromState ? (
                          <span className="text-[var(--color-ink-soft)]">
                            {h.fromState} → {h.toState}
                          </span>
                        ) : (
                          <span className="text-[var(--color-ink-soft)]">→ {h.toState}</span>
                        )}
                      </p>
                      <p className="mono mt-0.5 text-[11px] text-[var(--color-ink-soft)]">
                        {h.actorName ?? (h.actorKind === 'system' ? 'system' : 'unknown')} ·{' '}
                        {new Date(h.occurredAt).toLocaleString('en-GB')}
                      </p>
                      {h.reason ? (
                        <p className="mono mt-0.5 text-[11px] italic">“{h.reason}”</p>
                      ) : null}
                    </li>
                  ))}
                </ol>
              </div>

              <div className="mt-4">
                <h3 className="mono mb-2 text-[11px] uppercase tracking-[0.2em] text-[var(--color-ink-soft)]">
                  Anchored spans
                </h3>
                <ul className="mono space-y-1 text-[11px]">
                  {provenance.spans.map((s) => (
                    <li key={s.id} className="border border-[var(--color-rule)] px-2 py-1">
                      p{s.pageNumber} · chars {s.charStart}–{s.charEnd} · bbox{' '}
                      {s.bbox.x.toFixed(2)},{s.bbox.y.toFixed(2)} ·{' '}
                      {s.ocrConfidence !== null ? `conf ${s.ocrConfidence.toFixed(2)}` : 'no conf'}
                    </li>
                  ))}
                </ul>
              </div>
            </>
          ) : (
            <p className="mono border border-dashed border-[var(--color-rule-strong)] px-3 py-4 text-xs text-[var(--color-ink-soft)]">
              Open this page from an evidence row to highlight the exact supporting text and see the
              fact’s ledger history.
            </p>
          )}
        </section>
      </div>
    </div>
  );
}
