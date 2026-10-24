'use client';

import Link from 'next/link';
import { StateBadge } from '@/components/evidence';
import type { ClinicalSummary } from '@oncobrief/db';

export function PatientOverviewCard({
  patientId,
  overview,
  patient,
}: {
  patientId: string;
  overview: ClinicalSummary['overview'];
  patient?: ClinicalSummary['patient'];
}) {
  const bmi = overview.derivedBMI;
  const bsa = overview.derivedBSA;

  return (
    <div className="border border-[var(--color-rule-strong)] bg-[var(--color-paper-raised)] p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-3 border-b border-[var(--color-rule)] pb-3">
        <div>
          <h2 id="section-patient-overview" className="cc-card-title text-[var(--color-ink)]">
            Patient Overview &amp; Documented Baseline
          </h2>
          <p className="cc-body mt-0.5 text-xs text-[var(--color-ink-soft)]">
            Values extracted verbatim from source records · Derivations labeled explicitly
          </p>
        </div>
      </div>

      {/* Grid of baseline metrics — source attachments hidden per B requirement */}
      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
        {/* Patient Name */}
        {patient?.displayName && (
          <div className="border border-[var(--color-rule)] bg-[var(--color-paper)] p-3">
            <span className="block text-xs font-semibold text-[var(--color-ink-soft)]">
              Patient Name
            </span>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="mono text-base font-semibold text-[var(--color-ink)]">
                {patient.displayName}
              </span>
            </div>
            <p className="mt-2 text-[11px] text-[var(--color-ink-soft)] italic">
              From patient registration record
            </p>
          </div>
        )}

        {/* Age & Sex */}
        <div className="border border-[var(--color-rule)] bg-[var(--color-paper)] p-3">
          <span className="block text-xs font-semibold text-[var(--color-ink-soft)]">
            Age &amp; Sex
          </span>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="mono text-base font-semibold text-[var(--color-ink)]">
              {overview.age?.value || 'Age unstated'}
              {overview.sex ? ` · ${overview.sex.value}` : ''}
            </span>
          </div>
          {!overview.age && (
            <p className="mt-2 text-xs italic text-[var(--color-ink-soft)]">
              Not documented in records
            </p>
          )}
        </div>

        {/* Height */}
        <div className="border border-[var(--color-rule)] bg-[var(--color-paper)] p-3">
          <span className="block text-xs font-semibold text-[var(--color-ink-soft)]">
            Height
          </span>
          {overview.height ? (
            <div className="mt-1 flex items-baseline gap-2">
              <span className="mono text-base font-semibold text-[var(--color-ink)]">
                {overview.height.formatted}
              </span>
              {overview.height.observedOn ? (
                <span className="mono text-[11px] text-[var(--color-ink-soft)]">
                  ({overview.height.observedOn})
                </span>
              ) : null}
            </div>
          ) : (
            <p className="mt-1 text-xs italic text-[var(--color-ink-soft)]">
              Not documented in records
            </p>
          )}
        </div>

        {/* Weight */}
        <div className="border border-[var(--color-rule)] bg-[var(--color-paper)] p-3">
          <span className="block text-xs font-semibold text-[var(--color-ink-soft)]">
            Weight
          </span>
          {overview.weight ? (
            <div className="mt-1 flex items-baseline gap-2">
              <span className="mono text-base font-semibold text-[var(--color-ink)]">
                {overview.weight.formatted}
              </span>
              {overview.weight.observedOn ? (
                <span className="mono text-[11px] text-[var(--color-ink-soft)]">
                  ({overview.weight.observedOn})
                </span>
              ) : null}
            </div>
          ) : (
            <p className="mt-1 text-xs italic text-[var(--color-ink-soft)]">
              Not documented in records
            </p>
          )}
        </div>

        {/* Blood Group and Rh */}
        <div className="border border-[var(--color-rule)] bg-[var(--color-paper)] p-3">
          <span className="block text-xs font-semibold text-[var(--color-ink-soft)]">
            Blood Group & Rh
          </span>
          {overview.bloodGroup ? (
            <p className="mono mt-1 text-base font-semibold text-[var(--color-ink)]">
              {overview.bloodGroup.value}
            </p>
          ) : (
            <p className="mt-1 text-xs italic text-[var(--color-ink-soft)]">
              Not documented
            </p>
          )}
        </div>

        {/* Documented Allergies */}
        <div className="border border-[var(--color-rule)] bg-[var(--color-paper)] p-3">
          <span className="block text-xs font-semibold text-[var(--color-ink-soft)]">
            Allergies
          </span>
          {overview.allergies ? (
            <p className="mono mt-1 text-sm font-semibold text-[var(--color-ink)]" title={overview.allergies.value}>
              {overview.allergies.value}
            </p>
          ) : (
            <p className="mt-1 text-xs italic text-[var(--color-ink-soft)]">
              No allergies documented
            </p>
          )}
        </div>

        {/* ECOG Performance Status */}
        <div className="border border-[var(--color-rule)] bg-[var(--color-paper)] p-3">
          <span className="block text-xs font-semibold text-[var(--color-ink-soft)]">
            ECOG Performance Status
          </span>
          {overview.ecog ? (
            <p className="mono mt-1 text-base font-semibold text-[var(--color-ink)]">
              ECOG {overview.ecog.value}
            </p>
          ) : (
            <p className="mt-1 text-xs italic text-[var(--color-ink-soft)]">
              Not documented
            </p>
          )}
        </div>

        {/* Relevant Comorbidities */}
        <div className="border border-[var(--color-rule)] bg-[var(--color-paper)] p-3 sm:col-span-2">
          <span className="block text-xs font-semibold text-[var(--color-ink-soft)]">
            Relevant Comorbidities
          </span>
          {overview.comorbidities ? (
            <p className="mono mt-1 text-sm font-semibold text-[var(--color-ink)]">
              {overview.comorbidities.value}
            </p>
          ) : (
            <p className="mt-1 text-xs italic text-[var(--color-ink-soft)]">
              No comorbidities documented in available records
            </p>
          )}
        </div>
      </div>

      {/* Derived Physiological Metrics: BSA and BMI */}
      <div className="mt-4 border-t border-[var(--color-rule)] pt-4">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--color-ink-soft)]">
          Derived Anthropometrics (Tested Mathematical Formulas)
        </h3>
        <div className="mt-2 grid grid-cols-1 gap-4 md:grid-cols-2">
          {/* Derived BMI Card */}
          <div className="border border-[var(--color-rule)] bg-[var(--color-paper)] p-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-[var(--color-ink)]">
                Body Mass Index (BMI)
              </span>
              <span className="mono border border-[var(--color-accent)] bg-[var(--color-accent-soft)] px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-[var(--color-accent)] font-medium">
                Derived
              </span>
            </div>
            {bmi.derived ? (
              <div className="mt-2">
                <p className="mono text-xl font-bold text-[var(--color-ink)]">{bmi.formattedValue}</p>
                <dl className="mono mt-2 grid grid-cols-[6rem_1fr] gap-y-0.5 text-[11px] text-[var(--color-ink-soft)]">
                  <dt>formula</dt>
                  <dd>{bmi.formula}</dd>
                  <dt>inputs</dt>
                  <dd>
                    {bmi.inputs.height?.value} cm ({bmi.inputDates.heightDate || 'no date'}) ·{' '}
                    {bmi.inputs.weight?.value} kg ({bmi.inputDates.weightDate || 'no date'})
                  </dd>
                  <dt>method</dt>
                  <dd>{bmi.methodName}</dd>
                </dl>
                {bmi.notes.map((n) => (
                  <p key={n} className="mono mt-1 text-[10px] text-[var(--color-state-extracted)]">
                    ⚠ {n}
                  </p>
                ))}
              </div>
            ) : (
              <p className="mt-2 text-xs italic text-[var(--color-ink-soft)]">
                {bmi.message}
              </p>
            )}
          </div>

          {/* Derived BSA Card */}
          <div className="border border-[var(--color-rule)] bg-[var(--color-paper)] p-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-[var(--color-ink)]">
                Body Surface Area (BSA)
              </span>
              <span className="mono border border-[var(--color-accent)] bg-[var(--color-accent-soft)] px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-[var(--color-accent)] font-medium">
                Derived
              </span>
            </div>
            {bsa.derived ? (
              <div className="mt-2">
                <p className="mono text-xl font-bold text-[var(--color-ink)]">{bsa.formattedValue}</p>
                <dl className="mono mt-2 grid grid-cols-[6rem_1fr] gap-y-0.5 text-[11px] text-[var(--color-ink-soft)]">
                  <dt>formula</dt>
                  <dd>{bsa.formula}</dd>
                  <dt>inputs</dt>
                  <dd>
                    {bsa.inputs.height?.value} cm ({bsa.inputDates.heightDate || 'no date'}) ·{' '}
                    {bsa.inputs.weight?.value} kg ({bsa.inputDates.weightDate || 'no date'})
                  </dd>
                  <dt>method</dt>
                  <dd>{bsa.methodName}</dd>
                </dl>
                {bsa.notes.map((n) => (
                  <p key={n} className="mono mt-1 text-[10px] text-[var(--color-state-extracted)]">
                    ⚠ {n}
                  </p>
                ))}
              </div>
            ) : (
              <p className="mt-2 text-xs italic text-[var(--color-ink-soft)]">
                {bsa.message}
              </p>
            )}
          </div>
        </div>
      </div>
      <details className="mt-4 border-t border-[var(--color-rule)] pt-3 text-sm">
        <summary>Baseline sources and verification</summary>
        <p>Conflicting measurements remain in the observation history for human reconciliation.</p>
        {Object.entries(overview).map(([label, item]) => {
          if (!item || typeof item !== 'object' || !('factId' in item)) return null;
          return <div key={label} className="mt-2 flex flex-wrap gap-2">
            <span>{label} · {item.observedOn || 'Date unstated'}</span>
            <StateBadge state={item.state} compact />
            <Link className="break-all underline" href={`/patients/${patientId}/sources/${item.sourceDocumentId}?fact=${item.factId}${item.sourcePageNumber ? `&page=${item.sourcePageNumber}` : ''}`}>
              {item.sourceDocumentName} · Page {item.sourcePageNumber ?? 'unstated'}
            </Link>
          </div>;
        })}
      </details>
    </div>
  );
}
