'use client';

import React, { useEffect, useRef, useState } from 'react';
import type { PageSpanRow } from '@oncobrief/db';
import type { PacketSubDocument } from '@oncobrief/domain';

export interface SourcePaneViewProps {
  documentName: string;
  pageNumber: number;
  spans: PageSpanRow[];
  highlightSpanIds: string[];
  label?: string;
  tone?: 'accent' | 'conflict';
  documentUrl?: string | null;
  mimeType?: string | null;
  widthPx?: number | null;
  heightPx?: number | null;
  subDocs?: readonly PacketSubDocument[];
  patientId?: string;
  documentId?: string;
  activeFactId?: string | null;
}

/**
 * A rendered document page with supporting spans highlighted from stored
 * normalised geometry. Pure presentational component with dual-mode view:
 * 1. "Original Scan + BBox Overlay": Canvas/Scan container with scaled SVG rect overlays
 * 2. "Structured OCR Layer": Reading-order spans with confidence badges and mobile-safe wrapping
 */
export function SourcePaneView({
  documentName,
  pageNumber,
  spans,
  highlightSpanIds,
  label = 'Source',
  tone = 'accent',
  documentUrl = null,
  mimeType = null,
  widthPx = null,
  heightPx = null,
  subDocs,
  patientId,
  documentId,
  activeFactId = null,
}: SourcePaneViewProps) {
  const isPdf = mimeType === 'application/pdf' || documentName.toLowerCase().endsWith('.pdf');
  const [viewMode, setViewMode] = useState<'overlay' | 'ocr' | 'pdf'>('overlay');
  const highlight = new Set(highlightSpanIds);

  const activeRectRef = useRef<SVGRectElement | null>(null);
  const activeSpanRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (highlightSpanIds.length > 0) {
      if (viewMode === 'overlay' && activeRectRef.current) {
        activeRectRef.current.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
      } else if (viewMode === 'ocr' && activeSpanRef.current) {
        activeSpanRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  }, [highlightSpanIds, pageNumber, viewMode]);

  const aspectRatio = widthPx && heightPx ? `${widthPx} / ${heightPx}` : '612 / 792';

  return (
    <figure
      role="region"
      aria-label={`${label}: ${documentName}, page ${pageNumber}`}
      className="border border-[var(--color-rule-strong)] bg-[var(--color-paper-raised)] max-w-full"
      data-testid="source-pane"
    >
      {/* Sub-Document Jump Bar (Damani et al., 2026) */}
      {subDocs && subDocs.length > 0 ? (
        <nav
          aria-label="Packet Sub-Documents"
          className="flex flex-wrap items-center gap-1.5 border-b border-[var(--color-rule)] bg-[var(--color-paper)] px-3 py-2 text-xs"
        >
          <span className="mono text-[10px] uppercase tracking-wider text-[var(--color-ink-soft)] mr-1">
            Reports:
          </span>
          {subDocs.map((subDoc) => {
            const isCurrent = pageNumber >= subDoc.startPage && pageNumber <= subDoc.endPage;
            const pageRange =
              subDoc.startPage === subDoc.endPage
                ? `p.${subDoc.startPage}`
                : `p.${subDoc.startPage}–${subDoc.endPage}`;
            const href =
              patientId && documentId
                ? `/patients/${patientId}/sources/${documentId}?${activeFactId ? `fact=${activeFactId}&` : ''}page=${subDoc.startPage}`
                : `?page=${subDoc.startPage}`;
            return (
              <a
                key={subDoc.index}
                href={href}
                aria-current={isCurrent ? 'true' : undefined}
                className={`mono inline-flex items-center gap-1 rounded px-2 py-0.5 text-[11px] transition-colors ${
                  isCurrent
                    ? 'bg-[var(--color-ink)] text-white font-medium shadow-xs'
                    : 'bg-white border border-[var(--color-rule-strong)] text-[var(--color-ink-soft)] hover:text-[var(--color-ink)] hover:border-[var(--color-ink-soft)]'
                }`}
              >
                <span>{subDoc.category}</span>
                <span className="opacity-75">({pageRange})</span>
                {subDoc.statedDate ? (
                  <span className="opacity-60 text-[10px]">· {subDoc.statedDate}</span>
                ) : null}
              </a>
            );
          })}
        </nav>
      ) : null}

      {/* Header with View Mode Controls */}
      <figcaption className="mono flex flex-wrap items-center justify-between gap-2 border-b border-[var(--color-rule)] px-3 py-2 text-[11px] uppercase tracking-wider text-[var(--color-ink-soft)]">
        <div className="flex items-center gap-2">
          <span>
            {label} — {documentName} · page {pageNumber}
          </span>
          {highlightSpanIds.length > 0 ? (
            <span className="mono text-[10px] text-[var(--color-ink-soft)]" role="status">
              ({highlightSpanIds.length} highlighted)
            </span>
          ) : null}
        </div>

        {/* View Mode Toggle */}
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setViewMode('overlay')}
            aria-pressed={viewMode === 'overlay'}
            className={`mono rounded px-2 py-0.5 text-[10px] uppercase tracking-wider transition-colors ${
              viewMode === 'overlay'
                ? 'bg-[var(--color-ink)] text-white font-medium'
                : 'bg-white border border-[var(--color-rule)] text-[var(--color-ink-soft)] hover:text-[var(--color-ink)]'
            }`}
          >
            Scan + BBox
          </button>
          {isPdf && documentUrl ? (
            <button
              type="button"
              onClick={() => setViewMode('pdf')}
              aria-pressed={viewMode === 'pdf'}
              className={`mono rounded px-2 py-0.5 text-[10px] uppercase tracking-wider transition-colors ${
                viewMode === 'pdf'
                  ? 'bg-[var(--color-ink)] text-white font-medium'
                  : 'bg-white border border-[var(--color-rule)] text-[var(--color-ink-soft)] hover:text-[var(--color-ink)]'
              }`}
            >
              Original PDF
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => setViewMode('ocr')}
            aria-pressed={viewMode === 'ocr'}
            className={`mono rounded px-2 py-0.5 text-[10px] uppercase tracking-wider transition-colors ${
              viewMode === 'ocr'
                ? 'bg-[var(--color-ink)] text-white font-medium'
                : 'bg-white border border-[var(--color-rule)] text-[var(--color-ink-soft)] hover:text-[var(--color-ink)]'
            }`}
          >
            Structured OCR
          </button>
        </div>
      </figcaption>

      {/* Mode 1: Original Scan + SVG BBox Overlay */}
      {viewMode === 'overlay' ? (
        spans.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-8 text-center bg-white" style={{ minHeight: '360px' }}>
            <p className="mono text-xs uppercase tracking-wider text-amber-700 font-semibold">
              Quarantined / No Text Layer Extracted
            </p>
            <p className="mt-1.5 text-xs text-[var(--color-ink-soft)] max-w-md">
              This document does not currently have extractable text spans. Inspect the Original PDF view or submit manual transcription.
            </p>
          </div>
        ) : (
          <div
            tabIndex={0}
            role="document"
            aria-label={`Document scan and overlay for page ${pageNumber}`}
            className="relative w-full max-w-full overflow-hidden bg-white border border-t-0 border-[var(--color-rule-strong)] focus-visible:outline-2 focus-visible:outline-offset-1"
            style={{ aspectRatio, minHeight: '360px' }}
          >
            {/* Optional background image scan */}
            {documentUrl && (mimeType?.startsWith('image/') || documentUrl.match(/\.(png|jpe?g|webp|tiff?)/i)) ? (
              <img
                src={documentUrl}
                alt={`Original scan: ${documentName} page ${pageNumber}`}
                className="absolute inset-0 h-full w-full object-fill pointer-events-none"
              />
            ) : null}

            {/* Structured Page Canvas Text Layer (aligned 1:1 to span coordinates) */}
            <div className="absolute inset-0 p-0 m-0 pointer-events-none select-text">
              {spans.map((span) => (
                <span
                  key={span.id}
                  className="absolute font-mono select-text flex items-center leading-none text-slate-800"
                  style={{
                    left: `${(span.bbox.x * 100).toFixed(3)}%`,
                    top: `${(span.bbox.y * 100).toFixed(3)}%`,
                    width: `${(span.bbox.w * 100).toFixed(3)}%`,
                    height: `${(span.bbox.h * 100).toFixed(3)}%`,
                    fontSize: `clamp(9px, ${(span.bbox.h * 75).toFixed(1)}cqh, 15px)`,
                  }}
                >
                  {span.text}
                </span>
              ))}
            </div>

            {/* SVG Bounding Box Layer */}
            <svg
              viewBox="0 0 1000 1000"
              preserveAspectRatio="none"
              className="pointer-events-none absolute inset-0 h-full w-full z-10"
            >
              {spans.map((span) => {
                const isHighlight = highlight.has(span.id);
                const isFirstHighlight = isHighlight && span.id === highlightSpanIds[0];
                const x = Math.round(span.bbox.x * 1000);
                const y = Math.round(span.bbox.y * 1000);
                const w = Math.max(Math.round(span.bbox.w * 1000), 8);
                const h = Math.max(Math.round(span.bbox.h * 1000), 8);

                return (
                  <rect
                    key={span.id}
                    ref={isFirstHighlight ? activeRectRef : undefined}
                    data-span-id={span.id}
                    data-highlight={isHighlight ? 'true' : undefined}
                    data-testid={isHighlight ? 'active-highlight-box' : undefined}
                    x={x}
                    y={y}
                    width={w}
                    height={h}
                    rx={2}
                    className={
                      isHighlight
                        ? tone === 'conflict'
                          ? 'pointer-events-auto cursor-pointer fill-red-500/35 stroke-red-600 stroke-[2.5]'
                          : 'pointer-events-auto cursor-pointer fill-amber-500/35 stroke-amber-600 stroke-[2.5]'
                        : 'pointer-events-auto cursor-pointer fill-blue-500/5 stroke-slate-400/40 hover:fill-blue-500/20 hover:stroke-blue-500 stroke-1 stroke-dasharray-[3,3]'
                    }
                  >
                    <title>{`${span.text}${span.ocrConfidence !== null ? ` (OCR: ${(span.ocrConfidence * 100).toFixed(0)}%)` : ''}`}</title>
                  </rect>
                );
              })}
            </svg>
          </div>
        )
      ) : viewMode === 'pdf' && documentUrl ? (
        /* Mode 2: Native PDF Object View */
        <div
          tabIndex={0}
          role="document"
          aria-label={`PDF document viewer for ${documentName} page ${pageNumber}`}
          className="relative w-full max-w-full bg-white border border-t-0 border-[var(--color-rule-strong)]"
          style={{ minHeight: '520px', height: '70vh' }}
        >
          <object
            data={`${documentUrl}#page=${pageNumber}&toolbar=0&navpanes=0&view=Fit`}
            type="application/pdf"
            className="w-full h-full pointer-events-auto"
            aria-label={`Original PDF: ${documentName} page ${pageNumber}`}
          >
            <div className="flex flex-col items-center justify-center p-8 text-center text-xs text-[var(--color-ink-soft)]">
              <span>PDF preview unavailable in current browser plugin.</span>
              <a
                href={documentUrl}
                download={documentName}
                className="mt-2 text-[var(--color-accent)] underline decoration-dotted"
              >
                Download {documentName}
              </a>
            </div>
          </object>
        </div>
      ) : (
        /* Mode 3: Structured OCR Layer */
        <div
          tabIndex={0}
          role="document"
          aria-label={`Structured OCR text layer for page ${pageNumber}`}
          className="w-full max-w-full overflow-x-auto divide-y divide-[var(--color-rule)] border border-t-0 border-[var(--color-rule-strong)] bg-white p-3 font-mono text-xs select-text focus-visible:outline-2 focus-visible:outline-offset-1"
        >
          {spans.length > 0 ? (
            spans.map((span, idx) => {
              const isHighlight = highlight.has(span.id);
              const isFirstHighlight = isHighlight && span.id === highlightSpanIds[0];
              const confPercent =
                span.ocrConfidence !== null ? Math.round(span.ocrConfidence * 100) : null;

              return (
                <div
                  key={span.id}
                  ref={isFirstHighlight ? activeSpanRef : undefined}
                  data-span-id={span.id}
                  data-highlight={isHighlight ? 'true' : undefined}
                  className={`flex items-start gap-2.5 py-1.5 px-2 transition-colors ${
                    isHighlight
                      ? tone === 'conflict'
                        ? 'bg-red-50 border-l-4 border-red-600'
                        : 'bg-amber-50 border-l-4 border-amber-600'
                      : 'hover:bg-slate-50'
                  }`}
                >
                  <span className="mono shrink-0 text-[10px] text-[var(--color-ink-soft)] w-6 text-right pt-0.5">
                    #{idx + 1}
                  </span>
                  {confPercent !== null ? (
                    <span
                      className={`mono shrink-0 rounded px-1 text-[10px] font-medium pt-0.5 ${
                        confPercent >= 85
                          ? 'bg-emerald-100 text-emerald-800'
                          : confPercent >= 70
                          ? 'bg-amber-100 text-amber-800'
                          : 'bg-red-100 text-red-800'
                      }`}
                      title={`OCR Confidence: ${confPercent}%`}
                    >
                      {confPercent}%
                    </span>
                  ) : null}
                  <div className="min-w-0 flex-1">
                    <p className="whitespace-pre-wrap break-words overflow-x-auto max-w-full font-serif text-[13px] leading-relaxed text-[var(--color-ink)]">
                      {span.text}
                    </p>
                    <span className="mono text-[10px] text-[var(--color-ink-soft)]">
                      bbox: [{span.bbox.x.toFixed(2)}, {span.bbox.y.toFixed(2)},{' '}
                      {span.bbox.w.toFixed(2)}, {span.bbox.h.toFixed(2)}]
                    </span>
                  </div>
                </div>
              );
            })
          ) : (
            <p className="mono px-3 py-6 text-xs text-[var(--color-ink-soft)]">No text layer.</p>
          )}
        </div>
      )}
    </figure>
  );
}
