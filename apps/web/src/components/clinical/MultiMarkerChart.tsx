'use client';

import { useState } from 'react';
import type { ClinicalSummary } from '@oncobrief/db';
import { ObservationChart, type TreatmentEventItem } from './ObservationChart';

export function MultiMarkerChart({
  patientId,
  selectedGroups,
  allAvailableGroups,
  onToggleKey,
  treatmentEvents = [],
}: {
  patientId: string;
  selectedGroups: ClinicalSummary['analyteGroups'];
  allAvailableGroups: ClinicalSummary['analyteGroups'];
  onToggleKey: (key: string) => void;
  treatmentEvents?: TreatmentEventItem[];
}) {
  const [dateFilter, setDateFilter] = useState<'all' | '1y' | '90d' | '30d'>('all');
  const [isAddingMarker, setIsAddingMarker] = useState(false);

  const selectedKeys = new Set(selectedGroups.map((g) => g.canonicalKey));
  const unselectedNumericGroups = allAvailableGroups.filter(
    (g) => g.isNumeric && !selectedKeys.has(g.canonicalKey),
  );

  return (
    <div className="border border-[var(--color-rule-strong)] bg-[var(--color-paper-raised)] p-4">
      {/* Multi-Marker Header & Legend */}
      <div className="flex flex-wrap items-baseline justify-between gap-3 border-b border-[var(--color-rule)] pb-3">
        <div>
          <span className="block text-xs font-semibold uppercase tracking-wider text-[var(--color-ink-soft)]">
            Multi-Marker Longitudinal Comparison · Aligned Small Multiples
          </span>
          <h4 className="cc-card-title text-[var(--color-ink)]">
            Comparing {selectedGroups.length} Observation{selectedGroups.length === 1 ? '' : 's'}
          </h4>
          <p className="cc-body mt-0.5 text-xs text-[var(--color-ink-soft)]">
            Independent scales and reference intervals aligned across a shared chronological timeline.
          </p>
        </div>

        {/* Global Date Filter Preset */}
        <div className="flex items-center gap-2">
          <div className="mono flex border border-[var(--color-rule-strong)] bg-white text-[11px]">
            {(['all', '1y', '90d', '30d'] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => setDateFilter(mode)}
                className={`px-2.5 py-1 uppercase transition-colors ${
                  dateFilter === mode
                    ? 'bg-[var(--color-ink)] text-white font-medium'
                    : 'text-[var(--color-ink-soft)] hover:text-[var(--color-ink)]'
                }`}
              >
                {mode === 'all' ? 'All Time' : mode}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => setIsAddingMarker((prev) => !prev)}
            className="mono border border-[var(--color-accent)] bg-[var(--color-accent-soft)] px-2.5 py-1 text-[11px] font-semibold text-[var(--color-accent)] hover:bg-[var(--color-accent)] hover:text-white"
          >
            {isAddingMarker ? '✕ Done' : '+ Add Test'}
          </button>
        </div>
      </div>

      {/* Selected Markers Chips */}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold text-[var(--color-ink-soft)]">Active Series:</span>
        {selectedGroups.map((g) => (
          <span
            key={g.canonicalKey}
            className="mono inline-flex items-center gap-1.5 border border-[var(--color-rule-strong)] bg-white px-2 py-0.5 text-xs text-[var(--color-ink)]"
          >
            <span className="font-semibold">{g.canonicalLabel}</span>
            <span className="text-[10px] text-[var(--color-ink-soft)]">
              ({g.observations.length} pts)
            </span>
            <button
              type="button"
              onClick={() => onToggleKey(g.canonicalKey)}
              className="text-xs text-[var(--color-ink-soft)] hover:text-red-700 font-bold"
              title={`Remove ${g.canonicalLabel}`}
            >
              ✕
            </button>
          </span>
        ))}
      </div>

      {/* Add Marker Dropdown Tray */}
      {isAddingMarker && unselectedNumericGroups.length > 0 && (
        <div className="mt-3 border border-dashed border-[var(--color-accent)] bg-white p-3">
          <span className="block text-xs font-semibold text-[var(--color-ink)] mb-2">
            Click to add an available test to the comparison view:
          </span>
          <div className="flex flex-wrap gap-1.5">
            {unselectedNumericGroups.map((g) => (
              <button
                key={g.canonicalKey}
                type="button"
                onClick={() => onToggleKey(g.canonicalKey)}
                className="mono border border-[var(--color-rule)] bg-[var(--color-paper)] px-2 py-1 text-[11px] text-[var(--color-ink)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)]"
              >
                + {g.canonicalLabel} ({g.observations.length})
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Small Multiples Grid */}
      <div className="mt-4 space-y-4">
        {selectedGroups.length === 0 ? (
          <div className="p-8 text-center text-xs italic text-[var(--color-ink-soft)]">
            No markers selected for comparison. Use &ldquo;+ Add Test&rdquo; to select series.
          </div>
        ) : (
          selectedGroups.map((group) => (
            <div key={group.canonicalKey} className="relative">
              <div className="absolute right-3 top-3 z-10">
                <button
                  type="button"
                  onClick={() => onToggleKey(group.canonicalKey)}
                  className="mono text-xs text-[var(--color-ink-soft)] hover:text-red-700"
                  title="Remove from comparison"
                >
                  ✕
                </button>
              </div>
              <ObservationChart
                observations={group.observations}
                analyteLabel={group.canonicalLabel}
                treatmentEvents={treatmentEvents}
                isCompact={true}
              />
            </div>
          ))
        )}
      </div>
    </div>
  );
}
