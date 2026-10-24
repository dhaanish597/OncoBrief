'use client';

import Link from 'next/link';
import { StateBadge } from '@/components/evidence';
import { ExpandableClinicalCard } from './ExpandableClinicalCard';
import type { ClinicalSummary } from '@oncobrief/db';

export function ClinicalCardsSection({
  patientId,
  cards,
}: {
  patientId: string;
  cards: ClinicalSummary['cards'];
}) {
  const { pathology, treatment, recentLabs, quickInsights } = cards;

  // 1. Pathology preview text
  const pathologySummaryParts: string[] = [];
  if (pathology.diagnosis.length > 0) {
    pathologySummaryParts.push(pathology.diagnosis[0]!.text);
  }
  if (pathology.staging.length > 0) {
    pathologySummaryParts.push(`Stage: ${pathology.staging[0]!.text}`);
  }
  if (pathology.biomarkers.length > 0) {
    const bmBrief = pathology.biomarkers
      .slice(0, 3)
      .map((b) => `${b.canonicalLabel}: ${b.valueText}`)
      .join(', ');
    pathologySummaryParts.push(bmBrief);
  }
  const pathologyPreviewText = pathologySummaryParts.length > 0
    ? pathologySummaryParts.join(' · ')
    : 'No pathology or biomarker records available';

  // 2. Treatment preview text
  const treatmentSummaryParts: string[] = [];
  if (treatment.procedures.length > 0) {
    treatmentSummaryParts.push(`Proc: ${treatment.procedures[0]!.name}`);
  }
  if (treatment.cycles.length > 0) {
    treatmentSummaryParts.push(`Cycle: ${treatment.cycles[0]!.label}`);
  }
  if (treatment.appointments.length > 0) {
    treatmentSummaryParts.push(`Appt: ${treatment.appointments[0]!.date}`);
  }
  if (treatment.followups.length > 0) {
    treatmentSummaryParts.push(`Follow-up: ${treatment.followups[0]!.date}`);
  }
  const treatmentPreviewText = treatmentSummaryParts.length > 0
    ? treatmentSummaryParts.join(' · ')
    : 'No treatment or follow-up milestones documented';

  // 3. Recent labs preview
  const recentLabsPreviewText = recentLabs.length > 0
    ? recentLabs
        .slice(0, 4)
        .map((l) => `${l.canonicalLabel}: ${l.numericValue !== null && l.numericValue !== undefined ? l.numericValue : l.valueText}${l.unitText ? ` ${l.unitText}` : ''}${l.flag ? ` [${l.flag}]` : ''}`)
        .join(' · ')
    : 'No recent laboratory results extracted';

  // 4. Quick Insights preview
  const insightsPreviewText = `${quickInsights.totalDocuments} document${quickInsights.totalDocuments === 1 ? '' : 's'} · ${quickInsights.totalFacts} facts · ${quickInsights.verifiedFacts} verified · ${quickInsights.unverifiedFacts} unverified${quickInsights.conflictingFacts > 0 ? ` · ${quickInsights.conflictingFacts} conflicting` : ''}`;

  return (
    <div className="space-y-4">
      {/* 1. Pathology and Biomarkers Card */}
      <ExpandableClinicalCard
        title="Pathology and biomarkers"
        badge={pathology.diagnosis.length + pathology.staging.length + pathology.biomarkers.length}
        defaultExpanded={false}
        preview={
          <p className="truncate text-xs text-[var(--color-ink)]" title={pathologyPreviewText}>
            {pathologyPreviewText}
          </p>
        }
      >
        <div className="space-y-4">
          {/* Diagnosis section */}
          <div>
            <span className="mono block text-[11px] uppercase tracking-wider text-[var(--color-ink-soft)]">
              Documented Diagnoses
            </span>
            {pathology.diagnosis.length > 0 ? (
              <div className="mt-2 space-y-2">
                {pathology.diagnosis.map((d) => (
                  <div
                    key={d.factId}
                    className="flex flex-wrap items-baseline justify-between gap-2 border border-[var(--color-rule)] bg-[var(--color-paper)] p-2.5"
                  >
                    <div>
                      <p className="text-sm font-semibold text-[var(--color-ink)]">{d.text}</p>
                      {d.observedOn ? (
                        <span className="mono text-[11px] text-[var(--color-ink-soft)]">
                          Documented on {d.observedOn}
                        </span>
                      ) : null}
                    </div>
                    <div className="flex items-center gap-2">
                      <StateBadge state={d.state} compact />
                      <Link
                        href={`/patients/${patientId}/sources/${d.sourceDocumentId}?fact=${d.factId}${d.sourcePageNumber ? `&page=${d.sourcePageNumber}` : ''}`}
                        className="mono text-xs text-[var(--color-accent)] underline decoration-dotted"
                        title={d.sourceDocumentName}
                      >
                        {d.sourceDocumentName}
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-1 text-xs italic text-[var(--color-ink-soft)]">
                No formal cancer diagnosis extracted yet.
              </p>
            )}
          </div>

          {/* Staging section */}
          <div>
            <span className="mono block text-[11px] uppercase tracking-wider text-[var(--color-ink-soft)]">
              Staging & Histopathology Notes
            </span>
            {pathology.staging.length > 0 ? (
              <div className="mt-2 space-y-2">
                {pathology.staging.map((s) => (
                  <div
                    key={s.factId}
                    className="flex flex-wrap items-baseline justify-between gap-2 border border-[var(--color-rule)] bg-[var(--color-paper)] p-2.5"
                  >
                    <p className="text-sm text-[var(--color-ink)]">{s.text}</p>
                    <div className="flex items-center gap-2">
                      <StateBadge state={s.state} compact />
                      <Link
                        href={`/patients/${patientId}/sources/${s.sourceDocumentId}?fact=${s.factId}${s.sourcePageNumber ? `&page=${s.sourcePageNumber}` : ''}`}
                        className="mono text-xs text-[var(--color-accent)] underline decoration-dotted"
                        title={s.sourceDocumentName}
                      >
                        {s.sourceDocumentName}
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-1 text-xs italic text-[var(--color-ink-soft)]">
                No documented TNM staging notes on file.
              </p>
            )}
          </div>

          {/* Biomarkers grid */}
          <div>
            <span className="mono block text-[11px] uppercase tracking-wider text-[var(--color-ink-soft)]">
              Receptor Status & Molecular Markers
            </span>
            {pathology.biomarkers.length > 0 ? (
              <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2 md:grid-cols-3">
                {pathology.biomarkers.map((b) => (
                  <div
                    key={b.id}
                    className="border border-[var(--color-rule)] bg-[var(--color-paper)] p-2.5"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-[var(--color-ink)]">
                        {b.canonicalLabel}
                      </span>
                      <StateBadge state={b.state} compact />
                    </div>
                    <p className="mono mt-1 text-sm font-bold text-[var(--color-ink)]">
                      {b.valueText}
                    </p>
                    <div className="mt-1 flex items-center justify-between text-[11px]">
                      <span className="mono text-[10px] text-[var(--color-ink-soft)]">
                        {b.observedOn || b.documentDate || 'Undated'}
                      </span>
                      <Link
                        href={`/patients/${patientId}/sources/${b.documentId}?fact=${b.id}${b.pageNumber ? `&page=${b.pageNumber}` : ''}`}
                        className="mono text-[10px] text-[var(--color-accent)] underline decoration-dotted"
                        title={b.documentName}
                      >
                        {b.documentName}
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-1 text-xs italic text-[var(--color-ink-soft)]">
                No receptor markers (ER/PR/HER2/Ki-67) documented in current reports.
              </p>
            )}
          </div>
        </div>
      </ExpandableClinicalCard>

      {/* 2. Latest documented treatment and follow-up Card */}
      <ExpandableClinicalCard
        title="Latest documented treatment and follow-up"
        badge={treatment.procedures.length + treatment.cycles.length + treatment.appointments.length + treatment.followups.length}
        defaultExpanded={false}
        preview={
          <p className="truncate text-xs text-[var(--color-ink)]" title={treatmentPreviewText}>
            {treatmentPreviewText}
          </p>
        }
      >
        <div className="space-y-4">
          {/* Procedures */}
          <div>
            <span className="mono block text-[11px] uppercase tracking-wider text-[var(--color-ink-soft)]">
              Documented Procedures & Surgery
            </span>
            {treatment.procedures.length > 0 ? (
              <div className="mt-2 space-y-2">
                {treatment.procedures.map((p) => (
                  <div
                    key={p.factId}
                    className="flex flex-wrap items-baseline justify-between gap-2 border border-[var(--color-rule)] bg-[var(--color-paper)] p-2.5"
                  >
                    <div>
                      <p className="text-sm font-semibold text-[var(--color-ink)]">{p.name}</p>
                      {p.observedOn ? (
                        <span className="mono text-[11px] text-[var(--color-ink-soft)]">
                          Observed {p.observedOn}
                        </span>
                      ) : null}
                    </div>
                    <div className="flex items-center gap-2">
                      <StateBadge state={p.state} compact />
                      <Link
                        href={`/patients/${patientId}/sources/${p.sourceDocumentId}?fact=${p.factId}${p.sourcePageNumber ? `&page=${p.sourcePageNumber}` : ''}`}
                        className="mono text-xs text-[var(--color-accent)] underline decoration-dotted"
                        title={p.sourceDocumentName}
                      >
                        {p.sourceDocumentName}
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-1 text-xs italic text-[var(--color-ink-soft)]">
                No surgeries or major procedures extracted.
              </p>
            )}
          </div>

          {/* Chemotherapy Cycles */}
          <div>
            <span className="mono block text-[11px] uppercase tracking-wider text-[var(--color-ink-soft)]">
              Chemotherapy Regimens & Cycles
            </span>
            {treatment.cycles.length > 0 ? (
              <div className="mt-2 space-y-2">
                {treatment.cycles.map((c) => (
                  <div
                    key={c.factId}
                    className="flex flex-wrap items-baseline justify-between gap-2 border border-[var(--color-rule)] bg-[var(--color-paper)] p-2.5"
                  >
                    <div>
                      <p className="mono text-sm font-bold text-[var(--color-ink)]">{c.label}</p>
                      {c.observedOn ? (
                        <span className="mono text-[11px] text-[var(--color-ink-soft)]">
                          Recorded on {c.observedOn}
                        </span>
                      ) : null}
                    </div>
                    <div className="flex items-center gap-2">
                      <StateBadge state={c.state} compact />
                      <Link
                        href={`/patients/${patientId}/sources/${c.sourceDocumentId}?fact=${c.factId}${c.sourcePageNumber ? `&page=${c.sourcePageNumber}` : ''}`}
                        className="mono text-xs text-[var(--color-accent)] underline decoration-dotted"
                        title={c.sourceDocumentName}
                      >
                        {c.sourceDocumentName}
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-1 text-xs italic text-[var(--color-ink-soft)]">
                No specific chemotherapy cycles recorded.
              </p>
            )}
          </div>

          {/* Appointments & Follow-up */}
          <div>
            <span className="mono block text-[11px] uppercase tracking-wider text-[var(--color-ink-soft)]">
              Documented Appointments & Follow-up Plans
            </span>
            {treatment.appointments.length > 0 || treatment.followups.length > 0 ? (
              <div className="mt-2 space-y-2">
                {treatment.appointments.map((a) => (
                  <div
                    key={a.factId}
                    className="flex flex-wrap items-baseline justify-between gap-2 border border-[var(--color-rule)] bg-[var(--color-paper)] p-2.5"
                  >
                    <div>
                      <span className="mono text-xs font-semibold text-[var(--color-ink)]">
                        {a.date}
                      </span>
                      {a.detail ? (
                        <p className="text-xs text-[var(--color-ink-soft)]">{a.detail}</p>
                      ) : null}
                    </div>
                    <div className="flex items-center gap-2">
                      <StateBadge state={a.state} compact />
                      <Link
                        href={`/patients/${patientId}/sources/${a.sourceDocumentId}?fact=${a.factId}${a.sourcePageNumber ? `&page=${a.sourcePageNumber}` : ''}`}
                        className="mono text-xs text-[var(--color-accent)] underline decoration-dotted"
                        title={a.sourceDocumentName}
                      >
                        {a.sourceDocumentName}
                      </Link>
                    </div>
                  </div>
                ))}
                {treatment.followups.map((f) => (
                  <div
                    key={f.factId}
                    className="flex flex-wrap items-baseline justify-between gap-2 border border-[var(--color-rule)] bg-[var(--color-paper)] p-2.5"
                  >
                    <div>
                      <span className="mono text-xs font-semibold text-[var(--color-ink)]">
                        Follow-up scheduled: {f.date}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <StateBadge state={f.state} compact />
                      <Link
                        href={`/patients/${patientId}/sources/${f.sourceDocumentId}?fact=${f.factId}${f.sourcePageNumber ? `&page=${f.sourcePageNumber}` : ''}`}
                        className="mono text-xs text-[var(--color-accent)] underline decoration-dotted"
                        title={f.sourceDocumentName}
                      >
                        {f.sourceDocumentName}
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-1 text-xs italic text-[var(--color-ink-soft)]">
                No future follow-up consultations currently documented.
              </p>
            )}
          </div>
        </div>
      </ExpandableClinicalCard>

      {/* 3. Recent laboratory results Card */}
      <ExpandableClinicalCard
        title="Recent laboratory results"
        badge={recentLabs.length}
        defaultExpanded={false}
        preview={
          <p className="truncate text-xs text-[var(--color-ink)]" title={recentLabsPreviewText}>
            {recentLabsPreviewText}
          </p>
        }
      >
        <div className="space-y-3">
          <p className="cc-body text-xs text-[var(--color-ink-soft)]">
            Most recent measurements across key laboratory panels. For full longitudinal trend charts and historical entries, explore the Universal Value Explorer below.
          </p>
          {recentLabs.length > 0 ? (
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
              {recentLabs.map((lab) => (
                <div
                  key={lab.id}
                  className="border border-[var(--color-rule)] bg-[var(--color-paper)] p-3"
                >
                  <div className="flex items-start justify-between gap-1">
                    <span className="text-xs font-semibold text-[var(--color-ink)]">
                      {lab.canonicalLabel}
                    </span>
                    <StateBadge state={lab.state} compact />
                  </div>

                  <div className="mt-1.5 flex items-baseline gap-2">
                    <span className="mono text-lg font-bold text-[var(--color-ink)]">
                      {lab.valueText}
                    </span>
                    {lab.unitText ? (
                      <span className="mono text-xs text-[var(--color-ink-soft)]">
                        {lab.unitText}
                      </span>
                    ) : null}
                    {lab.flag ? (
                      <span
                        className={`mono ml-auto border px-1.5 py-0.2 text-[10px] font-semibold uppercase ${
                          lab.flag === 'H' || lab.flag === 'CRITICAL'
                            ? 'border-[var(--color-abnormal)] bg-red-50 text-[var(--color-abnormal)]'
                            : 'border-blue-400 bg-blue-50 text-blue-700'
                        }`}
                      >
                        {lab.flag}
                      </span>
                    ) : null}
                  </div>

                  <dl className="mono mt-2 grid grid-cols-[4.5rem_1fr] gap-y-0.5 text-[11px] text-[var(--color-ink-soft)]">
                    <dt>observed</dt>
                    <dd>{lab.observedOn || lab.documentDate || 'Unstated'}</dd>
                    <dt>ref range</dt>
                    <dd>{lab.referenceRange?.text || 'None reported'}</dd>
                  </dl>

                  <div className="mt-2 text-right">
                    <Link
                      href={`/patients/${patientId}/sources/${lab.documentId}?fact=${lab.id}${lab.pageNumber ? `&page=${lab.pageNumber}` : ''}`}
                      className="mono text-[10px] text-[var(--color-accent)] underline decoration-dotted"
                      title={lab.documentName}
                    >
                      {lab.documentName} {lab.pageNumber ? `· p${lab.pageNumber}` : ''}
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs italic text-[var(--color-ink-soft)]">
              No laboratory results available in uploaded records.
            </p>
          )}
        </div>
      </ExpandableClinicalCard>

      {/* 4. Quick Insights Card */}
      <ExpandableClinicalCard
        title="Quick Insights"
        badge={quickInsights.insights.length}
        defaultExpanded={false}
        preview={
          <p className="truncate text-xs text-[var(--color-ink)]" title={insightsPreviewText}>
            {insightsPreviewText}
          </p>
        }
      >
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-5">
            <div className="border border-[var(--color-rule)] bg-[var(--color-paper)] p-2 text-center">
              <span className="mono block text-xl font-bold text-[var(--color-ink)]">
                {quickInsights.totalDocuments}
              </span>
              <span className="mono text-[10px] uppercase tracking-wider text-[var(--color-ink-soft)]">
                Documents
              </span>
            </div>
            <div className="border border-[var(--color-rule)] bg-[var(--color-paper)] p-2 text-center">
              <span className="mono block text-xl font-bold text-[var(--color-ink)]">
                {quickInsights.totalOrigins}
              </span>
              <span className="mono text-[10px] uppercase tracking-wider text-[var(--color-ink-soft)]">
                Record Origins
              </span>
            </div>
            <div className="border border-[var(--color-rule)] bg-[var(--color-paper)] p-2 text-center">
              <span className="mono block text-xl font-bold text-[var(--color-ink)]">
                {quickInsights.totalFacts}
              </span>
              <span className="mono text-[10px] uppercase tracking-wider text-[var(--color-ink-soft)]">
                Extracted Facts
              </span>
            </div>
            <div className="border border-[var(--color-rule)] bg-[var(--color-paper)] p-2 text-center">
              <span className="mono block text-xl font-bold text-emerald-700">
                {quickInsights.verifiedFacts}
              </span>
              <span className="mono text-[10px] uppercase tracking-wider text-[var(--color-ink-soft)]">
                Verified
              </span>
            </div>
            <div className="border border-[var(--color-rule)] bg-[var(--color-paper)] p-2 text-center">
              <span className="mono block text-xl font-bold text-[var(--color-state-extracted)]">
                {quickInsights.unverifiedFacts}
              </span>
              <span className="mono text-[10px] uppercase tracking-wider text-[var(--color-ink-soft)]">
                Pending Verification
              </span>
            </div>
          </div>

          {/* Operational observations list */}
          <div className="space-y-2">
            <span className="mono block text-[11px] uppercase tracking-wider text-[var(--color-ink-soft)]">
              Operational Findings
            </span>
            {quickInsights.insights.map((insight) => (
              <div
                key={insight.title}
                className="border border-[var(--color-rule)] bg-[var(--color-paper)] p-3"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-[var(--color-ink)]">
                    {insight.title}
                  </span>
                  <span
                    className={`mono text-[10px] uppercase tracking-wider ${
                      insight.kind === 'conflict'
                        ? 'text-[var(--color-abnormal)] font-semibold'
                        : insight.kind === 'verification'
                          ? 'text-emerald-700 font-semibold'
                          : 'text-[var(--color-ink-soft)]'
                    }`}
                  >
                    {insight.kind}
                  </span>
                </div>
                <p className="cc-body mt-1 text-xs leading-relaxed text-[var(--color-ink-soft)]">
                  {insight.detail}
                </p>
              </div>
            ))}
          </div>
        </div>
      </ExpandableClinicalCard>
    </div>
  );
}
