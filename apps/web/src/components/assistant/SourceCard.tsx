'use client';

import { ConfidenceBand, MachineBadge, StateBadge, factTypeLabel } from '@/components/evidence';

export interface SourceCardData {
  evidenceFactId: string;
  documentId: string;
  documentName: string;
  pageNumber: number | null;
  factType: string;
  valueText: string;
  verbatimQuote: string;
  state: string;
  confidenceBand: string;
  extractorKind: string;
  extractorName: string;
  reviewerName: string | null;
  reviewedAt: string | null;
  href: string;
}

/**
 * A source card for an evidence answer. Only fields present in the underlying
 * evidence model are rendered — status and confidence are never invented.
 */
export function SourceCard({ source }: { source: SourceCardData }) {
  const fmt = (iso: string | null) =>
    iso
      ? new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
      : null;

  return (
    <article
      data-testid="assistant-source-card"
      className="border border-[var(--color-rule-strong)] bg-[var(--color-paper-raised)] text-xs"
    >
      <div className="flex items-center gap-2 border-b border-[var(--color-rule)] px-3 py-2">
        <span aria-hidden className="text-[var(--color-accent)]">
          &#128196;
        </span>
        <div className="min-w-0 flex-1">
          <p className="mono truncate text-[11px] text-[var(--color-ink)]" title={source.documentName}>
            {source.documentName || 'source document'}
          </p>
          <p className="mono text-[10px] text-[var(--color-ink-soft)]">
            {source.pageNumber ? `page ${source.pageNumber} · ` : ''}
            {factTypeLabel(source.factType)}
          </p>
        </div>
      </div>

      <div className="px-3 py-2">
        <p className="mono text-[13px] leading-snug">{source.valueText}</p>
        <p className="doc-text mt-2 border-l-2 border-[var(--color-accent)] pl-2 text-[12px] italic leading-relaxed text-[var(--color-ink-soft)]">
          &ldquo;{source.verbatimQuote}&rdquo;
        </p>

        <div className="mt-2 flex flex-wrap items-center gap-2">
          <StateBadge state={source.state} />
          <ConfidenceBand band={source.confidenceBand} />
          <MachineBadge kind={source.extractorKind} />
        </div>

        {source.reviewerName || source.reviewedAt ? (
          <p className="mono mt-2 text-[10px] text-[var(--color-ink-soft)]">
            reviewed by {source.reviewerName ?? 'a person'} · {fmt(source.reviewedAt) ?? ''}
          </p>
        ) : (
          <p className="mono mt-2 text-[10px] text-[var(--color-ink-soft)]">no human review yet</p>
        )}

        {source.href ? (
          <a
            href={source.href}
            className="mono mt-2 inline-block border border-[var(--color-rule-strong)] px-2 py-1 text-[10px] uppercase tracking-wider hover:bg-[var(--color-accent-soft)]"
          >
            View source
          </a>
        ) : null}
      </div>
    </article>
  );
}
