'use client';

import React from 'react';
import Link from 'next/link';
import { Calendar, FileText, AlertCircle, Clock, Sparkles } from 'lucide-react';
import type { IntervalDeltaSummary } from '@oncobrief/domain';

export interface ChangesSinceLastVisitBannerProps {
  patientId: string;
  interval: IntervalDeltaSummary;
  currentFilter: string;
}

export function ChangesSinceLastVisitBanner({
  patientId,
  interval,
  currentFilter,
}: ChangesSinceLastVisitBannerProps) {
  const isSinceLastVisitActive = currentFilter === 'since_last_visit';
  const hasBaseline = interval.baselineDate !== null;

  function formatDate(iso: string | null) {
    if (!iso) return null;
    try {
      const d = new Date(iso);
      return d.toLocaleDateString('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      });
    } catch {
      return iso;
    }
  }

  const formattedBaseline = formatDate(interval.baselineDate);

  return (
    <div
      data-testid="changes-since-last-visit-banner"
      className="rounded-xl border border-blue-200 bg-gradient-to-r from-blue-50/70 via-indigo-50/40 to-slate-50 p-4 shadow-xs"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-600 text-white shadow-2xs">
            <Sparkles className="h-4 w-4" />
          </span>
          <div>
            <h3 className="text-sm font-semibold tracking-tight text-slate-900 flex items-center gap-2">
              <span>Changes Since Last Consultation</span>
              {hasBaseline ? (
                <span className="inline-flex items-center gap-1 rounded-md bg-blue-100/80 px-2 py-0.5 text-[11px] font-medium text-blue-800">
                  <Calendar className="h-3 w-3" />
                  Baseline: {formattedBaseline}
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 rounded-md bg-slate-200/70 px-2 py-0.5 text-[11px] font-medium text-slate-700">
                  First Consultation — Initial Chart Intake
                </span>
              )}
            </h3>
            <p className="text-xs text-slate-600 mt-0.5">
              Source-verified interval delta derived from Evidence Ledger updates and observation dates.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href={`/patients/${patientId}/evidence?filter=${isSinceLastVisitActive ? 'all' : 'since_last_visit'}`}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
              isSinceLastVisitActive
                ? 'bg-blue-600 text-white shadow-xs'
                : 'border border-blue-300 bg-white text-blue-700 hover:bg-blue-50'
            }`}
          >
            <span>{isSinceLastVisitActive ? '✓ Viewing Interval Only' : 'Filter: Since Last Visit'}</span>
          </Link>
        </div>
      </div>

      {/* Metric Delta Badges */}
      <div className="mt-3.5 grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        <div className="rounded-lg border border-slate-200/80 bg-white/90 p-2.5 shadow-2xs">
          <div className="flex items-center justify-between text-slate-500 text-[11px]">
            <span>New Documents</span>
            <FileText className="h-3.5 w-3.5 text-blue-500" />
          </div>
          <div className="mt-1 flex items-baseline gap-1">
            <span className="text-lg font-bold text-slate-900">
              +{interval.newDocumentsCount}
            </span>
            <span className="text-[10px] text-slate-500">received</span>
          </div>
        </div>

        <div className="rounded-lg border border-slate-200/80 bg-white/90 p-2.5 shadow-2xs">
          <div className="flex items-center justify-between text-slate-500 text-[11px]">
            <span>New / Updated Facts</span>
            <Sparkles className="h-3.5 w-3.5 text-indigo-500" />
          </div>
          <div className="mt-1 flex items-baseline gap-1">
            <span className="text-lg font-bold text-slate-900">
              +{interval.newFacts.length}
            </span>
            <span className="text-[10px] text-slate-500">ledger facts</span>
          </div>
        </div>

        <div className="rounded-lg border border-slate-200/80 bg-white/90 p-2.5 shadow-2xs">
          <div className="flex items-center justify-between text-slate-500 text-[11px]">
            <span>Reopened Conflicts</span>
            <AlertCircle className="h-3.5 w-3.5 text-amber-500" />
          </div>
          <div className="mt-1 flex items-baseline gap-1">
            <span
              className={`text-lg font-bold ${
                interval.reopenedOrNewConflictsCount > 0
                  ? 'text-amber-700'
                  : 'text-slate-900'
              }`}
            >
              {interval.reopenedOrNewConflictsCount}
            </span>
            <span className="text-[10px] text-slate-500">requiring review</span>
          </div>
        </div>

        <div className="rounded-lg border border-slate-200/80 bg-white/90 p-2.5 shadow-2xs">
          <div className="flex items-center justify-between text-slate-500 text-[11px]">
            <span>Pending Items</span>
            <Clock className="h-3.5 w-3.5 text-teal-500" />
          </div>
          <div className="mt-1 flex items-baseline gap-1">
            <span className="text-lg font-bold text-slate-900">
              {interval.pendingInvestigations.length + interval.documentedInstructions.length}
            </span>
            <span className="text-[10px] text-slate-500">investigations/instructions</span>
          </div>
        </div>
      </div>
    </div>
  );
}
