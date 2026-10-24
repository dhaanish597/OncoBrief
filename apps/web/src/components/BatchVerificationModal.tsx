'use client';

import React, { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  CheckCheck,
  X,
  AlertTriangle,
  FileText,
  ShieldCheck,
  Loader2,
} from 'lucide-react';
import { verifyEvidenceBatchAction } from '@/lib/actions';
import { factTypeLabel } from '@/components/evidence';

export interface BatchCandidateFact {
  id: string;
  factType: string;
  valueText: string;
  verbatimQuote: string;
  documentId: string;
  documentName: string;
  pageNumber: number | null;
  confidenceBand: string;
  confidenceRaw: number | null;
}

export interface BatchVerificationModalProps {
  patientId: string;
  candidateFacts: BatchCandidateFact[];
  isOpen: boolean;
  onClose: () => void;
}

export function BatchVerificationModal({
  patientId,
  candidateFacts,
  isOpen,
  onClose,
}: BatchVerificationModalProps) {
  const router = useRouter();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    () => new Set(candidateFacts.map((f) => f.id)),
  );
  const [reason, setReason] = useState('Clinician confirmed batch in review modal');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  if (!isOpen) return null;

  const toggleFact = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setSelectedIds(next);
  };

  const selectAll = () => {
    setSelectedIds(new Set(candidateFacts.map((f) => f.id)));
  };

  const deselectAll = () => {
    setSelectedIds(new Set());
  };

  const handleConfirm = () => {
    if (selectedIds.size === 0) {
      setErrorMsg('Please select at least one fact to verify.');
      return;
    }
    setErrorMsg(null);

    startTransition(async () => {
      try {
        const fd = new FormData();
        fd.append('patientId', patientId);
        fd.append('reason', reason);
        fd.append('factIdsJson', JSON.stringify(Array.from(selectedIds)));

        const res = await verifyEvidenceBatchAction(fd);
        if (res.ok) {
          router.refresh();
          onClose();
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Batch verification failed';
        setErrorMsg(msg);
      }
    });
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="batch-modal-title"
      data-testid="batch-verification-modal"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 sm:p-6"
    >
      <div className="relative w-full max-w-3xl max-h-[90vh] flex flex-col rounded-2xl bg-white shadow-2xl border border-slate-200 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4 bg-slate-50/80">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600 text-white shadow-2xs">
              <CheckCheck className="h-5 w-5" />
            </span>
            <div>
              <h2 id="batch-modal-title" className="text-sm font-bold text-slate-900">
                Batch Verification Review ({selectedIds.size} of {candidateFacts.length} facts selected)
              </h2>
              <p className="text-xs text-slate-500">
                Inspect verbatim supporting quotes before confirming atomic verification into the Evidence Ledger.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isPending}
            className="rounded-lg p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
            aria-label="Close modal"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Selection Toolbar */}
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-2.5 bg-slate-50/40 text-xs">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={selectAll}
              disabled={isPending}
              className="text-blue-600 hover:text-blue-800 font-medium"
            >
              Select All ({candidateFacts.length})
            </button>
            <span className="text-slate-300">|</span>
            <button
              type="button"
              onClick={deselectAll}
              disabled={isPending}
              className="text-slate-600 hover:text-slate-800"
            >
              Deselect All
            </button>
          </div>
          <div className="flex items-center gap-1.5 text-emerald-700 text-[11px] font-medium bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
            <ShieldCheck className="h-3.5 w-3.5" />
            <span>Server Eligibility: OCR Confidence &ge; 90% · No Conflicts</span>
          </div>
        </div>

        {/* Scrollable Fact Review List */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
          {errorMsg && (
            <div
              role="alert"
              className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700 flex items-start gap-2"
            >
              <AlertTriangle className="h-4 w-4 flex-shrink-0 text-red-600 mt-0.5" />
              <div>
                <strong>Verification error:</strong> {errorMsg}
              </div>
            </div>
          )}

          {candidateFacts.map((fact) => {
            const isSelected = selectedIds.has(fact.id);
            const confPercent = fact.confidenceRaw !== null ? Math.round(fact.confidenceRaw * 100) : 95;

            return (
              <div
                key={fact.id}
                data-testid="batch-fact-item"
                data-selected={isSelected}
                onClick={() => !isPending && toggleFact(fact.id)}
                className={`cursor-pointer rounded-xl border p-3 text-xs transition-all ${
                  isSelected
                    ? 'border-blue-400 bg-blue-50/40 shadow-xs'
                    : 'border-slate-200 bg-white opacity-60 hover:opacity-100'
                }`}
              >
                <div className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => toggleFact(fact.id)}
                    disabled={isPending}
                    aria-label={`Select ${factTypeLabel(fact.factType)} fact`}
                    className="mt-1 h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center justify-between gap-1">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-slate-900">
                          {factTypeLabel(fact.factType)}
                        </span>
                        <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] text-slate-700">
                          {fact.valueText}
                        </span>
                      </div>
                      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
                        {confPercent}% OCR
                      </span>
                    </div>

                    <p className="mt-1.5 text-[11px] text-slate-700 italic bg-white/80 p-2 rounded border border-slate-200/60 font-sans">
                      &ldquo;{fact.verbatimQuote}&rdquo;
                    </p>

                    <div className="mt-2 flex items-center justify-between text-[10px] text-slate-500">
                      <span className="flex items-center gap-1">
                        <FileText className="h-3 w-3 text-slate-400" />
                        <span className="font-medium text-slate-700">{fact.documentName}</span>
                        <span>(Page {fact.pageNumber ?? 1})</span>
                      </span>
                      <span className="mono text-slate-400">ID: {fact.id.slice(0, 8)}</span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="border-t border-slate-200 px-6 py-4 bg-slate-50/80 flex flex-wrap items-center justify-between gap-3">
          <div className="w-full sm:w-auto">
            <label className="block text-[11px] font-medium text-slate-600 mb-1">
              Verification Audit Reason (Required for Append-Only Ledger)
            </label>
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              disabled={isPending}
              placeholder="Reason for verification"
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-800 w-full sm:w-80 focus:border-blue-500 focus:outline-none"
            />
          </div>

          <div className="flex items-center gap-2 ml-auto">
            <button
              type="button"
              onClick={onClose}
              disabled={isPending}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={isPending || selectedIds.size === 0}
              data-testid="confirm-batch-verify-btn"
              className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2 text-xs font-semibold text-white shadow-xs hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {isPending ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  <span>Verifying {selectedIds.size} facts…</span>
                </>
              ) : (
                <>
                  <CheckCheck className="h-3.5 w-3.5" />
                  <span>Confirm Verification ({selectedIds.size})</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
