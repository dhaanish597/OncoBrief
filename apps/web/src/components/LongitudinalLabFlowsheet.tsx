'use client';

import React from 'react';
import Link from 'next/link';
import { FlaskConical, ExternalLink, Calendar } from 'lucide-react';
import type { LabSeriesRow } from '@oncobrief/domain';
import { StateBadge } from '@/components/evidence';

export interface LongitudinalLabFlowsheetProps {
  patientId: string;
  rows: LabSeriesRow[];
}

export function LongitudinalLabFlowsheet({
  patientId,
  rows,
}: LongitudinalLabFlowsheetProps) {
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
        <FlaskConical className="mx-auto h-8 w-8 text-slate-400" />
        <h4 className="mt-2 text-sm font-semibold text-slate-800">No Longitudinal Laboratory Series Found</h4>
        <p className="mt-1 text-xs text-slate-500 max-w-md mx-auto">
          No dated serial laboratory reports (e.g. Hemoglobin, White Blood Cells, Platelets) have been extracted for this patient.
        </p>
      </div>
    );
  }

  return (
    <div
      data-testid="longitudinal-lab-flowsheet"
      className="rounded-xl border border-slate-200 bg-white shadow-xs overflow-hidden"
    >
      <div className="border-b border-slate-100 bg-slate-50/70 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-md bg-teal-100 text-teal-800">
              <FlaskConical className="h-3.5 w-3.5" />
            </span>
            <h3 className="text-sm font-semibold text-slate-900">
              Longitudinal Oncology Laboratory & Vitals Flowsheet
            </h3>
          </div>
          <span className="text-[11px] font-mono text-slate-500">
            Source-anchored observations as written · Zero clinical trend inference
          </span>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-100/50 text-[11px] font-semibold text-slate-600">
              <th className="py-2.5 px-3">Test Name & Unit</th>
              <th className="py-2.5 px-3">Prior Value (Observed Date)</th>
              <th className="py-2.5 px-3">Latest Value (Observed Date)</th>
              <th className="py-2.5 px-3">Arithmetic Delta (As Written)</th>
              <th className="py-2.5 px-3">Verification State</th>
              <th className="py-2.5 px-3">Source Provenance</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((row) => {
              const priorPoint = row.points.length > 1 ? row.points[0] : null;
              const latestPoint = row.points[row.points.length - 1]!;
              const unit = row.unitText ?? 'unit not stated';

              return (
                <tr
                  key={row.testName}
                  className="hover:bg-slate-50/60 transition-colors"
                  data-testid="lab-flowsheet-row"
                >
                  {/* Test Name & Unit */}
                  <td className="py-3 px-3 align-top font-medium text-slate-900">
                    <div>{row.testName}</div>
                    <div className="text-[11px] font-mono text-slate-500">{unit}</div>
                  </td>

                  {/* Prior Value */}
                  <td className="py-3 px-3 align-top">
                    {priorPoint ? (
                      <div>
                        <div className="font-semibold text-slate-800">{priorPoint.valueText}</div>
                        <div className="text-[10px] text-slate-500 flex items-center gap-1 mt-0.5">
                          <Calendar className="h-2.5 w-2.5" />
                          <span>{formatDate(priorPoint.observedOn)}</span>
                        </div>
                      </div>
                    ) : (
                      <span className="text-slate-400 font-mono text-[11px]">Baseline only</span>
                    )}
                  </td>

                  {/* Latest Value */}
                  <td className="py-3 px-3 align-top">
                    <div>
                      <div className="font-bold text-slate-900">{latestPoint.valueText}</div>
                      <div className="text-[10px] text-slate-500 flex items-center gap-1 mt-0.5">
                        <Calendar className="h-2.5 w-2.5" />
                        <span>{formatDate(latestPoint.observedOn)}</span>
                      </div>
                    </div>
                  </td>

                  {/* Arithmetic Delta */}
                  <td className="py-3 px-3 align-top">
                    {row.deltaText ? (
                      <span className="inline-flex items-center gap-1 rounded bg-slate-100 px-2 py-0.5 text-[11px] font-mono font-medium text-slate-800">
                        {row.deltaText}
                      </span>
                    ) : (
                      <span className="text-slate-400 text-[11px]">N/A (single point or disparate units)</span>
                    )}
                  </td>

                  {/* Verification State */}
                  <td className="py-3 px-3 align-top">
                    <div className="flex flex-col gap-1">
                      {row.points.map((pt, idx) => (
                        <div key={pt.factId} className="flex items-center gap-1.5 text-[10px]">
                          <span className="font-mono text-slate-400">P{idx + 1}:</span>
                          <StateBadge state={pt.state} />
                        </div>
                      ))}
                    </div>
                  </td>

                  {/* Source Links */}
                  <td className="py-3 px-3 align-top">
                    <div className="flex flex-col gap-1">
                      {row.points.map((pt) => (
                        <Link
                          key={pt.factId}
                          href={`/patients/${patientId}/sources/${pt.documentId}?fact=${pt.factId}&page=${pt.pageNumber ?? 1}`}
                          className="inline-flex items-center gap-1 text-[11px] text-blue-600 hover:text-blue-800 hover:underline"
                          title={`View ${pt.documentName} page ${pt.pageNumber ?? 1}`}
                        >
                          <span className="truncate max-w-[140px]">{pt.documentName}</span>
                          <span className="font-mono text-[10px] text-slate-500">p.{pt.pageNumber ?? 1}</span>
                          <ExternalLink className="h-2.5 w-2.5 flex-shrink-0" />
                        </Link>
                      ))}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
