'use client';

import React, { useId } from 'react';
import { useFormStatus } from 'react-dom';
import { resolveConflictAction } from '@/lib/actions';

function SubmitButton({
  label,
  testId,
  disabled,
}: {
  label: string;
  testId: string;
  disabled?: boolean;
}) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      data-testid={testId}
      disabled={disabled || pending}
      aria-busy={pending}
      className="mono w-full border border-[var(--color-ink)] px-3 py-2 text-[11px] uppercase tracking-wider transition-colors hover:bg-[var(--color-accent-soft)] focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {pending ? (
        <span className="flex items-center justify-center gap-2">
          <span className="inline-block animate-spin" aria-hidden="true">⟳</span>
          <span>Recording decision…</span>
        </span>
      ) : (
        label
      )}
    </button>
  );
}

export function OutcomeCard({
  title,
  badge,
  description,
  action,
}: {
  title: string;
  badge?: string;
  description: string;
  action: React.ReactNode;
}) {
  return (
    <div className="flex flex-col justify-between border border-[var(--color-rule-strong)] bg-[var(--color-paper-raised)] p-4 shadow-xs">
      <div>
        <div className="flex items-start justify-between gap-2">
          <h4 className="text-sm font-semibold tracking-tight text-[var(--color-ink)]">{title}</h4>
          {badge ? (
            <span className="mono border border-[var(--color-rule-strong)] px-1.5 py-0.5 text-[10px] uppercase text-[var(--color-ink-soft)]">
              {badge}
            </span>
          ) : null}
        </div>
        <p className="mt-1.5 text-xs leading-relaxed text-[var(--color-ink-soft)]">{description}</p>
      </div>
      <div className="mt-4 border-t border-[var(--color-rule)] pt-3">{action}</div>
    </div>
  );
}

export function OutcomeForm({
  conflictId,
  patientId,
  resolutionKind,
  buttonLabel,
  testId,
  canResolve,
  children,
}: {
  conflictId: string;
  patientId: string;
  resolutionKind: string;
  buttonLabel: string;
  testId: string;
  canResolve: boolean;
  children?: React.ReactNode;
}) {
  const reasonId = useId();

  return (
    <form action={resolveConflictAction} className="space-y-3">
      <input type="hidden" name="patientId" value={patientId} />
      <input type="hidden" name="conflictId" value={conflictId} />
      <input type="hidden" name="resolutionKind" value={resolutionKind} />

      {children}

      <div>
        <label
          htmlFor={reasonId}
          className="mono block text-[11px] uppercase tracking-wider text-[var(--color-ink-soft)]"
        >
          Reason for decision <span className="text-[var(--color-accent)]">*</span>
        </label>
        <textarea
          id={reasonId}
          name="reason"
          required
          minLength={3}
          rows={2}
          disabled={!canResolve}
          placeholder="Clinical or administrative justification (min 3 chars)…"
          className="mono mt-1 w-full border border-[var(--color-rule-strong)] bg-white px-2.5 py-1.5 text-xs text-[var(--color-ink)] placeholder:text-[var(--color-ink-soft)]/60 focus:border-[var(--color-accent)] focus:outline-hidden disabled:bg-neutral-100 disabled:text-neutral-500"
        />
        <p className="mono mt-0.5 text-[10px] text-[var(--color-ink-soft)]">
          Permanent entry in tamper-evident ledger and audit hash-chain.
        </p>
      </div>

      <SubmitButton
        label={buttonLabel}
        testId={testId}
        disabled={!canResolve}
      />
    </form>
  );
}
