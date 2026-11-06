'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { GuidelineDocumentRow } from '@oncobrief/db';
import { uploadGuidelinePdfAction } from '@/lib/actions';

export interface GuidelineLibraryPanelProps {
  patientId: string;
  guidelines: GuidelineDocumentRow[];
  canUpload: boolean;
}

export function GuidelineLibraryPanel({
  patientId,
  guidelines,
  canUpload,
}: GuidelineLibraryPanelProps) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ ok: boolean; message: string } | null>(null);

  async function handleUpload(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    setBusy(true);
    setStatus(null);
    try {
      const res = await uploadGuidelinePdfAction(fd);
      if (res.ok) {
        setStatus({
          ok: true,
          message: `Indexed guideline "${res.title}" (${res.spansIndexed} spans across ${res.pageCount} page(s)). Available for [G#] citation.`,
        });
        form.reset();
        router.refresh();
      } else {
        setStatus({ ok: false, message: res.error || 'Failed to upload guideline PDF.' });
      }
    } catch (err: unknown) {
      setStatus({
        ok: false,
        message: err instanceof Error ? err.message : 'Guideline upload failed.',
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      aria-label="Institutional Guideline & SOP Reference Library"
      data-testid="guideline-library-panel"
      className="mt-8 border border-[var(--color-rule-strong)] bg-[var(--color-paper-raised)] p-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--color-rule)] pb-3">
        <div>
          <h2 className="mono text-sm font-semibold uppercase tracking-wider text-[var(--color-ink)]">
            Institutional Guideline &amp; SOP Reference Library (NCG / ICMR / Hospital SOP)
          </h2>
          <p className="mono mt-1 text-xs text-[var(--color-ink-soft)]">
            Reference-only governance library. Indexed spans power <code>[G#]</code> citations in the Clinician Productivity Studio and AI Assistant without generating clinical orders.
          </p>
        </div>
        <span className="mono border border-[var(--color-rule)] bg-white px-2.5 py-1 text-[11px] text-[var(--color-ink-soft)]">
          {guidelines.length} indexed SOP{guidelines.length === 1 ? '' : 's'}
        </span>
      </div>

      {/* Existing Indexed Guidelines */}
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        {guidelines.map((g, idx) => (
          <div
            key={g.id}
            data-testid={`guideline-card-${g.code}`}
            className="border border-[var(--color-rule)] bg-white p-3 text-xs flex flex-col justify-between gap-2"
          >
            <div>
              <div className="flex items-center justify-between gap-2">
                <span className="mono font-semibold text-blue-800 bg-blue-50 border border-blue-200 px-1.5 py-0.5 text-[10px]">
                  [G{idx + 1}] {g.code}
                </span>
                <span className="mono text-[10px] text-[var(--color-ink-soft)]">
                  {g.issuingBody} · {g.versionLabel} ({g.publicationDate})
                </span>
              </div>
              <p className="mt-1.5 font-medium text-[var(--color-ink)]">{g.title}</p>
            </div>
            <div className="flex items-center justify-between border-t border-[var(--color-rule)] pt-2">
              <span className="mono text-[10px] text-emerald-700">✓ Active Reference</span>
              <Link
                href={`/patients/${patientId}/sources?guideline=${g.id}&page=1`}
                data-testid={`inspect-guideline-${g.code}`}
                className="mono text-[11px] text-[var(--color-accent)] underline decoration-dotted hover:decoration-solid"
              >
                Inspect indexed [G#] spans →
              </Link>
            </div>
          </div>
        ))}
      </div>

      {/* Interactive Guideline PDF Upload Form (TASK-018) */}
      {canUpload ? (
        <details className="mt-4 border border-[var(--color-rule)] bg-white p-4" data-testid="guideline-upload-details">
          <summary className="mono cursor-pointer text-xs font-semibold uppercase tracking-wider text-[var(--color-ink)]">
            + Upload &amp; Index New Institutional Guideline / NCG SOP PDF
          </summary>
          <form onSubmit={handleUpload} className="mt-3 space-y-3" data-testid="guideline-upload-form">
            <input type="hidden" name="patientId" value={patientId} />
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <label className="mono block text-[11px] text-[var(--color-ink-soft)]">
                SOP Code
                <input
                  name="code"
                  required
                  placeholder="e.g. NCG-BREAST-2026"
                  className="mono mt-1 block w-full border border-[var(--color-rule-strong)] bg-white px-2 py-1 text-xs text-[var(--color-ink)]"
                />
              </label>
              <label className="mono block text-[11px] text-[var(--color-ink-soft)]">
                Title
                <input
                  name="title"
                  required
                  placeholder="e.g. NCG Breast Cancer Workup SOP"
                  className="mono mt-1 block w-full border border-[var(--color-rule-strong)] bg-white px-2 py-1 text-xs text-[var(--color-ink)]"
                />
              </label>
              <label className="mono block text-[11px] text-[var(--color-ink-soft)]">
                Issuing Body
                <input
                  name="issuingBody"
                  required
                  defaultValue="National Cancer Grid (NCG)"
                  className="mono mt-1 block w-full border border-[var(--color-rule-strong)] bg-white px-2 py-1 text-xs text-[var(--color-ink)]"
                />
              </label>
              <label className="mono block text-[11px] text-[var(--color-ink-soft)]">
                Version Label
                <input
                  name="versionLabel"
                  required
                  defaultValue="v2026.1"
                  className="mono mt-1 block w-full border border-[var(--color-rule-strong)] bg-white px-2 py-1 text-xs text-[var(--color-ink)]"
                />
              </label>
            </div>
            <div className="flex flex-wrap items-end justify-between gap-3 pt-1">
              <label className="mono block text-[11px] text-[var(--color-ink-soft)]">
                Guideline PDF / Text File
                <input
                  type="file"
                  name="file"
                  required
                  accept=".pdf,.txt,application/pdf,text/plain"
                  aria-label="Guideline PDF file"
                  className="mono mt-1 block text-xs text-[var(--color-ink)]"
                />
              </label>
              <button
                type="submit"
                disabled={busy}
                data-testid="upload-guideline-submit"
                className="mono border border-[var(--color-ink)] bg-[var(--color-ink)] px-4 py-1.5 text-xs uppercase tracking-wider text-white hover:bg-black disabled:opacity-50"
              >
                {busy ? 'Indexing Spans…' : 'Upload & Index SOP'}
              </button>
            </div>
            {status ? (
              <p
                role={status.ok ? 'status' : 'alert'}
                data-testid="guideline-upload-status"
                className={`mono text-xs p-2 border ${
                  status.ok
                    ? 'border-emerald-300 bg-emerald-50 text-emerald-900'
                    : 'border-red-300 bg-red-50 text-red-900'
                }`}
              >
                {status.message}
              </p>
            ) : null}
          </form>
        </details>
      ) : null}
    </section>
  );
}
