import { notFound, forbidden } from 'next/navigation';
import { can } from '@oncobrief/domain';
import { getPatientClinicalSummary } from '@oncobrief/db';
import { requireSession, withSession } from '@/lib/session';
import {
  PatientOverviewCard,
  ClinicalCardsSection,
  UniversalValueExplorer,
} from '@/components/clinical';

/**
 * Clinical Context and Universal Clinical Value Explorer Page.
 *
 * Displays documented patient baseline metrics, expandable clinical cards
 * across pathology, biomarkers, treatment and laboratory findings, operational
 * Quick Insights, and the Universal Value Explorer for dynamic cross-analyte
 * longitudinal trend analysis.
 *
 * All observations are grounded in primary source documents with verifiable
 * text spans and direct links to the Source Inspector.
 */
export default async function ClinicalContextPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await requireSession();

  if (!can(session.role, 'patient:read')) {
    forbidden();
  }

  const summary = await withSession(async (q) => getPatientClinicalSummary(q, id));

  if (!summary) {
    notFound();
  }

  const totalObs = summary.allObservations.length;
  const verifiedObs = summary.allObservations.filter((o) => o.state === 'verified').length;
  const unverifiedObs = summary.allObservations.filter((o) => o.state === 'extracted').length;

  return (
    <div className="clinical-context-scope space-y-8">
      {/* Page Header */}
      <div>
        <div className="flex flex-wrap items-end justify-between gap-4 border-b border-[var(--color-rule-strong)] pb-4">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="cc-main-heading text-[var(--color-ink)]">
                Clinical Context
              </h1>
              <span className="mono border border-[var(--color-rule-strong)] bg-white px-2 py-0.5 text-xs text-[var(--color-ink-soft)]">
                {totalObs} facts
              </span>
            </div>
            <p className="cc-body mt-2 max-w-4xl leading-relaxed text-[var(--color-ink-soft)]">
              Documented patient baseline and longitudinal clinical observations extracted verbatim from
              uploaded medical records. The Universal Value Explorer enables cross-analyte trend visualization with
              source provenance, reference intervals, and treatment event context.
            </p>
          </div>
          <div className="text-right">
            <span className="mono block text-xs font-semibold text-[var(--color-ink)]">
              {verifiedObs} verified · {unverifiedObs} unverified
            </span>
            <span className="mono mt-0.5 block text-[11px] text-[var(--color-ink-soft)]">
              {summary.analyteGroups.length} analyte group{summary.analyteGroups.length === 1 ? '' : 's'} on record
            </span>
          </div>
        </div>
      </div>

      {/* A. Patient Overview & Baseline Anthropometrics */}
      <section aria-labelledby="section-patient-overview">
        <PatientOverviewCard patientId={id} overview={summary.overview} patient={summary.patient} />
      </section>

      {/* B & E. Expandable Clinical Cards & Quick Insights */}
      <section aria-labelledby="section-clinical-cards">
        <div className="mb-3">
          <h2 id="section-clinical-cards" className="cc-section-heading text-[var(--color-ink)]">
            Documented Clinical Categories & Quick Insights
          </h2>
          <p className="cc-body text-xs text-[var(--color-ink-soft)]">
            Source-documented category cards with explicit verification states.
          </p>
        </div>
        <ClinicalCardsSection patientId={id} cards={summary.cards} />
      </section>

      {/* C & D. Universal Value Explorer & Dynamic Expandable Trend Charts */}
      <section aria-labelledby="section-universal-explorer">
        <div className="mb-3">
          <h2 id="section-universal-explorer" className="cc-section-heading text-[var(--color-ink)]">
            Universal Value Explorer & Longitudinal History
          </h2>
          <p className="cc-body text-xs text-[var(--color-ink-soft)]">
            Universal multi-analyte search, chronological trend charting, reference-range contextualization, and click-to-source traceability.
          </p>
        </div>
        <UniversalValueExplorer
          patientId={id}
          analyteGroups={summary.analyteGroups}
          treatment={summary.cards.treatment}
        />
      </section>
    </div>
  );
}
