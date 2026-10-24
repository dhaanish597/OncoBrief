'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { StateBadge } from '@/components/evidence';
import { ObservationChart, type TreatmentEventItem } from './ObservationChart';
import { MultiMarkerChart } from './MultiMarkerChart';

import type { ClinicalSummary } from '@oncobrief/db';
import type { StructuredObservation } from '@oncobrief/domain';

export function UniversalValueExplorer({
  patientId,
  analyteGroups,
  treatment,
}: {
  patientId: string;
  analyteGroups: ClinicalSummary['analyteGroups'];
  treatment?: ClinicalSummary['cards']['treatment'];
}) {
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [selectedKey, setSelectedKey] = useState<string>(
    analyteGroups.find((g) => g.category !== 'vital_baseline')?.canonicalKey || analyteGroups[0]?.canonicalKey || '',
  );
  const [compareMode, setCompareMode] = useState(false);
  const [selectedCompareKeys, setSelectedCompareKeys] = useState<string[]>(() => {
    // Default to the first two numeric groups if available
    const numericKeys = analyteGroups.filter((g) => g.isNumeric && g.category !== 'vital_baseline').map((g) => g.canonicalKey);
    return numericKeys.slice(0, 2);
  });

  // Normalize treatment events into unified items
  const treatmentEvents: TreatmentEventItem[] = useMemo(() => {
    if (!treatment) return [];
    const events: TreatmentEventItem[] = [];

    for (const p of treatment.procedures) {
      events.push({
        id: `proc-${p.factId}`,
        kind: 'procedure',
        label: p.name,
        date: p.observedOn || '',
        state: p.state,
        sourceDocumentId: p.sourceDocumentId,
        sourceDocumentName: p.sourceDocumentName,
        sourcePageNumber: p.sourcePageNumber,
        factId: p.factId,
      });
    }
    for (const c of treatment.cycles) {
      events.push({
        id: `cycle-${c.factId}`,
        kind: 'cycle',
        label: c.label,
        date: c.observedOn || '',
        state: c.state,
        sourceDocumentId: c.sourceDocumentId,
        sourceDocumentName: c.sourceDocumentName,
        sourcePageNumber: c.sourcePageNumber,
        factId: c.factId,
      });
    }
    for (const a of treatment.appointments) {
      events.push({
        id: `appt-${a.factId}`,
        kind: 'appointment',
        label: a.detail ? `${a.date}: ${a.detail}` : `Appointment ${a.date}`,
        date: a.date,
        state: a.state,
        sourceDocumentId: a.sourceDocumentId,
        sourceDocumentName: a.sourceDocumentName,
        sourcePageNumber: a.sourcePageNumber,
        factId: a.factId,
      });
    }
    for (const f of treatment.followups) {
      events.push({
        id: `fup-${f.factId}`,
        kind: 'followup',
        label: `Follow-up ${f.date}`,
        date: f.date,
        state: f.state,
        sourceDocumentId: f.sourceDocumentId,
        sourceDocumentName: f.sourceDocumentName,
        sourcePageNumber: f.sourcePageNumber,
        factId: f.factId,
      });
    }

    return events;
  }, [treatment]);

  // Filter available analyte groups by search query and category (excluding duplicate vital_baseline)
  const filteredGroups = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return analyteGroups.filter((g) => {
      // Deduplication: vital_baseline is preserved exclusively in the top Patient Overview card
      if (g.category === 'vital_baseline') return false;

      const matchCat = categoryFilter === 'all' || g.category === categoryFilter;
      if (!matchCat) return false;
      if (!q) return true;

      const haystack = [
        g.canonicalLabel,
        g.canonicalKey,
        g.category,
        ...g.observations.map(
          (o) => `${o.asWrittenName} ${o.valueText} ${o.unitText || ''} ${o.verbatimQuote}`,
        ),
      ]
        .join(' ')
        .toLowerCase();

      return haystack.includes(q);
    });
  }, [analyteGroups, searchTerm, categoryFilter]);

  // Active selected group for single test mode
  const activeGroup = useMemo(() => {
    return (
      analyteGroups.find((g) => g.canonicalKey === selectedKey) ||
      filteredGroups[0] ||
      null
    );
  }, [analyteGroups, filteredGroups, selectedKey]);

  // Multi-marker comparison groups
  const selectedCompareGroups = useMemo(() => {
    return analyteGroups.filter((g) => selectedCompareKeys.includes(g.canonicalKey));
  }, [analyteGroups, selectedCompareKeys]);

  const toggleCompareKey = (key: string) => {
    setSelectedCompareKeys((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key],
    );
  };

  const handleSelectKey = (key: string) => {
    setSelectedKey(key);
  };

  return (
    <div className="border border-[var(--color-rule-strong)] bg-[var(--color-paper-raised)] p-5 space-y-6">
      {/* Explorer Heading & Mode Switcher */}
      <div className="flex flex-wrap items-baseline justify-between gap-3 border-b border-[var(--color-rule)] pb-3">
        <div>
          <h3 className="cc-section-heading text-[var(--color-ink)]">
            Universal Clinical Value Explorer
          </h3>
          <p className="cc-body mt-0.5 text-xs text-[var(--color-ink-soft)]">
            Search, trend, compare, and verify any clinical test or finding extracted from primary medical records
          </p>
        </div>

        {/* Mode Switcher: Single Analyte vs Multi-Marker Comparison */}
        <div className="flex items-center gap-2">
          <div className="mono flex border border-[var(--color-rule-strong)] bg-white text-xs">
            <button
              type="button"
              onClick={() => setCompareMode(false)}
              className={`px-3 py-1 font-semibold transition-colors ${
                !compareMode
                  ? 'bg-[var(--color-ink)] text-white'
                  : 'text-[var(--color-ink-soft)] hover:text-[var(--color-ink)]'
              }`}
            >
              Single Test View
            </button>
            <button
              type="button"
              onClick={() => setCompareMode(true)}
              className={`px-3 py-1 font-semibold transition-colors ${
                compareMode
                  ? 'bg-[var(--color-ink)] text-white'
                  : 'text-[var(--color-ink-soft)] hover:text-[var(--color-ink)]'
              }`}
            >
              Multi-Marker Comparison ({selectedCompareKeys.length})
            </button>
          </div>
        </div>
      </div>

      {/* Universal Search Bar & Category Filters (Deduplicated: Baseline/Vitals removed) */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[18rem]">
          <input
            type="search"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search any test, analyte, or qualitative observation (e.g. Haemoglobin, Platelets, Creatinine, Bilirubin, LDH, ER, PR)..."
            className="w-full border border-[var(--color-rule-strong)] bg-white px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]"
          />
          {searchTerm && (
            <button
              type="button"
              onClick={() => setSearchTerm('')}
              className="mono absolute right-2.5 top-2 text-xs text-[var(--color-ink-soft)] hover:text-[var(--color-ink)]"
            >
              ✕
            </button>
          )}
        </div>

        {/* Category Filter Chips */}
        <div className="mono flex flex-wrap gap-1 text-[11px]">
          {[
            { id: 'all', label: 'All Tests' },
            { id: 'hematology', label: 'Haematology' },
            { id: 'biochemistry', label: 'Biochemistry' },
            { id: 'tumor_marker', label: 'Tumour Markers' },
            { id: 'pathology_biomarker', label: 'Pathology / IHC' },
            { id: 'molecular', label: 'Molecular / Genomic' },
            { id: 'treatment_response', label: 'Treatment Response' },
          ].map((cat) => (
            <button
              key={cat.id}
              type="button"
              onClick={() => setCategoryFilter(cat.id)}
              className={`border px-2.5 py-1 uppercase tracking-wider transition-colors ${
                categoryFilter === cat.id
                  ? 'border-[var(--color-accent)] bg-[var(--color-accent-soft)] text-[var(--color-accent)] font-semibold'
                  : 'border-[var(--color-rule)] bg-[var(--color-paper)] text-[var(--color-ink-soft)] hover:text-[var(--color-ink)]'
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>
      </div>

      {/* Analyte Selection Pills & Matching Result Counter */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-[var(--color-ink-soft)]">
            Matching Observations ({filteredGroups.length} available)
          </span>
          {compareMode && (
            <span className="mono text-[11px] text-[var(--color-accent)]">
              Click checkboxes or pills to add/remove tests from multi-marker comparison
            </span>
          )}
        </div>

        <div className="flex flex-wrap gap-1.5 border-b border-[var(--color-rule)] pb-4">
          {filteredGroups.length > 0 ? (
            filteredGroups.map((group) => {
              const isSelected = activeGroup?.canonicalKey === group.canonicalKey;
              const isCompared = selectedCompareKeys.includes(group.canonicalKey);
              const latest = group.latestObservation;

              return (
                <button
                  key={group.canonicalKey}
                  type="button"
                  onClick={() => {
                    if (compareMode) {
                      toggleCompareKey(group.canonicalKey);
                    } else {
                      handleSelectKey(group.canonicalKey);
                    }
                  }}
                  className={`mono flex items-center gap-1.5 border px-2.5 py-1 text-xs transition-colors ${
                    compareMode
                      ? isCompared
                        ? 'border-[var(--color-accent)] bg-[var(--color-accent-soft)] text-[var(--color-accent)] font-semibold'
                        : 'border-[var(--color-rule)] bg-white text-[var(--color-ink)] hover:bg-[var(--color-paper)]'
                      : isSelected
                        ? 'border-[var(--color-ink)] bg-[var(--color-ink)] text-white font-semibold'
                        : 'border-[var(--color-rule-strong)] bg-white text-[var(--color-ink)] hover:bg-[var(--color-paper)]'
                  }`}
                >
                  {compareMode && <span>{isCompared ? '☑' : '☐'}</span>}
                  <span>{group.canonicalLabel}</span>
                  <span
                    className={`rounded-full px-1 text-[10px] ${
                      isSelected && !compareMode
                        ? 'bg-neutral-700 text-white'
                        : 'bg-neutral-100 text-[var(--color-ink-soft)]'
                    }`}
                  >
                    {group.observations.length}
                  </span>
                  {latest.flag ? (
                    <span
                      className={`text-[10px] font-bold ${
                        latest.flag === 'H' || latest.flag === 'CRITICAL' ? 'text-[var(--color-abnormal)]' : 'text-blue-600'
                      }`}
                    >
                      [{latest.flag}]
                    </span>
                  ) : null}
                  {!group.isNumeric && (
                    <span className="text-[9px] uppercase px-1 border border-neutral-300 bg-neutral-50 text-neutral-600">
                      Qual
                    </span>
                  )}
                </button>
              );
            })
          ) : (
            <p className="p-3 text-xs italic text-[var(--color-ink-soft)]">
              No clinical observation matches &ldquo;{searchTerm}&rdquo; in this category.
            </p>
          )}
        </div>
      </div>

      {/* VIEW A: Multi-Marker Comparison View */}
      {compareMode ? (
        <MultiMarkerChart
          patientId={patientId}
          selectedGroups={selectedCompareGroups}
          allAvailableGroups={analyteGroups}
          onToggleKey={toggleCompareKey}
          treatmentEvents={treatmentEvents}
        />
      ) : activeGroup ? (
        /* VIEW B: Single Analyte Deep Dive */
        <div className="space-y-6">
          {/* Latest Available Observation Card */}
          <div className="border border-[var(--color-rule)] bg-[var(--color-paper)] p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-3 border-b border-[var(--color-rule)] pb-3">
              <div>
                <span className="block text-xs font-semibold uppercase tracking-wider text-[var(--color-ink-soft)]">
                  Latest Documented Value · {activeGroup.category.replace('_', ' ')}
                </span>
                <h3 className="cc-card-title text-[var(--color-ink)]">
                  {activeGroup.canonicalLabel}
                </h3>
              </div>
              <div className="flex items-center gap-2">
                <StateBadge state={activeGroup.latestObservation.state} />
                {activeGroup.latestObservation.flag ? (
                  <span
                      className={`mono border px-2 py-0.5 text-xs font-semibold uppercase ${
                        activeGroup.latestObservation.flag === 'H' || activeGroup.latestObservation.flag === 'CRITICAL'
                          ? 'border-[var(--color-abnormal)] bg-red-50 text-[var(--color-abnormal)]'
                          : 'border-blue-400 bg-blue-50 text-blue-700'
                      }`}
                  >
                    Flag: {activeGroup.latestObservation.flag}
                  </span>
                ) : null}
              </div>
            </div>

            <div className="mt-3 grid grid-cols-1 gap-4 md:grid-cols-[1.5fr_2fr]">
              <div>
                <div className="flex items-baseline gap-2">
                  <span className="mono text-3xl font-extrabold text-[var(--color-ink)]">
                    {activeGroup.latestObservation.valueText}
                  </span>
                  {activeGroup.latestObservation.unitText ? (
                    <span className="mono text-base font-semibold text-[var(--color-ink-soft)]">
                      {activeGroup.latestObservation.unitText}
                    </span>
                  ) : null}
                </div>

                <dl className="mono mt-3 grid grid-cols-[7.5rem_1fr] gap-y-1 text-xs text-[var(--color-ink-soft)]">
                  <dt>observed date</dt>
                  <dd className="font-semibold text-[var(--color-ink)]">
                    {activeGroup.latestObservation.observedOn || 'Date not stated in record'}
                  </dd>
                  <dt>document date</dt>
                  <dd>{activeGroup.latestObservation.documentDate || 'No date'}</dd>
                  <dt>reference range</dt>
                  <dd className="font-medium text-[var(--color-ink)]">
                    {activeGroup.latestObservation.referenceRange?.text ? (
                      activeGroup.latestObservation.referenceRange.text
                    ) : (
                      <span className="italic text-[var(--color-ink-soft)]">
                        No reference range reported by source document
                      </span>
                    )}
                  </dd>
                  <dt>as written in doc</dt>
                  <dd className="italic text-[var(--color-ink)]">
                    &ldquo;{activeGroup.latestObservation.asWrittenName}&rdquo;
                  </dd>
                </dl>
              </div>

              <div className="border-t border-[var(--color-rule)] pt-3 md:border-t-0 md:border-l md:pl-4">
                <span className="block text-xs font-semibold uppercase tracking-wider text-[var(--color-ink-soft)]">
                  Source Provenance Citation
                </span>
                <p className="doc-text mt-1 border-l-2 border-[var(--color-accent)] pl-2 text-sm italic text-[var(--color-ink)]">
                  “{activeGroup.latestObservation.verbatimQuote}”
                </p>

                <dl className="mono mt-2 grid grid-cols-[6.5rem_1fr] gap-y-1 text-xs text-[var(--color-ink-soft)]">
                  <dt>source file</dt>
                  <dd className="truncate font-semibold text-[var(--color-ink)]" title={activeGroup.latestObservation.documentName}>
                    {activeGroup.latestObservation.documentName}
                  </dd>
                  <dt>page number</dt>
                  <dd>
                    {activeGroup.latestObservation.pageNumber
                      ? `Page ${activeGroup.latestObservation.pageNumber}`
                      : 'Page 1'}
                  </dd>
                </dl>

                <div className="mt-3">
                  <Link
                    href={`/patients/${patientId}/sources/${activeGroup.latestObservation.documentId}?fact=${activeGroup.latestObservation.id}${activeGroup.latestObservation.pageNumber ? `&page=${activeGroup.latestObservation.pageNumber}` : ''}`}
                    className="mono inline-flex items-center gap-1 border border-[var(--color-accent)] bg-[var(--color-accent-soft)] px-3 py-1.5 text-xs font-semibold text-[var(--color-accent)] hover:underline"
                  >
                    Open Original Report ({activeGroup.latestObservation.documentName} · p.{activeGroup.latestObservation.pageNumber || 1}) →
                  </Link>
                </div>
              </div>
            </div>
          </div>

          {/* Dynamic Trend Chart (for Numeric Analytes) OR Dated Event Journey (for Categorical Findings) */}
          {activeGroup.isNumeric ? (
            <ObservationChart
              observations={activeGroup.observations}
              analyteLabel={activeGroup.canonicalLabel}
              treatmentEvents={treatmentEvents}
            />
          ) : (
            <CategoricalHistoryView
              observations={activeGroup.observations}
              patientId={patientId}
              analyteLabel={activeGroup.canonicalLabel}
            />
          )}

          {/* Full Historical Result Table (with bi-directional selection synchronization) */}
          <div className="border border-[var(--color-rule-strong)] bg-white p-4">
            <div className="flex items-baseline justify-between border-b border-[var(--color-rule)] pb-2">
              <h4 className="cc-card-title text-[var(--color-ink)]">
                Historical Result Table · {activeGroup.canonicalLabel}
              </h4>
              <span className="mono text-xs text-[var(--color-ink-soft)]">
                {activeGroup.observations.length} recorded event{activeGroup.observations.length === 1 ? '' : 's'}
              </span>
            </div>

            {activeGroup.observations.length > 0 ? (
              <div className="mt-3 overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="mono border-b border-[var(--color-rule-strong)] bg-[var(--color-paper)] text-[11px] uppercase tracking-wider text-[var(--color-ink-soft)]">
                      <th className="p-2">Observed Date</th>
                      <th className="p-2">Doc Date</th>
                      <th className="p-2">As Written</th>
                      <th className="p-2">Result Value</th>
                      <th className="p-2">Unit</th>
                      <th className="p-2">Source Reference Range</th>
                      <th className="p-2">Flag</th>
                      <th className="p-2">Source Document & Page</th>
                      <th className="p-2">Status</th>
                      <th className="p-2 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="mono divide-y divide-[var(--color-rule)]">
                    {activeGroup.observations.map((obs) => (
                      <tr
                        key={obs.id}
                        className="transition-colors hover:bg-[var(--color-paper)]"
                      >
                        <td className="p-2 font-semibold text-[var(--color-ink)]">
                          {obs.observedOn || '—'}
                        </td>
                        <td className="p-2 text-[var(--color-ink-soft)]">
                          {obs.documentDate || '—'}
                        </td>
                        <td className="p-2 text-[var(--color-ink-soft)] truncate max-w-[10rem]" title={obs.asWrittenName}>
                          {obs.asWrittenName}
                        </td>
                        <td className="p-2 font-bold text-[var(--color-ink)]">
                          {obs.valueText}
                        </td>
                        <td className="p-2 text-[var(--color-ink-soft)]">
                          {obs.unitText || '—'}
                        </td>
                        <td className="p-2 text-[var(--color-ink-soft)]">
                          {obs.referenceRange?.text ? (
                            obs.referenceRange.text
                          ) : (
                            <span className="italic opacity-60">—</span>
                          )}
                        </td>
                        <td className="p-2">
                          {obs.flag ? (
                            <span
                              className={`px-1.5 py-0.5 font-bold uppercase rounded text-[10px] ${
                                obs.flag === 'H' || obs.flag === 'CRITICAL'
                                  ? 'bg-red-100 text-[var(--color-abnormal)]'
                                  : obs.flag === 'L'
                                    ? 'bg-red-100 text-[var(--color-abnormal)]'
                                    : 'border border-neutral-300 bg-neutral-50 text-neutral-700'
                              }`}
                            >
                              {obs.flag}
                            </span>
                          ) : (
                            <span className="text-[var(--color-ink-soft)] opacity-40">—</span>
                          )}
                        </td>
                        <td className="p-2 truncate max-w-[12rem]">
                          <Link
                            href={`/patients/${patientId}/sources/${obs.documentId}?fact=${obs.id}${obs.pageNumber ? `&page=${obs.pageNumber}` : ''}`}
                            className="text-[var(--color-accent)] underline decoration-dotted hover:decoration-solid"
                            title={obs.documentName}
                          >
                            {obs.documentName} {obs.pageNumber ? `· p${obs.pageNumber}` : ''}
                          </Link>
                        </td>
                        <td className="p-2">
                          <StateBadge state={obs.state} compact />
                        </td>
                        <td className="p-2 text-right">
                          <Link
                            href={`/patients/${patientId}/sources/${obs.documentId}?fact=${obs.id}${obs.pageNumber ? `&page=${obs.pageNumber}` : ''}`}
                            className="border border-[var(--color-rule-strong)] px-2 py-0.5 text-[11px] uppercase hover:bg-[var(--color-accent-soft)]"
                          >
                            View ↗
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="p-4 text-center text-xs italic text-[var(--color-ink-soft)]">
                No historical observations documented for this test.
              </p>
            )}
          </div>
        </div>
      ) : null}


    </div>
  );
}

/**
 * Dated history viewer for categorical or qualitative observations
 * (such as ER/PR receptor status, HER2, histology, blood group).
 */
function CategoricalHistoryView({
  observations,
  patientId,
  analyteLabel,
}: {
  observations: StructuredObservation[];
  patientId: string;
  analyteLabel: string;
}) {
  return (
    <div className="border border-[var(--color-rule-strong)] bg-white p-4">
      <div className="flex items-baseline justify-between border-b border-[var(--color-rule)] pb-2">
        <div>
          <span className="block text-xs font-semibold uppercase tracking-wider text-[var(--color-ink-soft)]">
            Dated Qualitative Event History
          </span>
          <h4 className="cc-card-title text-[var(--color-ink)]">
            {analyteLabel}
          </h4>
        </div>
        <span className="mono text-[11px] text-[var(--color-ink-soft)]">
          Categorical / Qualitative finding (preserved without numeric scaling)
        </span>
      </div>

      <div className="mt-4 space-y-3">
        {observations.map((obs) => (
          <div
            key={obs.id}
            className="border border-[var(--color-rule)] bg-[var(--color-paper)] p-3"
          >
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="mono text-xs font-semibold text-[var(--color-ink)]">
                  {obs.observedOn || obs.documentDate || 'Undated'}
                </span>
                <StateBadge state={obs.state} compact />
              </div>
              <Link
                href={`/patients/${patientId}/sources/${obs.documentId}?fact=${obs.id}${obs.pageNumber ? `&page=${obs.pageNumber}` : ''}`}
                className="mono text-xs text-[var(--color-accent)] underline decoration-dotted"
              >
                {obs.documentName} {obs.pageNumber ? `· p${obs.pageNumber}` : ''} →
              </Link>
            </div>

            <p className="mono mt-2 text-base font-bold text-[var(--color-ink)]">
              {obs.valueText}
            </p>

            <p className="doc-text mt-1 text-xs italic text-[var(--color-ink-soft)]">
              “{obs.verbatimQuote}”
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
