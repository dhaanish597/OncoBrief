'use client';

import React from 'react';
import Link from 'next/link';
import {
  CheckCircle2,
  AlertTriangle,
  XCircle,
  ArrowRight,
  ShieldAlert,
  FileCheck,
  CheckCheck,
} from 'lucide-react';
import type { ReadinessBand } from '@oncobrief/domain';

export interface GuidedReadinessBannerProps {
  patientId: string;
  readinessBand: ReadinessBand | string | null;
  conflictingCount: number;
  missingRequiredCount: number;
  unverifiedCount: number;
  eligibleBatchCount: number;
  onOpenBatchVerify: () => void;
}

export function GuidedReadinessBanner({
  patientId,
  readinessBand,
  conflictingCount,
  missingRequiredCount,
  unverifiedCount,
  eligibleBatchCount,
  onOpenBatchVerify,
}: GuidedReadinessBannerProps) {
  const isReady = readinessBand === 'ready';
  const isBlocked = readinessBand === 'blocked' || conflictingCount > 0;

  const bandConfig = isReady
    ? {
        border: 'border-emerald-300 bg-emerald-50/70',
        badge: 'bg-emerald-100 text-emerald-800 border-emerald-300',
        icon: <CheckCircle2 className="h-4 w-4 text-emerald-600" />,
        label: 'RECORD READY FOR CONSULTATION',
        summary: 'All required intake documents confirmed and evidence facts verified.',
      }
    : isBlocked
    ? {
        border: 'border-red-300 bg-red-50/70',
        badge: 'bg-red-100 text-red-800 border-red-300',
        icon: <XCircle className="h-4 w-4 text-red-600" />,
        label: 'CONSULTATION BLOCKED',
        summary: 'Actionable documentation blockers require human resolution before consultation sign-off.',
      }
    : {
        border: 'border-amber-300 bg-amber-50/70',
        badge: 'bg-amber-100 text-amber-800 border-amber-300',
        icon: <AlertTriangle className="h-4 w-4 text-amber-600" />,
        label: 'GAPS DETECTED',
        summary: 'Documentation requirements or unverified evidence facts require review.',
      };

  return (
    <div
      data-testid="guided-readiness-banner"
      className={`rounded-xl border p-4 shadow-xs transition-all ${bandConfig.border}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-white shadow-2xs">
            {bandConfig.icon}
          </span>
          <div>
            <div className="flex items-center gap-2">
              <span
                className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider ${bandConfig.badge}`}
              >
                {bandConfig.label}
              </span>
            </div>
            <p className="mt-0.5 text-xs text-slate-700 font-medium">
              {bandConfig.summary}
            </p>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex flex-wrap items-center gap-2">
          {eligibleBatchCount > 0 ? (
            <button
              type="button"
              onClick={onOpenBatchVerify}
              data-testid="open-batch-verify-btn"
              className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-blue-700 transition-colors"
            >
              <CheckCheck className="h-3.5 w-3.5" />
              <span>Review & Verify High-Confidence Batch ({eligibleBatchCount})</span>
            </button>
          ) : null}

          <Link
            href={`/patients/${patientId}/record-map`}
            className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors"
          >
            <span>Record Map</span>
            <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
      </div>

      {/* Blockers & Resolution Prompts */}
      {(!isReady || conflictingCount > 0 || missingRequiredCount > 0 || unverifiedCount > 0) && (
        <div className="mt-3 flex flex-wrap items-center gap-2 pt-2 border-t border-slate-200/60 text-xs">
          <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
            Next steps:
          </span>

          {conflictingCount > 0 ? (
            <Link
              href={`/patients/${patientId}/conflicts`}
              className="inline-flex items-center gap-1.5 rounded-md border border-red-200 bg-white px-2.5 py-1 font-medium text-red-700 hover:bg-red-50 transition-colors shadow-2xs"
            >
              <ShieldAlert className="h-3.5 w-3.5 text-red-600" />
              <span>{conflictingCount} Unresolved Source Conflict — Reconcile</span>
              <ArrowRight className="h-3 w-3" />
            </Link>
          ) : null}

          {missingRequiredCount > 0 ? (
            <Link
              href={`/patients/${patientId}/record-map`}
              className="inline-flex items-center gap-1.5 rounded-md border border-amber-200 bg-white px-2.5 py-1 font-medium text-amber-800 hover:bg-amber-50 transition-colors shadow-2xs"
            >
              <FileCheck className="h-3.5 w-3.5 text-amber-600" />
              <span>{missingRequiredCount} Required Document Missing — Create Task</span>
              <ArrowRight className="h-3 w-3" />
            </Link>
          ) : null}

          {unverifiedCount > 0 ? (
            <span className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-slate-600 text-[11px]">
              {unverifiedCount} total evidence facts pending clinician sign-off
            </span>
          ) : null}
        </div>
      )}
    </div>
  );
}
