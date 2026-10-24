'use client';

import { useState } from 'react';
import Link from 'next/link';
import { StateBadge } from '@/components/evidence';
import type { TreatmentEventItem } from './ObservationChart';

export function TreatmentTimelineView({
  patientId,
  treatmentEvents,
}: {
  patientId: string;
  treatmentEvents: TreatmentEventItem[];
}) {
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);

  // Sort chronologically ascending
  const sortedEvents = [...treatmentEvents].sort((a, b) => {
    return (a.date || '').localeCompare(b.date || '');
  });

  const selectedEvent = sortedEvents.find((e) => e.id === selectedEventId) || null;

  return (
    <div className="border border-[var(--color-rule-strong)] bg-white p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-[var(--color-rule)] pb-3">
        <div>
          <span className="block text-xs font-semibold uppercase tracking-wider text-[var(--color-ink-soft)]">
            Documented Treatment & Follow-up Timeline
          </span>
          <h4 className="cc-card-title text-[var(--color-ink)]">
            Chronological Treatment Milestones
          </h4>
        </div>
        <span className="mono border border-[var(--color-rule-strong)] bg-[var(--color-paper)] px-2 py-0.5 text-[10px] text-[var(--color-ink-soft)]">
          Factual chronology · No causal inferences
        </span>
      </div>

      {sortedEvents.length === 0 ? (
        <p className="p-4 text-xs italic text-[var(--color-ink-soft)]">
          No treatment, surgery or follow-up events documented in available records.
        </p>
      ) : (
        <div className="mt-4">
          {/* Horizontal scrollable milestone track */}
          <div className="relative overflow-x-auto pb-2">
            <div className="flex items-stretch gap-3 min-w-max">
              {sortedEvents.map((evt) => {
                const isSelected = selectedEventId === evt.id;
                const icon =
                  evt.kind === 'procedure' ? '✂' : evt.kind === 'cycle' ? '💉' : evt.kind === 'followup' ? '🔍' : '📅';
                const kindLabel =
                  evt.kind === 'procedure'
                    ? 'Procedure'
                    : evt.kind === 'cycle'
                      ? 'Systemic Cycle'
                      : evt.kind === 'followup'
                        ? 'Follow-up'
                        : 'Appointment';

                return (
                  <button
                    key={evt.id}
                    type="button"
                    onClick={() => setSelectedEventId(evt.id)}
                    className={`text-left border p-3 w-56 shrink-0 flex flex-col justify-between transition-colors ${
                      isSelected
                        ? 'border-[var(--color-accent)] bg-[var(--color-accent-soft)] ring-1 ring-[var(--color-accent)]'
                        : 'border-[var(--color-rule)] bg-[var(--color-paper)] hover:border-[var(--color-rule-strong)]'
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between gap-1 mb-1">
                        <span className="mono text-[10px] uppercase font-semibold text-[var(--color-accent)]">
                          {icon} {kindLabel}
                        </span>
                        <StateBadge state={evt.state} compact />
                      </div>
                      <p className="text-xs font-semibold text-[var(--color-ink)] line-clamp-2" title={evt.label}>
                        {evt.label}
                      </p>
                    </div>

                    <div className="mt-2 pt-2 border-t border-[var(--color-rule)]">
                      <span className="mono block text-[11px] font-medium text-[var(--color-ink-soft)]">
                        {evt.date || 'Undated'}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Selected Milestone Detail Card */}
          {selectedEvent && (
            <div className="mt-4 border border-[var(--color-rule)] bg-[var(--color-paper-raised)] p-3">
              <div className="flex items-center justify-between gap-2 border-b border-[var(--color-rule)] pb-2 mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-[var(--color-ink)]">
                    Documented Milestone Details
                  </span>
                  <StateBadge state={selectedEvent.state} compact />
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedEventId(null)}
                  className="mono text-xs text-[var(--color-ink-soft)] hover:text-[var(--color-ink)]"
                >
                  ✕ Close
                </button>
              </div>

              <dl className="mono grid grid-cols-[6rem_1fr] gap-x-2 gap-y-1 text-xs">
                <dt className="text-[var(--color-ink-soft)]">Event</dt>
                <dd className="font-semibold text-[var(--color-ink)]">{selectedEvent.label}</dd>
                <dt className="text-[var(--color-ink-soft)]">Date</dt>
                <dd className="font-medium text-[var(--color-ink)]">{selectedEvent.date || 'Unstated'}</dd>
                <dt className="text-[var(--color-ink-soft)]">Source File</dt>
                <dd className="truncate text-[var(--color-ink)]" title={selectedEvent.sourceDocumentName}>
                  {selectedEvent.sourceDocumentName}
                </dd>
                <dt className="text-[var(--color-ink-soft)]">Page</dt>
                <dd>{selectedEvent.sourcePageNumber ? `Page ${selectedEvent.sourcePageNumber}` : 'Page 1'}</dd>
              </dl>

              <div className="mt-3">
                <Link
                  href={`/patients/${patientId}/sources/${selectedEvent.sourceDocumentId}?fact=${selectedEvent.factId}${selectedEvent.sourcePageNumber ? `&page=${selectedEvent.sourcePageNumber}` : ''}`}
                  className="mono inline-flex items-center gap-1 text-xs text-[var(--color-accent)] underline decoration-dotted hover:text-[var(--color-accent-strong)]"
                >
                  Inspect in Source Report ({selectedEvent.sourceDocumentName} · p.{selectedEvent.sourcePageNumber || 1}) →
                </Link>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
