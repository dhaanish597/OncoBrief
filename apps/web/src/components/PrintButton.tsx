'use client';

export function PrintButton({ label = 'Print / PDF' }: { label?: string }) {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="mono border border-[var(--color-rule-strong)] bg-white px-2.5 py-1 text-[11px] uppercase hover:bg-[var(--color-accent-soft)]"
      title="Print consultation packet or save as PDF"
    >
      {label}
    </button>
  );
}
