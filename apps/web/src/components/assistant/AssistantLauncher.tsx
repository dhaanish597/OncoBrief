'use client';

import { Suspense, useState } from 'react';
import { AssistantPanel } from './AssistantPanel';

/**
 * The global floating entry point. Mounted once in the authenticated app
 * layout so every page gets the assistant without duplicating it.
 */
export function AssistantLauncher() {
  const [open, setOpen] = useState(false);

  return (
    <>
      {open ? (
        <Suspense fallback={null}>
          <AssistantPanel onClose={() => setOpen(false)} />
        </Suspense>
      ) : null}

      <button
        type="button"
        data-testid="assistant-launcher"
        aria-label="Ask OncoBrief"
        onClick={() => setOpen((o) => !o)}
        className="no-print fixed bottom-5 right-5 z-40 flex items-center gap-2 border border-[var(--color-accent)] bg-[var(--color-accent)] px-4 py-3 text-sm font-medium text-white shadow-[0_6px_20px_rgba(27,26,23,0.24)] transition-transform hover:translate-y-[-1px]"
      >
        <span aria-hidden>&#128172;</span>
        <span className="mono text-[11px] uppercase tracking-wider">Ask OncoBrief</span>
      </button>
    </>
  );
}
