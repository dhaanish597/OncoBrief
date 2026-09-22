import type { PageSpanRow } from '@oncobrief/db';

/**
 * A rendered document page with supporting spans highlighted from stored
 * normalised geometry. Pure presentational component: the caller resolves the
 * geometry server-side, so the client never constructs a storage path.
 */
export function SourcePaneView({
  documentName,
  pageNumber,
  spans,
  highlightSpanIds,
  label,
  tone = 'accent',
}: {
  documentName: string;
  pageNumber: number;
  spans: PageSpanRow[];
  highlightSpanIds: string[];
  label: string;
  tone?: 'accent' | 'conflict';
}) {
  const highlight = new Set(highlightSpanIds);
  const rgb = tone === 'conflict' ? '163,40,42' : '154,107,18';

  return (
    <figure
      className="border border-[var(--color-rule-strong)] bg-[var(--color-paper-raised)]"
      data-testid="source-pane"
    >
      <figcaption className="mono border-b border-[var(--color-rule)] px-3 py-2 text-[11px] uppercase tracking-wider text-[var(--color-ink-soft)]">
        {label} — {documentName} · page {pageNumber}
      </figcaption>
      {spans.length > 0 ? (
        <div className="relative aspect-[1/1.414] w-full overflow-hidden bg-white">
          {spans.map((span) => {
            const isHighlight = highlight.has(span.id);
            return (
              <span
                key={span.id}
                data-span-id={span.id}
                data-highlight={isHighlight ? 'true' : undefined}
                className="absolute whitespace-pre"
                style={{
                  left: `${span.bbox.x * 100}%`,
                  top: `${span.bbox.y * 100}%`,
                  maxWidth: '94%',
                  fontSize: '0.7rem',
                  lineHeight: 1.35,
                  fontFamily: 'var(--font-serif)',
                  background: isHighlight ? `rgba(${rgb},0.22)` : 'transparent',
                  boxShadow: isHighlight ? `0 0 0 2px rgba(${rgb},0.7)` : undefined,
                  padding: '0 2px',
                }}
              >
                {span.text}
              </span>
            );
          })}
        </div>
      ) : (
        <p className="mono px-3 py-6 text-xs text-[var(--color-ink-soft)]">No text layer.</p>
      )}
    </figure>
  );
}
