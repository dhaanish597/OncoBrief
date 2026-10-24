'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { GitCommit, ListFilter } from 'lucide-react';
import type { IntervalDeltaSummary, LabSeriesRow, MedicationHistoryRow } from '@oncobrief/domain';
import type { TimelineRow } from '@oncobrief/db';
import { EmptyFinding, SectionHeading } from '@/components/evidence';
import { TimelineNodeView } from '@/components/TimelineNodeView';
import { EvidenceRow } from '@/components/EvidenceRow';
import { ChangesSinceLastVisitBanner } from '@/components/ChangesSinceLastVisitBanner';
import { GuidedReadinessBanner } from '@/components/GuidedReadinessBanner';
import { LongitudinalLabFlowsheet } from '@/components/LongitudinalLabFlowsheet';
import { MedicationHistoryView } from '@/components/MedicationHistoryView';
import { BatchVerificationModal, type BatchCandidateFact } from '@/components/BatchVerificationModal';

export interface EvidenceViewContainerProps {
  patientId: string;
  patientCode: string;
  timeline: TimelineRow[];
  interval: IntervalDeltaSummary;
  labFlowsheet: LabSeriesRow[];
  medicationHistory: MedicationHistoryRow[];
  readinessBand: string | null;
  missingRequiredCount: number;
  docsCount: number;
  tasksCount: number;
  currentFilter: string;
  currentView: string;
}

export function EvidenceViewContainer({
  patientId,
  patientCode,
  timeline,
  interval,
  labFlowsheet,
  medicationHistory,
  readinessBand,
  missingRequiredCount,
  docsCount,
  tasksCount,
  currentFilter,
  currentView,
}: EvidenceViewContainerProps) {
  const [isBatchModalOpen, setIsBatchModalOpen] = useState(false);

  const unverifiedCount = timeline.filter((t) => t.state === 'extracted').length;
  const conflictingCount = timeline.filter((t) => t.state === 'conflicting').length;
  const verifiedCount = timeline.filter((t) => t.state === 'verified').length;
  const historicalCount = timeline.filter((t) => t.state === 'corrected' || t.state === 'superseded').length;

  // Filter high-confidence candidates eligible for batch verification (confidence >= 0.90, extracted, not in conflict)
  const eligibleBatchCandidates: BatchCandidateFact[] = timeline
    .filter(
      (t) =>
        t.state === 'extracted' &&
        (t.confidenceBand === 'high' || (t.confidenceRaw !== null && t.confidenceRaw !== undefined && t.confidenceRaw >= 0.90)),
    )
    .map((t) => ({
      id: t.evidenceFactId,
      factType: t.factType,
      valueText: t.valueText,
      verbatimQuote: t.verbatimQuote,
      documentId: t.documentId,
      documentName: t.documentName,
      pageNumber: t.pageNumber,
      confidenceBand: t.confidenceBand,
      confidenceRaw: t.confidenceRaw ?? null,
    }));

  // Identify new facts since last visit
  const newFactIds = new Set(interval.newFacts.map((f) => f.evidenceFactId));

  // Compute filtered timeline facts based on currentFilter
  const filteredTimeline = timeline.filter((t) => {
    if (currentFilter === 'since_last_visit') return newFactIds.has(t.evidenceFactId);
    if (currentFilter === 'unverified') return t.state === 'extracted';
    if (currentFilter === 'conflicting') return t.state === 'conflicting';
    if (currentFilter === 'verified') return t.state === 'verified';
    if (currentFilter === 'historical') return t.state === 'corrected' || t.state === 'superseded';
    return true;
  });

  // Group facts by YYYY-MM for classic ledger details view
  const groups = new Map<string, typeof filteredTimeline>();
  for (const row of filteredTimeline) {
    const key = row.displayDate?.slice(0, 7) ?? 'undated';
    const arr = groups.get(key) ?? [];
    arr.push(row);
    groups.set(key, arr);
  }

  const FILTERS = [
    { key: 'all', label: 'All facts', count: timeline.length },
    { key: 'since_last_visit', label: 'Since last visit', count: interval.newFacts.length },
    { key: 'unverified', label: 'Unverified', count: unverifiedCount },
    { key: 'conflicting', label: 'Conflicting', count: conflictingCount },
    { key: 'verified', label: 'Verified', count: verifiedCount },
    { key: 'historical', label: 'Historical / superseded', count: historicalCount },
    { key: 'labs', label: 'Lab Flowsheet', count: labFlowsheet.length },
    { key: 'meds', label: 'Medication History', count: medicationHistory.length },
  ];

  return (
    <div className="space-y-6">
      {/* 1. Guided Readiness Banner */}
      <GuidedReadinessBanner
        patientId={patientId}
        readinessBand={readinessBand}
        conflictingCount={conflictingCount}
        missingRequiredCount={missingRequiredCount}
        unverifiedCount={unverifiedCount}
        eligibleBatchCount={eligibleBatchCandidates.length}
        onOpenBatchVerify={() => setIsBatchModalOpen(true)}
      />

      {/* 2. Changes Since Last Visit Banner */}
      <ChangesSinceLastVisitBanner
        patientId={patientId}
        interval={interval}
        currentFilter={currentFilter}
      />

      {/* Page Header and View Mode Toggle */}
      <div className="flex flex-wrap items-end justify-between gap-4 pt-2">
        <div>
          <SectionHeading title="Evidence journey" count={timeline.length} />
          <p className="mono mt-1 text-[11px] text-[var(--color-ink-soft)]">
            {unverifiedCount} unverified · {conflictingCount} conflicting · {historicalCount} historical · {interval.newFacts.length} new since baseline
          </p>
        </div>

        {/* View Mode Toggle: Timeline vs Ledger Detail */}
        {currentFilter !== 'labs' && currentFilter !== 'meds' ? (
          <div className="flex items-center rounded-lg border border-slate-200 bg-white p-1 text-xs font-medium shadow-2xs">
            <Link
              href={`/patients/${patientId}/evidence?view=timeline${currentFilter !== 'all' ? `&filter=${currentFilter}` : ''}`}
              aria-current={currentView === 'timeline' ? 'page' : undefined}
              className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1 transition-colors ${
                currentView === 'timeline'
                  ? 'bg-blue-600 text-white font-semibold shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
              }`}
            >
              <GitCommit className="h-3.5 w-3.5" />
              <span>Timeline View</span>
            </Link>
            <Link
              href={`/patients/${patientId}/evidence?view=ledger${currentFilter !== 'all' ? `&filter=${currentFilter}` : ''}`}
              aria-current={currentView === 'ledger' ? 'page' : undefined}
              className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1 transition-colors ${
                currentView === 'ledger'
                  ? 'bg-blue-600 text-white font-semibold shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
              }`}
            >
              <ListFilter className="h-3.5 w-3.5" />
              <span>Ledger Details</span>
            </Link>
          </div>
        ) : null}
      </div>

      <p className="max-w-4xl text-sm leading-relaxed text-[var(--color-ink-soft)]">
        Each entry below is a fact extracted from a source document. Nothing here is verified until
        a person has confirmed it against the page. Open <em>why?</em> or <em>View Source</em> on any row to see the exact
        quoted text, the page it sits on, the extractor that produced it, and who reviewed it.
      </p>

      {/* Filter Chips */}
      <nav aria-label="Evidence status filters" className="flex flex-wrap items-center gap-2">
        <span className="mono text-[11px] uppercase tracking-wider text-[var(--color-ink-soft)] mr-1">
          Filter:
        </span>
        {FILTERS.map((f) => {
          const isActive = currentFilter === f.key;
          return (
            <Link
              key={f.key}
              href={`/patients/${patientId}/evidence?${f.key === 'all' ? '' : `filter=${f.key}&`}view=${currentView}`}
              data-testid={`filter-${f.key}`}
              aria-current={isActive ? 'true' : undefined}
              className={`mono inline-flex items-center gap-1.5 border px-2.5 py-1 text-xs transition-colors rounded ${
                isActive
                  ? 'border-blue-600 bg-blue-600 text-white font-medium'
                  : 'border-[var(--color-rule-strong)] bg-[var(--color-paper-raised)] text-[var(--color-ink-soft)] hover:bg-[var(--color-accent-soft)] hover:text-[var(--color-ink)]'
              }`}
            >
              <span>{f.label}</span>
              <span
                className={`rounded-full px-1.5 text-[10px] ${
                  isActive ? 'bg-white/20 text-white' : 'bg-neutral-200/60'
                }`}
              >
                {f.count}
              </span>
            </Link>
          );
        })}
      </nav>

      {/* Main Content Area based on Filter / View */}
      {currentFilter === 'labs' ? (
        <LongitudinalLabFlowsheet patientId={patientId} rows={labFlowsheet} />
      ) : currentFilter === 'meds' ? (
        <MedicationHistoryView patientId={patientId} rows={medicationHistory} />
      ) : filteredTimeline.length === 0 ? (
        <div className="mt-4">
          <EmptyFinding>
            No evidence facts match the selected filter ({currentFilter}).
          </EmptyFinding>
        </div>
      ) : currentView === 'timeline' ? (
        <div className="mt-4" data-testid="timeline-view">
          <TimelineNodeView
            patientId={patientId}
            rows={filteredTimeline}
            patientCode={patientCode}
            documentsCount={docsCount}
            openTasksCount={tasksCount}
          />
        </div>
      ) : (
        /* Classic Ledger Details View */
        [...groups.entries()].map(([month, rows]) => (
          <section key={month} className="mt-6">
            <h3 className="mono mb-1 text-xs uppercase tracking-[0.2em] text-[var(--color-ink-soft)]">
              {month === 'undated' ? 'No date recorded' : month}
            </h3>
            <ul className="border-t border-[var(--color-rule-strong)] bg-[var(--color-paper-raised)]">
              {rows.map((row) => (
                <EvidenceRow
                  key={row.evidenceFactId}
                  row={{
                    evidenceFactId: row.evidenceFactId,
                    patientId: patientId,
                    factType: row.factType,
                    valueText: row.valueText,
                    displayDate: row.displayDate,
                    state: row.state,
                    documentId: row.documentId,
                    documentName: row.documentName,
                    pageNumber: row.pageNumber,
                    confidenceBand: row.confidenceBand,
                    extractorKind: row.extractorKind,
                    extractorName: row.extractorName,
                    extractorVersion: row.extractorVersion,
                    verbatimQuote: row.verbatimQuote,
                    reviewerName: row.reviewerName,
                    reviewedAt: row.reviewedAt,
                    correctsFactId: row.correctsFactId,
                    replacedByFactId: row.replacedByFactId,
                    version: row.version,
                  }}
                />
              ))}
            </ul>
          </section>
        ))
      )}

      {/* Batch Verification Modal */}
      <BatchVerificationModal
        patientId={patientId}
        candidateFacts={eligibleBatchCandidates}
        isOpen={isBatchModalOpen}
        onClose={() => setIsBatchModalOpen(false)}
      />
    </div>
  );
}
