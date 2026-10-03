import Link from 'next/link';
import { DOCUMENT_TYPES, DOCUMENT_TYPE_LABEL } from '@oncobrief/domain';
import { getPresignPut, listDocuments } from '@oncobrief/db';
import { withSession } from '@/lib/session';
import { DemoBadge, EmptyFinding, OriginBadge, SectionHeading } from '@/components/evidence';
import { confirmDocumentTypeAction, uploadDocumentAction } from '@/lib/actions';
import { DocumentUploadForm } from '@/components/DocumentUploadForm';

/**
 * Fragmented record sources. Documents are grouped by where they came from,
 * because the fragmentation — not the list — is the finding. Duplicates stay in
 * the inventory, flagged for human confirmation, never auto-hidden.
 */
export default async function SourcesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const docs = await withSession(async (q) => listDocuments(q, id));

  // With S3-backed storage the browser uploads straight to the bucket (the
  // cloud pipeline); with the filesystem driver the in-process action is used.
  const directUploadAvailable = getPresignPut() !== null;

  const byOrigin = new Map<string, typeof docs>();
  for (const d of docs) {
    const arr = byOrigin.get(d.recordOrigin) ?? [];
    arr.push(d);
    byOrigin.set(d.recordOrigin, arr);
  }

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <SectionHeading title="Sources" count={docs.length} />
        <p className="mono text-[11px] text-[var(--color-ink-soft)]">
          {byOrigin.size} origin{byOrigin.size === 1 ? '' : 's'}
        </p>
      </div>

      <p className="mt-3 max-w-4xl text-sm leading-relaxed text-[var(--color-ink-soft)]">
        Every document below is kept exactly as it arrived, with its origin, its version and the
        state of its ingestion. Classification is advisory until a records officer confirms it; a
        confirmed type is what can satisfy a checklist requirement.
      </p>

      <DocumentUploadForm
        patientId={id}
        fallbackAction={uploadDocumentAction}
        directUploadAvailable={directUploadAvailable}
      />

      {docs.length === 0 ? (
        <div className="mt-6">
          <EmptyFinding>No documents in this workspace.</EmptyFinding>
        </div>
      ) : null}

      {[...byOrigin.entries()].map(([origin, rows]) => (
        <section key={origin} className="mt-8">
          <h3 className="mb-2 flex items-baseline gap-3">
            <OriginBadge origin={origin} />
            <span className="mono text-[11px] text-[var(--color-ink-soft)]">{rows.length} documents</span>
          </h3>
          <ul className="border-t border-[var(--color-rule-strong)] bg-[var(--color-paper-raised)]">
            {rows.map((d) => (
              <li
                key={d.id}
                className="grid gap-3 border-b border-[var(--color-rule)] px-3 py-3 md:grid-cols-[1.6fr_1fr_auto]"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link
                      href={`/patients/${id}/sources/${d.id}`}
                      className="mono truncate text-sm text-[var(--color-accent)] underline decoration-dotted underline-offset-2"
                    >
                      {d.filename}
                    </Link>
                    {d.isDemoFixture ? <DemoBadge /> : null}
                    {d.duplicateOf ? (
                      <span className="mono border border-[var(--color-state-extracted)] px-1.5 py-0.5 text-[11px] uppercase text-[var(--color-state-extracted)]">
                        duplicate — confirm
                      </span>
                    ) : null}
                  </div>
                  <p className="mono mt-1 text-[11px] text-[var(--color-ink-soft)]">
                    {d.documentDate ?? 'no date'} · {d.issuingFacility ?? 'origin not stated'} ·{' '}
                    {d.pageCount ?? 0}p · {(d.byteSize / 1024).toFixed(0)}kb · v{d.docVersion}
                  </p>
                  <p className="mono mt-1 text-[11px] text-[var(--color-ink-soft)]">
                    ingest: <span style={{ color: d.ingestStatus === 'ready' ? undefined : 'var(--color-state-extracted)' }}>{d.ingestStatus}</span>
                    {d.ingestError ? ` · ${d.ingestError.replaceAll('_', ' ')}` : ''} · {d.factCount} facts
                  </p>
                </div>

                <form action={confirmDocumentTypeAction} className="flex items-start gap-2">
                  <input type="hidden" name="patientId" value={id} />
                  <input type="hidden" name="documentId" value={d.id} />
                  <label className="block w-full">
                    <span className="mono block text-[11px] uppercase tracking-wider text-[var(--color-ink-soft)]">
                      {d.typeConfirmed ? 'confirmed type' : 'suggested type'}
                    </span>
                    <select
                      name="documentType"
                      defaultValue={d.documentType ?? 'other'}
                      className="mono mt-1 w-full border border-[var(--color-rule-strong)] bg-white px-2 py-1 text-xs"
                    >
                      {DOCUMENT_TYPES.map((t) => (
                        <option key={t} value={t}>
                          {DOCUMENT_TYPE_LABEL[t]}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button
                    type="submit"
                    className="mono mt-5 border border-[var(--color-rule-strong)] px-2 py-1 text-[11px] uppercase tracking-wider hover:bg-[var(--color-accent-soft)]"
                  >
                    {d.typeConfirmed ? 're-confirm' : 'confirm'}
                  </button>
                </form>

                <div className="mono flex items-start justify-end text-[11px] text-[var(--color-ink-soft)]">
                  {d.typeConfirmed ? (
                    <span className="text-[var(--color-state-verified)]">✓ type confirmed</span>
                  ) : (
                    <span className="text-[var(--color-state-extracted)]">◌ advisory only</span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
