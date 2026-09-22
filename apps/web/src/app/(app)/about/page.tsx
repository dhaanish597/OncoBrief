import Link from 'next/link';
import { NON_CLINICAL_BOUNDARY_STATEMENT } from '@oncobrief/domain';

/**
 * What this is, and what it is not. Judge-facing honesty notes are a
 * first-class page, not a footnote (architecture §25.4, research §4.4).
 */
export default function AboutPage() {
  const hypotheses: [string, string][] = [
    [
      'Pre-consultation record search time falls',
      'Hypothesis. Peer-reviewed literature reports complex oncology chart preparation at 20–45 minutes per patient. Measurement: timed before/after task completion during a pilot.',
    ],
    [
      'Explicitly documented administrative tasks close more often',
      'Hypothesis. The unvalidated figures sometimes quoted (8→2 minutes, 20% capacity, 35–50% attrition reduction) trace to forum threads and vendor pages, not studies, and are not claimed here.',
    ],
    [
      'Source-visible facts are trusted more than generated summaries',
      'Hypothesis. Measurement: a structured reviewer survey with a pre-registered instrument.',
    ],
  ];

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <p className="mono text-[11px] uppercase tracking-[0.2em] text-[var(--color-ink-soft)]">
        What this is
      </p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight">
        An evidence-first operations layer, not a clinical assistant
      </h1>

      <section className="mt-8">
        <h2 className="text-sm font-semibold uppercase tracking-[0.14em]">The core idea</h2>
        <p className="mt-2 leading-relaxed text-[var(--color-ink-soft)]">
          OncoBrief turns fragmented documents into a structured <strong>Evidence Ledger</strong>.
          Every displayed fact keeps its source document, page, text span, extraction method,
          confidence band, reviewer and timestamp. The timeline is a <em>view</em> over that ledger,
          not a second store. Correcting a value never overwrites the original; it appends a new
          fact that points back at it. When two sources disagree the system keeps both, shows both,
          and asks a person to decide.
        </p>
      </section>

      <section className="mt-8 border border-[var(--color-rule-strong)] bg-[var(--color-paper-raised)] p-5">
        <h2 className="text-sm font-semibold uppercase tracking-[0.14em]">The boundary</h2>
        <p className="doc-text mt-2 text-lg leading-relaxed">{NON_CLINICAL_BOUNDARY_STATEMENT}</p>
        <ul className="mono mt-3 space-y-1 text-[11px] text-[var(--color-ink-soft)]">
          <li>· Fact types are a closed vocabulary, and clinical ones carry an <code>as_written</code> suffix.</li>
          <li>· Task kinds are a closed vocabulary of records-office actions.</li>
          <li>· A CI-failing scan rejects any vocabulary entry that reintroduces a clinical concept.</li>
        </ul>
      </section>

      <section className="mt-8">
        <h2 className="text-sm font-semibold uppercase tracking-[0.14em]">
          What is simulated, stubbed or unmeasured
        </h2>
        <ul className="mt-2 space-y-2 text-sm leading-relaxed text-[var(--color-ink-soft)]">
          <li>
            <strong>Patients are synthetic.</strong> Every fixture is badged in the interface. No
            real patient data is present.
          </li>
          <li>
            <strong>OCR is deterministic fixtures.</strong> Demo documents carry pre-computed spans
            so geometry is exact and reproducible. Scans with no text layer are quarantined for
            manual transcription instead of being guessed at; handwriting and low-quality Indic
            scans are beyond what is wired here.
          </li>
          <li>
            <strong>Patient delivery is simulated.</strong> The outbox says so. Real WhatsApp, SMS or
            IVR needs credentials this environment does not have.
          </li>
          <li>
            <strong>No LLM is used.</strong> Extraction is deterministic rules; the LLM boundary is
            specified but not wired. The spans a fact cites are always literally present in the
            document, enforced by a substring check before anything reaches the ledger.
          </li>
          <li>
            <strong>No penetration test, WAF, key management or compliance review.</strong> Stated
            as gaps, not as present.
          </li>
        </ul>
      </section>

      <section className="mt-8">
        <h2 className="text-sm font-semibold uppercase tracking-[0.14em]">Claims we make</h2>
        <dl className="mt-2 space-y-3">
          {hypotheses.map(([claim, method]) => (
            <div key={claim} className="border-l-2 border-[var(--color-rule-strong)] pl-3">
              <dt className="text-sm font-medium">{claim}</dt>
              <dd className="mono mt-0.5 text-[11px] leading-relaxed text-[var(--color-ink-soft)]">
                {method}
              </dd>
            </div>
          ))}
        </dl>
        <p className="mono mt-3 text-[11px] text-[var(--color-ink-soft)]">
          The only numbers quoted as results anywhere in this product are self-measured: candidates
          proposed, candidates that passed span validation, and candidates a human confirmed.
        </p>
      </section>

      <p className="mt-10">
        <Link href="/workspace" className="mono text-xs uppercase tracking-wider underline decoration-dotted">
          ← back to the workspace
        </Link>
      </p>
    </main>
  );
}
