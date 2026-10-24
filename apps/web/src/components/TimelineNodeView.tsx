'use client';

import React from 'react';
import Link from 'next/link';
import {
  FlaskConical,
  Activity,
  Microscope,
  Scissors,
  Stethoscope,
  CheckCircle2,
  AlertTriangle,
  Clock,
  ChevronRight,
  ShieldCheck,
  Pill,
  FileText,
  Zap,
} from 'lucide-react';
import type { TimelineRow } from '@oncobrief/db';
import { verifyEvidenceAction } from '@/lib/actions';

export interface TimelineNodeViewProps {
  patientId: string;
  rows: TimelineRow[];
  patientCode?: string;
  openTasksCount?: number;
  documentsCount?: number;
}

export function TimelineNodeView({
  patientId,
  rows,
  patientCode: _patientCode = 'DEMO-001',
  openTasksCount = 3,
  documentsCount = 8,
}: TimelineNodeViewProps) {
  // Helper to map clinical fact types to Screen 5 modalities & visual styling
  function getModalityInfo(factType: string, docName: string, quote: string) {
    const ft = factType.toLowerCase();
    const dn = docName.toLowerCase();
    const q = quote.toLowerCase();

    if (dn.includes('radiation') || dn.includes('radiotherapy') || q.includes('radiation') || q.includes('radiotherapy') || q.includes('fractions') || q.includes('gy')) {
      return {
        category: 'Radiation',
        icon: <Zap className="h-4 w-4 text-orange-600" />,
        nodeBg: 'bg-orange-50 border-orange-300 text-orange-700',
        ringColor: 'ring-orange-100',
        badgeBg: 'bg-orange-50 text-orange-700 border-orange-200',
      };
    }
    if (ft.includes('medication') || dn.includes('chemo') || q.includes('chemotherapy') || q.includes('cycle') || q.includes('paclitaxel') || q.includes('doxorubicin') || q.includes('carboplatin') || q.includes('cyclophosphamide') || q.includes('tamoxifen')) {
      return {
        category: 'Chemotherapy / Systemic',
        icon: <Pill className="h-4 w-4 text-rose-600" />,
        nodeBg: 'bg-rose-50 border-rose-300 text-rose-700',
        ringColor: 'ring-rose-100',
        badgeBg: 'bg-rose-50 text-rose-700 border-rose-200',
      };
    }
    if (ft.includes('pathology') || dn.includes('histopathology') || dn.includes('biopsy') || q.includes('carcinoma') || q.includes('adenocarcinoma') || q.includes('ihc')) {
      return {
        category: 'Pathology',
        icon: <Microscope className="h-4 w-4 text-purple-600" />,
        nodeBg: 'bg-purple-50 border-purple-300 text-purple-700',
        ringColor: 'ring-purple-100',
        badgeBg: 'bg-purple-50 text-purple-700 border-purple-200',
      };
    }
    if (ft.includes('procedure') || q.includes('surgery') || q.includes('mastectomy') || q.includes('lobectomy') || q.includes('resection') || dn.includes('surgery') || dn.includes('discharge') || dn.includes('operative')) {
      return {
        category: 'Surgery',
        icon: <Scissors className="h-4 w-4 text-amber-600" />,
        nodeBg: 'bg-amber-50 border-amber-300 text-amber-700',
        ringColor: 'ring-amber-100',
        badgeBg: 'bg-amber-50 text-amber-700 border-amber-200',
      };
    }
    if (ft.includes('imaging') || dn.includes('imaging') || dn.includes('ct') || dn.includes('mri') || dn.includes('xray') || dn.includes('pet') || q.includes('scan') || q.includes('computed tomography')) {
      return {
        category: 'Imaging',
        icon: <Activity className="h-4 w-4 text-sky-600" />,
        nodeBg: 'bg-sky-50 border-sky-300 text-sky-700',
        ringColor: 'ring-sky-100',
        badgeBg: 'bg-sky-50 text-sky-700 border-sky-200',
      };
    }
    if (dn.includes('referral') || q.includes('referred') || q.includes('referral')) {
      return {
        category: 'Referral',
        icon: <FileText className="h-4 w-4 text-indigo-600" />,
        nodeBg: 'bg-indigo-50 border-indigo-300 text-indigo-700',
        ringColor: 'ring-indigo-100',
        badgeBg: 'bg-indigo-50 text-indigo-700 border-indigo-200',
      };
    }
    if (ft.includes('lab') || dn.includes('cbc') || dn.includes('blood') || dn.includes('chem')) {
      return {
        category: 'Laboratory',
        icon: <FlaskConical className="h-4 w-4 text-teal-600" />,
        nodeBg: 'bg-teal-50 border-teal-300 text-teal-700',
        ringColor: 'ring-teal-100',
        badgeBg: 'bg-teal-50 text-teal-700 border-teal-200',
      };
    }
    // Follow-up / Appointment / Clinical Note
    return {
      category: 'Follow-up',
      icon: <Stethoscope className="h-4 w-4 text-emerald-600" />,
      nodeBg: 'bg-emerald-50 border-emerald-300 text-emerald-700',
      ringColor: 'ring-emerald-100',
      badgeBg: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    };
  }

  function formatTimelineDate(iso: string | null) {
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

  return (
    <div
      className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs"
      data-testid="timeline-node-view"
    >
      {/* Header Bar matching Screen 5 of Unknown.png */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-blue-600 text-[11px] font-semibold text-white">
              5
            </span>
            <h3 className="text-sm font-semibold tracking-tight text-slate-900">
              Patient Timeline (Multi-Source View)
            </h3>
          </div>
          <p className="mt-0.5 text-xs text-slate-500">
            Unified longitudinal view of all records
          </p>
        </div>

        {/* Sub-Navigation Tabs matching Screen 5 */}
        <div className="flex items-center gap-1 text-xs font-medium">
          <span className="rounded-lg bg-blue-50 px-3 py-1 font-semibold text-blue-700 border border-blue-200/60">
            Timeline
          </span>
          <Link
            href={`/patients/${patientId}/sources`}
            className="rounded-lg px-3 py-1 text-slate-500 hover:text-slate-800 hover:bg-slate-50 transition-colors"
          >
            Documents ({documentsCount})
          </Link>
          <Link
            href={`/patients/${patientId}/tasks`}
            className="rounded-lg px-3 py-1 text-slate-500 hover:text-slate-800 hover:bg-slate-50 transition-colors"
          >
            Pending Tasks ({openTasksCount})
          </Link>
          <Link
            href={`/patients/${patientId}/continuity`}
            className="rounded-lg px-3 py-1 text-slate-500 hover:text-slate-800 hover:bg-slate-50 transition-colors"
          >
            Team Notes
          </Link>
        </div>
      </div>

      {/* Main Longitudinal Timeline Rail */}
      <div className="mt-6 relative">
        {/* Continuous vertical connector line */}
        <div className="absolute left-[135px] top-4 bottom-4 w-0.5 bg-slate-200" aria-hidden="true" />

        <div className="space-y-6">
          {rows.map((row) => {
            const modality = getModalityInfo(row.factType, row.documentName, row.verbatimQuote);
            const dateStr = formatTimelineDate(row.displayDate || row.observedOn);
            const facility = row.issuingFacility?.trim() || 'Facility not stated';
            const isUnverified = row.state === 'extracted';
            const isConflicting = row.state === 'conflicting';

            return (
              <div
                key={row.evidenceFactId}
                data-testid="evidence-row"
                data-state={row.state}
                className="relative flex items-start gap-4 group"
              >
                {/* Left Date Rail (Fixed Width) */}
                <div className="w-[110px] shrink-0 pt-1 text-right">
                  <span className="text-xs font-semibold text-slate-700 font-mono">
                    {dateStr}
                  </span>
                </div>

                {/* Circular Modality Icon Node along the line */}
                <div
                  className={`relative z-10 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 ${modality.nodeBg} shadow-2xs`}
                >
                  {modality.icon}
                </div>

                {/* Right Event Detail Card */}
                <div className="flex-1 rounded-xl border border-slate-200 bg-white p-4 shadow-2xs hover:border-slate-300 hover:shadow-xs transition-all">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <h4 className="text-sm font-semibold text-slate-900">
                        {modality.category}
                      </h4>
                      <span className={`rounded-md border px-1.5 py-0.5 text-[10px] font-medium ${modality.badgeBg}`}>
                        {row.documentName}
                      </span>
                      {row.state === 'verified' ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700">
                          <CheckCircle2 className="h-3 w-3" /> Verified
                        </span>
                      ) : isConflicting ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-medium text-red-700">
                          <AlertTriangle className="h-3 w-3" /> Conflicting
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-700">
                          <Clock className="h-3 w-3" /> Unverified
                        </span>
                      )}
                    </div>

                    {/* View Source Button matching Screen 5 */}
                    <div className="flex items-center gap-2">
                      {isUnverified ? (
                        <form action={verifyEvidenceAction} className="inline">
                          <input type="hidden" name="patientId" value={patientId} />
                          <input type="hidden" name="factId" value={row.evidenceFactId || row.id} />
                          <input type="hidden" name="evidenceFactId" value={row.evidenceFactId || row.id} />
                          <button
                            type="submit"
                            data-testid="verify-evidence"
                            className="inline-flex items-center gap-1 rounded-lg border border-emerald-300 bg-emerald-50/70 px-2.5 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-100 transition-colors"
                          >
                            <ShieldCheck className="h-3.5 w-3.5" />
                            <span>Verify</span>
                          </button>
                        </form>
                      ) : null}

                      <Link
                        href={`/patients/${patientId}/sources/${row.documentId}?fact=${row.evidenceFactId}&page=${row.pageNumber || 1}`}
                        className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-blue-600 hover:bg-blue-50 hover:border-blue-300 transition-colors"
                      >
                        <span>View Source</span>
                        <ChevronRight className="h-3.5 w-3.5" />
                      </Link>
                    </div>
                  </div>

                  {/* Excerpt Subtitle with exact quote and facility provenance */}
                  <div className="mt-2 text-xs text-slate-600 leading-relaxed">
                    <span className="font-medium text-slate-800">{row.valueText}</span>
                    {row.verbatimQuote ? (
                      <span className="text-slate-500"> — &ldquo;{row.verbatimQuote}&rdquo;</span>
                    ) : null}
                    <span className="text-slate-400"> · {facility}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
