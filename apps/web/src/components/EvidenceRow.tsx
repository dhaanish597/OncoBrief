'use client';

import React, { useId } from 'react';
import Link from 'next/link';
import { useFormStatus } from 'react-dom';
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
  supersedeEvidenceAction,
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

function ActionSubmitButton({
  label,
  testId,
  variant = 'default',
  disabled,
}: {
  label: string;
  testId?: string;
  variant?: 'default' | 'verified' | 'corrected' | 'rejected';
  disabled?: boolean;
}) {
  const { pending } = useFormStatus();
  const colors = {
    default: 'border-[var(--color-ink)] hover:bg-[var(--color-accent-soft)] text-[var(--color-ink)]',
    verified: 'border-[var(--color-state-verified)] text-[var(--color-state-verified)] hover:bg-[#e8f3ea]',
    corrected: 'border-[var(--color-state-corrected)] text-[var(--color-state-corrected)] hover:bg-[#e8eefb]',
    rejected: 'border-[var(--color-state-rejected)] text-[var(--color-state-rejected)] hover:bg-neutral-100',
  }[variant];

  return (
    <button
      type="submit"
      data-testid={testId}
      disabled={disabled || pending}
      aria-busy={pending}
      className={`mono border px-2.5 py-1 text-[11px] uppercase tracking-wider transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${colors}`}
    >
      {pending ? (
        <span className="flex items-center justify-center gap-1.5">
          <span className="inline-block animate-spin" aria-hidden="true">⟳</span>
          <span>Saving…</span>
        </span>
      ) : (
        label
      )}
    </button>
  );
}

export function EvidenceRow({ row }: { row: EvidenceRowData }) {
  const fmtDate = (iso: string | null) =>
    iso ? new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

  const isHistorical = row.state === 'superseded' || row.state === 'corrected';

  return (
    <li
      data-testid="evidence-row"
      data-fact-id={row.evidenceFactId}
      data-state={row.state}
      className={`grid gap-x-4 gap-y-2 border-b border-[var(--color-rule)] px-3 py-3 md:grid-cols-[7.5rem_1fr_auto] transition-colors ${
        isHistorical ? 'bg-[#faf8f4] opacity-85 border-dashed' : ''
      }`}
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
          {isHistorical ? (
            <span className="mono border border-[var(--color-rule-strong)] bg-neutral-100 px-1.5 py-0.2 text-[10px] uppercase text-[var(--color-ink-soft)]">
              historical · retained for audit
            </span>
          ) : null}
        </div>

        <div className="mono mt-1.5 text-[15px]" title={row.valueText}>
          {row.state === 'superseded' ? (
            <span className="line-through text-[var(--color-ink-soft)]">{row.valueText}</span>
          ) : (
            <span className="truncate block font-medium text-[var(--color-ink)]">{row.valueText}</span>
          )}
        </div>

        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
          <Link
            href={`/patients/${row.patientId}/sources/${row.documentId}?fact=${row.evidenceFactId}${row.pageNumber ? `&page=${row.pageNumber}` : ''}`}
            aria-label={`View ${row.documentName} page ${row.pageNumber ?? 1} in Source Inspector`}
            className="mono text-[11px] text-[var(--color-accent)] underline decoration-dotted underline-offset-2 hover:decoration-solid"
          >
            {row.documentName}
            {row.pageNumber ? ` · p${row.pageNumber}` : ''}
          </Link>

          <Popover.Root>
            <Popover.Trigger asChild>
              <button
                type="button"
                aria-label={`Show provenance for ${row.valueText}`}
                className="mono text-[11px] uppercase tracking-wider text-[var(--color-ink-soft)] underline decoration-dotted underline-offset-2 hover:text-[var(--color-ink)] focus-visible:outline-2 focus-visible:outline-offset-1"
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
                <p className="doc-text border-l-2 border-[var(--color-accent)] pl-3 text-[15px] italic leading-relaxed text-[var(--color-ink)]">
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

      <div className="flex flex-wrap items-start justify-start gap-2 md:justify-end">
        {row.state === 'extracted' ? (
          <>
            <form action={verifyEvidenceAction}>
              <input type="hidden" name="factId" value={row.evidenceFactId} />
              <input type="hidden" name="patientId" value={row.patientId} />
              <ActionSubmitButton
                label="verify"
                testId="verify-evidence"
                variant="verified"
              />
            </form>
            <CorrectForm row={row} />
            <SupersedeForm row={row} />
            <RejectForm row={row} />
          </>
        ) : null}

        {row.state === 'verified' ? (
          <>
            <span className="mono pt-1 text-[11px] text-[var(--color-ink-soft)]">confirmed against source</span>
            <CorrectForm row={row} />
            <SupersedeForm row={row} />
            <RejectForm row={row} />
          </>
        ) : null}

        {row.state === 'conflicting' ? (
          <Link
            href={`/patients/${row.patientId}/conflicts`}
            className="mono border border-[var(--color-state-conflicting)] bg-[#fff5f5] px-2.5 py-1 text-[11px] text-[var(--color-state-conflicting)] hover:underline focus-visible:outline-2"
          >
            open the reconciliation room →
          </Link>
        ) : null}

        {row.state === 'rejected' ? (
          <form action={reinstateEvidenceAction} className="flex flex-wrap items-center gap-1.5">
            <input type="hidden" name="factId" value={row.evidenceFactId} />
            <input type="hidden" name="patientId" value={row.patientId} />
            <input
              name="reason"
              required
              minLength={3}
              placeholder="justification to reinstate…"
              aria-label="Reinstatement justification"
              className="w-44 border border-[var(--color-rule-strong)] bg-white px-2 py-1 text-[11px] text-[var(--color-ink)]"
            />
            <ActionSubmitButton label="reinstate" />
          </form>
        ) : null}

        {row.state === 'corrected' || row.state === 'superseded' ? (
          <span className="mono pt-1 text-[11px] text-[var(--color-ink-soft)]">retained for audit</span>
        ) : null}
      </div>
    </li>
  );
}

function RejectForm({ row }: { row: EvidenceRowData }) {
  const reasonId = useId();
  const confirmId = useId();

  return (
    <details className="relative">
      <summary
        className="mono cursor-pointer list-none border border-[var(--color-rule-strong)] px-2.5 py-1 text-[11px] uppercase tracking-wider text-[var(--color-ink-soft)] hover:text-[var(--color-ink)] focus-visible:outline-2 focus-visible:outline-offset-1"
        aria-label={`Reject extraction: ${row.valueText}`}
      >
        reject
      </summary>
      <div className="fixed inset-x-4 bottom-4 z-50 max-h-[85vh] overflow-y-auto border border-[var(--color-rule-strong)] bg-[var(--color-paper-raised)] p-4 shadow-xl sm:absolute sm:inset-x-auto sm:bottom-auto sm:right-0 sm:mt-1 sm:w-80 sm:shadow-[6px_6px_0_rgba(27,26,23,0.08)]">
        <form action={rejectEvidenceAction}>
          <input type="hidden" name="factId" value={row.evidenceFactId} />
          <input type="hidden" name="patientId" value={row.patientId} />
          <h4 className="mono text-[11px] font-semibold uppercase tracking-wider text-[var(--color-ink)]">
            Reject this extraction
          </h4>
          <p className="mono mt-1 text-[10px] text-[var(--color-ink-soft)]">
            Removes this fact from active record readiness. Retained in ledger for audit.
          </p>

          <label
            htmlFor={reasonId}
            className="mono mt-2.5 block text-[11px] uppercase tracking-wider text-[var(--color-ink-soft)]"
          >
            Reason for rejection <span className="text-[var(--color-accent)]">*</span>
          </label>
          <textarea
            id={reasonId}
            name="reason"
            required
            minLength={3}
            rows={2}
            placeholder="e.g. Scanned OCR artefact, not valid medical metadata…"
            className="mono mt-1 w-full border border-[var(--color-rule-strong)] bg-white px-2 py-1 text-xs text-[var(--color-ink)] focus:border-[var(--color-accent)] focus:outline-hidden"
          />

          <label
            htmlFor={confirmId}
            className="mono mt-2 flex items-start gap-2 text-[10px] text-[var(--color-ink-soft)]"
          >
            <input
              id={confirmId}
              type="checkbox"
              required
              className="mt-0.5 h-3.5 w-3.5 rounded border-[var(--color-rule-strong)]"
            />
            <span>I confirm this fact should be removed from active records</span>
          </label>

          <div className="mt-3">
            <ActionSubmitButton
              label="reject extraction"
              testId="reject-evidence"
              variant="rejected"
            />
          </div>
        </form>
      </div>
    </details>
  );
}

function CorrectForm({ row }: { row: EvidenceRowData }) {
  const valueId = useId();
  const reasonId = useId();

  return (
    <details className="relative">
      <summary
        className="mono cursor-pointer list-none border border-[var(--color-state-corrected)] px-2.5 py-1 text-[11px] uppercase tracking-wider text-[var(--color-state-corrected)] hover:bg-[#e8eefb] focus-visible:outline-2 focus-visible:outline-offset-1"
        aria-label={`Correct fact: ${row.valueText}`}
      >
        correct
      </summary>
      <div className="fixed inset-x-4 bottom-4 z-50 max-h-[85vh] overflow-y-auto border border-[var(--color-rule-strong)] bg-[var(--color-paper-raised)] p-4 shadow-xl sm:absolute sm:inset-x-auto sm:bottom-auto sm:right-0 sm:mt-1 sm:w-96 sm:shadow-[6px_6px_0_rgba(27,26,23,0.08)]">
        <form action={correctEvidenceAction}>
          <input type="hidden" name="factId" value={row.evidenceFactId} />
          <input type="hidden" name="patientId" value={row.patientId} />
          <input type="hidden" name="verbatimQuote" value={row.verbatimQuote} />

          <h4 className="mono text-[11px] font-semibold uppercase tracking-wider text-[var(--color-ink)]">
            Author human correction
          </h4>

          <label
            htmlFor={valueId}
            className="mono mt-2 block text-[11px] uppercase tracking-wider text-[var(--color-ink-soft)]"
          >
            Corrected value <span className="text-[var(--color-accent)]">*</span>
          </label>
          <input
            id={valueId}
            name="valueText"
            required
            defaultValue={row.valueText}
            className="mono mt-1 w-full border border-[var(--color-rule-strong)] bg-white px-2 py-1 text-xs text-[var(--color-ink)] focus:border-[var(--color-accent)] focus:outline-hidden"
          />
          <p className="mono mt-1 text-[10px] text-[var(--color-ink-soft)]">
            Original extracted value is preserved and displayed as “corrected from”.
          </p>

          <label
            htmlFor={reasonId}
            className="mono mt-2.5 block text-[11px] uppercase tracking-wider text-[var(--color-ink-soft)]"
          >
            Reason for correction <span className="text-[var(--color-accent)]">*</span>
          </label>
          <textarea
            id={reasonId}
            name="reason"
            required
            minLength={3}
            rows={2}
            placeholder="Clinical justification for replacement value…"
            className="mono mt-1 w-full border border-[var(--color-rule-strong)] bg-white px-2 py-1 text-xs text-[var(--color-ink)] focus:border-[var(--color-accent)] focus:outline-hidden"
          />

          <div className="mt-3">
            <ActionSubmitButton
              label="record correction"
              testId="correct-evidence"
              variant="corrected"
            />
          </div>
        </form>
      </div>
    </details>
  );
}

function SupersedeForm({ row }: { row: EvidenceRowData }) {
  const reasonId = useId();
  const confirmId = useId();

  return (
    <details className="relative">
      <summary
        className="mono cursor-pointer list-none border border-[var(--color-rule-strong)] px-2.5 py-1 text-[11px] uppercase tracking-wider text-[var(--color-ink-soft)] hover:text-[var(--color-ink)] focus-visible:outline-2 focus-visible:outline-offset-1"
        aria-label={`Mark fact superseded: ${row.valueText}`}
      >
        supersede
      </summary>
      <div className="fixed inset-x-4 bottom-4 z-50 max-h-[85vh] overflow-y-auto border border-[var(--color-rule-strong)] bg-[var(--color-paper-raised)] p-4 shadow-xl sm:absolute sm:inset-x-auto sm:bottom-auto sm:right-0 sm:mt-1 sm:w-80 sm:shadow-[6px_6px_0_rgba(27,26,23,0.08)]">
        <form action={supersedeEvidenceAction}>
          <input type="hidden" name="factId" value={row.evidenceFactId} />
          <input type="hidden" name="patientId" value={row.patientId} />

          <h4 className="mono text-[11px] font-semibold uppercase tracking-wider text-[var(--color-ink)]">
            Mark as superseded
          </h4>
          <p className="mono mt-1 text-[10px] text-[var(--color-ink-soft)]">
            Marks this fact as superseded by newer or repeat evidence. Retained for audit; removed from active calculations.
          </p>

          <label
            htmlFor={reasonId}
            className="mono mt-2.5 block text-[11px] uppercase tracking-wider text-[var(--color-ink-soft)]"
          >
            Reason for superseding <span className="text-[var(--color-accent)]">*</span>
          </label>
          <textarea
            id={reasonId}
            name="reason"
            required
            minLength={3}
            rows={2}
            placeholder="e.g. Superseded by newer repeat biopsy or revised consultation…"
            className="mono mt-1 w-full border border-[var(--color-rule-strong)] bg-white px-2 py-1 text-xs text-[var(--color-ink)] focus:border-[var(--color-accent)] focus:outline-hidden"
          />

          <label
            htmlFor={confirmId}
            className="mono mt-2 flex items-start gap-2 text-[10px] text-[var(--color-ink-soft)]"
          >
            <input
              id={confirmId}
              type="checkbox"
              required
              className="mt-0.5 h-3.5 w-3.5 rounded border-[var(--color-rule-strong)]"
            />
            <span>I confirm this fact is superseded by newer clinical evidence</span>
          </label>

          <div className="mt-3">
            <ActionSubmitButton
              label="mark superseded"
              testId="supersede-evidence"
            />
          </div>
        </form>
      </div>
    </details>
  );
}
