'use client';

import Link from 'next/link';
import * as Popover from '@radix-ui/react-popover';
import {
  ConfidenceBand,
  MachineBadge,
  StateBadge,
  factTypeLabel,
} from '@/components/evidence';
import {
  correctEvidenceAction,
  rejectEvidenceAction,
  reinstateEvidenceAction,
  verifyEvidenceAction,
} from '@/lib/actions';

export interface EvidenceRowData {
  evidenceFactId: string;
  patientId: string;
  factType: string;
  valueText: string;
  displayDate: string | null;
  state: string;
  documentId: string;
  documentName: string;
  pageNumber: number | null;
  confidenceBand: string;
  extractorKind: string;
  extractorName: string;
  extractorVersion: string;
  verbatimQuote: string;
  reviewerName: string | null;
  reviewedAt: string | null;
  correctsFactId: string | null;
  replacedByFactId: string | null;
  version: number;
}

export function EvidenceRow({ row }: { row: EvidenceRowData }) {
  const fmtDate = (iso: string | null) =>
    iso ? new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

  return (
    <li
      data-testid="evidence-row"
      data-fact-id={row.evidenceFactId}
      data-state={row.state}
      className="grid gap-x-4 gap-y-2 border-b border-[var(--color-rule)] px-3 py-3 md:grid-cols-[7.5rem_1fr_auto]"
    >
      <div className="mono pt-0.5 text-xs text-[var(--color-ink-soft)]">
        {fmtDate(row.displayDate)}
      </div>

      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <span className="mono text-[11px] uppercase tracking-wider text-[var(--color-ink-soft)]">
            {factTypeLabel(row.factType)}
          </span>
          <StateBadge state={row.state} compact />
          <ConfidenceBand band={row.confidenceBand} />
          {row.version > 1 ? (
            <span className="mono text-[11px] text-[var(--color-ink-soft)]">v{row.version}</span>
          ) : null}
        </div>

        <p className="mono mt-1.5 truncate text-[15px]" title={row.valueText}>
          {row.valueText}
        </p>

        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
          <Link
            href={`/patients/${row.patientId}/sources/${row.documentId}?fact=${row.evidenceFactId}${row.pageNumber ? `&page=${row.pageNumber}` : ''}`}
            className="mono text-[11px] text-[var(--color-accent)] underline decoration-dotted underline-offset-2 hover:decoration-solid"
          >
            {row.documentName}
            {row.pageNumber ? ` · p${row.pageNumber}` : ''}
          </Link>

          <Popover.Root>
            <Popover.Trigger asChild>
              <button
                type="button"
                aria-label="Show provenance"
                className="mono text-[11px] uppercase tracking-wider text-[var(--color-ink-soft)] underline decoration-dotted underline-offset-2 hover:text-[var(--color-ink)]"
              >
                why?
              </button>
            </Popover.Trigger>
            <Popover.Portal>
              <Popover.Content
                sideOffset={8}
                collisionPadding={12}
                className="z-50 w-[26rem] max-w-[92vw] border border-[var(--color-rule-strong)] bg-[var(--color-paper-raised)] p-4 text-sm shadow-[6px_6px_0_rgba(27,26,23,0.08)]"
              >
                <p className="doc-text border-l-2 border-[var(--color-accent)] pl-3 text-[15px] italic leading-relaxed">
                  “{row.verbatimQuote}”
                </p>
                <dl className="mono mt-3 grid grid-cols-[7rem_1fr] gap-y-1 text-[11px] text-[var(--color-ink-soft)]">
                  <dt>source</dt>
                  <dd className="text-[var(--color-ink)]">
                    {row.documentName}
                    {row.pageNumber ? ` · page ${row.pageNumber}` : ''}
                  </dd>
                  <dt>extraction</dt>
                  <dd className="text-[var(--color-ink)]">
                    {row.extractorName} · {row.extractorVersion}
                  </dd>
                  <dt>confidence</dt>
                  <dd className="text-[var(--color-ink)]">{row.confidenceBand} band</dd>
                  <dt>reviewer</dt>
                  <dd className="text-[var(--color-ink)]">
                    {row.reviewerName ? `${row.reviewerName} · ${fmtDate(row.reviewedAt)}` : 'no human review yet'}
                  </dd>
                </dl>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <MachineBadge kind={row.extractorKind} />
                  {row.correctsFactId ? (
                    <span className="mono text-[11px] text-[var(--color-state-corrected)]">
                      ✎ corrected from an earlier value
                    </span>
                  ) : null}
                  {row.replacedByFactId ? (
                    <Link
                      href={`/patients/${row.patientId}/sources/${row.documentId}?fact=${row.replacedByFactId}`}
                      className="mono text-[11px] text-[var(--color-state-corrected)] underline decoration-dotted"
                    >
                      → replaced by a later correction
                    </Link>
                  ) : null}
                </div>
                <Popover.Arrow className="fill-[var(--color-rule-strong)]" width={12} height={6} />
              </Popover.Content>
            </Popover.Portal>
          </Popover.Root>
        </div>
      </div>

      <div className="flex items-start justify-start gap-2 md:justify-end">
        {row.state === 'extracted' ? (
          <>
            <form action={verifyEvidenceAction}>
              <input type="hidden" name="factId" value={row.evidenceFactId} />
              <input type="hidden" name="patientId" value={row.patientId} />
              <button
                type="submit"
                data-testid="verify-evidence"
                className="mono border border-[var(--color-state-verified)] px-2.5 py-1 text-[11px] uppercase tracking-wider text-[var(--color-state-verified)] hover:bg-[#e8f3ea]"
              >
                verify
              </button>
            </form>
            <RejectForm row={row} />
            <CorrectForm row={row} />
          </>
        ) : null}

        {row.state === 'verified' ? (
          <span className="mono text-[11px] text-[var(--color-ink-soft)]">confirmed against source</span>
        ) : null}

        {row.state === 'conflicting' ? (
          <span className="mono text-[11px] text-[var(--color-state-conflicting)]">
            open the reconciliation room
          </span>
        ) : null}

        {row.state === 'rejected' ? (
          <form action={reinstateEvidenceAction} className="flex items-center gap-1">
            <input type="hidden" name="factId" value={row.evidenceFactId} />
            <input type="hidden" name="patientId" value={row.patientId} />
            <input
              name="reason"
              required
              minLength={3}
              placeholder="reason"
              className="w-40 border border-[var(--color-rule-strong)] bg-white px-2 py-1 text-[11px]"
            />
            <button type="submit" className="mono border border-[var(--color-ink-soft)] px-2.5 py-1 text-[11px] uppercase">
              reinstate
            </button>
          </form>
        ) : null}

        {row.state === 'corrected' || row.state === 'superseded' ? (
          <span className="mono text-[11px] text-[var(--color-ink-soft)]">retained for audit</span>
        ) : null}
      </div>
    </li>
  );
}

function RejectForm({ row }: { row: EvidenceRowData }) {
  return (
    <details className="relative">
      <summary className="mono cursor-pointer list-none border border-[var(--color-rule-strong)] px-2.5 py-1 text-[11px] uppercase tracking-wider text-[var(--color-ink-soft)] hover:text-[var(--color-ink)]">
        reject
      </summary>
      <form
        action={rejectEvidenceAction}
        className="absolute right-0 z-40 mt-1 w-72 border border-[var(--color-rule-strong)] bg-[var(--color-paper-raised)] p-3 shadow-[6px_6px_0_rgba(27,26,23,0.08)]"
      >
        <input type="hidden" name="factId" value={row.evidenceFactId} />
        <input type="hidden" name="patientId" value={row.patientId} />
        <label className="mono block text-[11px] uppercase tracking-wider text-[var(--color-ink-soft)]">
          Reason (required)
        </label>
        <textarea
          name="reason"
          required
          minLength={3}
          rows={2}
          className="mt-1 w-full border border-[var(--color-rule-strong)] bg-white px-2 py-1 text-xs"
        />
        <button
          type="submit"
          data-testid="reject-evidence"
          className="mono mt-2 w-full border border-[var(--color-state-rejected)] px-2.5 py-1 text-[11px] uppercase tracking-wider"
        >
          reject extraction
        </button>
      </form>
    </details>
  );
}

function CorrectForm({ row }: { row: EvidenceRowData }) {
  return (
    <details className="relative">
      <summary className="mono cursor-pointer list-none border border-[var(--color-state-corrected)] px-2.5 py-1 text-[11px] uppercase tracking-wider text-[var(--color-state-corrected)] hover:bg-[#e8eefb]">
        correct
      </summary>
      <form
        action={correctEvidenceAction}
        className="absolute right-0 z-40 mt-1 w-96 border border-[var(--color-rule-strong)] bg-[var(--color-paper-raised)] p-3 shadow-[6px_6px_0_rgba(27,26,23,0.08)]"
      >
        <input type="hidden" name="factId" value={row.evidenceFactId} />
        <input type="hidden" name="patientId" value={row.patientId} />
        <input type="hidden" name="verbatimQuote" value={row.verbatimQuote} />
        <label className="mono block text-[11px] uppercase tracking-wider text-[var(--color-ink-soft)]">
          Corrected value
        </label>
        <input
          name="valueText"
          required
          defaultValue={row.valueText}
          className="mono mt-1 w-full border border-[var(--color-rule-strong)] bg-white px-2 py-1 text-xs"
        />
        <p className="mono mt-2 text-[11px] text-[var(--color-ink-soft)]">
          The original extracted value is preserved and shown as “corrected from”.
        </p>
        <label className="mono mt-2 block text-[11px] uppercase tracking-wider text-[var(--color-ink-soft)]">
          Reason (required)
        </label>
        <textarea
          name="reason"
          required
          minLength={3}
          rows={2}
          className="mt-1 w-full border border-[var(--color-rule-strong)] bg-white px-2 py-1 text-xs"
        />
        <button
          type="submit"
          data-testid="correct-evidence"
          className="mono mt-2 w-full border border-[var(--color-state-corrected)] px-2.5 py-1 text-[11px] uppercase tracking-wider"
        >
          record correction
        </button>
      </form>
    </details>
  );
}
