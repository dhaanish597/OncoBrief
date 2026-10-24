'use client';

import React from 'react';
import Link from 'next/link';
import { Pill, ExternalLink, Calendar, Info } from 'lucide-react';
import type { MedicationHistoryRow } from '@oncobrief/domain';
import { StateBadge } from '@/components/evidence';

export interface MedicationHistoryViewProps {
  patientId: string;
  rows: MedicationHistoryRow[];
}

export function MedicationHistoryView({
  patientId,
  rows,
}: MedicationHistoryViewProps) {
  function formatDate(iso: string | null) {
    if (!iso) return 'Undated';
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

  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-8 text-center shadow-xs">
        <Pill className="mx-auto h-8 w-8 text-slate-400" />
        <h4 className="mt-2 text-sm font-semibold text-slate-800">No Medication Records Documented</h4>
        <p className="mt-1 text-xs text-slate-500 max-w-md mx-auto">
          No oncology systemic chemotherapy, hormonal therapy, or supportive medication facts have been extracted.
        </p>
      </div>
    );
  }

  return (
    <div
      data-testid="medication-history-view"
      className="rounded-xl border border-slate-200 bg-white shadow-xs overflow-hidden"
    >
      <div className="border-b border-slate-100 bg-slate-50/70 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-md bg-rose-100 text-rose-800">
              <Pill className="h-3.5 w-3.5" />
            </span>
            <h3 className="text-sm font-semibold text-slate-900">
              Documented Oncology Medication & Administration History
            </h3>
          </div>
          <div className="flex items-center gap-1.5 text-[11px] text-slate-500 bg-white px-2 py-0.5 rounded border border-slate-200">
            <Info className="h-3 w-3 text-slate-400" />
            <span>Documented as written · Does not infer active regimen, response, or treatment advice</span>
          </div>
        </div>
      </div>

      <div className="divide-y divide-slate-100">
        {rows.map((row) => (
          <div key={row.medicationName} className="p-4 hover:bg-slate-50/50 transition-colors">
            <div className="flex items-center justify-between gap-2">
              <h4 className="text-xs font-bold text-slate-900 flex items-center gap-2">
                <span>{row.medicationName}</span>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-mono text-slate-600">
                  {row.points.length} documented {row.points.length === 1 ? 'mention' : 'mentions'}
                </span>
              </h4>
            </div>

            <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {row.points.map((pt) => (
                <div
                  key={pt.factId}
                  className="rounded-lg border border-slate-200/80 bg-white p-2.5 text-xs shadow-2xs"
                  data-testid="medication-history-card"
                >
                  <div className="flex items-center justify-between gap-1 text-[11px]">
                    <span className="font-semibold text-slate-800 flex items-center gap-1">
                      <Calendar className="h-3 w-3 text-slate-400" />
                      {formatDate(pt.observedOn)}
                    </span>
                    <StateBadge state={pt.state} />
                  </div>

                  <div className="mt-1 text-[11px] font-mono text-slate-700">
                    Dose: <strong>{pt.doseText ?? 'Dose as written in report'}</strong>
                  </div>

                  <p className="mt-1 text-[11px] text-slate-600 italic border-l-2 border-slate-200 pl-2 py-0.5">
                    &ldquo;{pt.verbatimQuote}&rdquo;
                  </p>

                  <div className="mt-2 pt-1 border-t border-slate-100 flex items-center justify-between text-[10px]">
                    <span className="text-slate-400">Source:</span>
                    <Link
                      href={`/patients/${patientId}/sources/${pt.documentId}?fact=${pt.factId}&page=${pt.pageNumber ?? 1}`}
                      className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-800 hover:underline truncate max-w-[160px]"
                    >
                      <span className="truncate">{pt.documentName}</span>
                      <span>p.{pt.pageNumber ?? 1}</span>
                      <ExternalLink className="h-2.5 w-2.5 flex-shrink-0" />
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
