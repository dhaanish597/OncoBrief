'use client';

import { useState } from 'react';

export function ExpandableClinicalCard({
  title,
  badge,
  defaultExpanded = false,
  children,
  preview,
}: {
  title: string;
  badge?: string | number;
  defaultExpanded?: boolean;
  children: React.ReactNode;
  preview?: React.ReactNode;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  return (
    <div className="border border-[var(--color-rule-strong)] bg-[var(--color-paper-raised)] transition-shadow">
      <button
        type="button"
        onClick={() => setExpanded((prev) => !prev)}
        aria-expanded={expanded}
        className="flex w-full items-center justify-between px-5 py-4 text-left hover:bg-[var(--color-paper)] focus:outline-none focus-visible:ring-1 focus-visible:ring-[var(--color-accent)]"
      >
        <div className="flex items-center gap-3">
          <span className="mono text-xs text-[var(--color-ink-soft)]">
            {expanded ? '▼' : '▶'}
          </span>
          <h3 className="cc-card-title text-[var(--color-ink)]">
            {title}
          </h3>
          {badge !== undefined ? (
            <span className="mono border border-[var(--color-rule-strong)] bg-[var(--color-paper)] px-2 py-0.5 text-[11px] text-[var(--color-ink-soft)]">
              {badge}
            </span>
          ) : null}
        </div>

        <div className="flex items-center gap-2">
          <span className="mono text-[11px] uppercase tracking-wider text-[var(--color-ink-soft)]">
            {expanded ? 'Collapse' : 'Expand'}
          </span>
        </div>
      </button>

      {/* When collapsed, optionally show concise initial overview */}
      {!expanded && preview ? (
        <div className="border-t border-[var(--color-rule)] bg-[var(--color-paper)] px-5 py-3">
          {preview}
        </div>
      ) : null}

      {/* Expanded detailed content */}
      {expanded ? (
        <div className="border-t border-[var(--color-rule)] px-5 py-4">
          {children}
        </div>
      ) : null}
    </div>
  );
}
