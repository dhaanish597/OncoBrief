import Link from 'next/link';
import { DOCUMENT_TYPES, DOCUMENT_TYPE_LABEL } from '@oncobrief/domain';
import {
  getAbdmGateway,
  getGuidelineDocument,
  getPresignPut,
  listDocuments,
  listGuidelineSpansForDocument,
  listPatientAbdmConsents,
  listPatientDocumentSubpackets,
} from '@oncobrief/db';
import { withSession } from '@/lib/session';
import { DemoBadge, EmptyFinding, OriginBadge, SectionHeading } from '@/components/evidence';
import {
  confirmDocumentTypeAction,
  uploadDocumentAction,
  revokeAbdmConsentAction,
} from '@/lib/actions';
import { AbdmPullControl } from '@/components/AbdmPullControl';
import { DocumentUploadForm } from '@/components/DocumentUploadForm';

/**
 * Fragmented record sources. Documents are grouped by where they came from,
 * because the fragmentation — not the list — is the finding. Duplicates stay in
 * the inventory, flagged for human confirmation, never auto-hidden.
 */
export default async function SourcesPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ guideline?: string; page?: string; span?: string }>;
}) {
  const { id } = await params;
  const resolvedSearch = searchParams ? await searchParams : {};
  const guidelineId = resolvedSearch.guideline ?? null;
  const activeGuidelinePage = Math.max(1, Number(resolvedSearch.page ?? '1') || 1);
  const selectedGuidelineSpanId = resolvedSearch.span ?? null;

  const { docs, abdmConsents, subpacketsByDoc, activeGuideline, guidelineSpans } =
    await withSession(async (q, s) => {
      const d = await listDocuments(q, id);
      const c = await listPatientAbdmConsents(q, id);
      const sp = await listPatientDocumentSubpackets(q, id);
      const gDoc = guidelineId ? await getGuidelineDocument(q, s.orgId, guidelineId) : null;
      const gSpans =
        guidelineId && gDoc ? await listGuidelineSpansForDocument(q, s.orgId, guidelineId) : [];
      return {
        docs: d,
        abdmConsents: c,
        subpacketsByDoc: sp,
        activeGuideline: gDoc,
        guidelineSpans: gSpans,
      };
    });

  // With S3-backed storage the browser uploads straight to the bucket (the
  // cloud pipeline); with the filesystem driver the in-process action is used.
  const directUploadAvailable = getPresignPut() !== null;

  const byOrigin = new Map<string, typeof docs>();
  for (const d of docs) {
    const arr = byOrigin.get(d.recordOrigin) ?? [];
    arr.push(d);
    byOrigin.set(d.recordOrigin, arr);
  }

  const guidelinePages = Array.from(new Set(guidelineSpans.map((s) => s.pageNumber))).sort(
    (a, b) => a - b,
  );
  const effectiveGuidelinePage = selectedGuidelineSpanId
    ? (guidelineSpans.find((s) => s.spanId === selectedGuidelineSpanId)?.pageNumber ??
        (guidelinePages.includes(activeGuidelinePage) ? activeGuidelinePage : (guidelinePages[0] ?? 1)))
    : guidelinePages.includes(activeGuidelinePage)
      ? activeGuidelinePage
      : (guidelinePages[0] ?? 1);

  const currentPageSpans = guidelineSpans.filter((s) => s.pageNumber === effectiveGuidelinePage);
  const highlightedSpanId =
    selectedGuidelineSpanId ?? currentPageSpans[0]?.spanId ?? null;

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

      {/* TASK-018: [G#] Institutional Guideline & SOP Source Viewer with Bounding-Box Highlight */}
      {activeGuideline ? (
        <section
          aria-label="Institutional Guideline Source Viewer"
          data-testid="guideline-source-viewer"
          className="mt-6 border-2 border-blue-700 bg-blue-50/40 p-5"
        >
          <div
            data-testid="guideline-nonclinical-disclaimer"
            className="mb-3 border border-amber-700 bg-[#fdf3df] px-3 py-1.5 font-mono text-xs font-semibold text-amber-950"
          >
            Reference Guideline Extract — For Clinician Review Only (Not a Patient-Specific Order)
          </div>

          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-blue-200 pb-3">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="mono bg-blue-700 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-white">
                  [G#] Institutional Guideline Source Inspector
                </span>
                <span className="mono text-xs font-semibold text-blue-950">
                  {activeGuideline.code} · {activeGuideline.versionLabel}
                </span>
                <span
                  className={`mono px-1.5 py-0.5 text-[10px] uppercase ${
                    activeGuideline.isActive
                      ? 'border border-emerald-700 bg-emerald-50 text-emerald-900'
                      : 'border border-rose-700 bg-rose-50 text-rose-900'
                  }`}
                >
                  {activeGuideline.isActive ? 'Current Authoritative SOP' : 'Superseded / Inactive'}
                </span>
              </div>
              <h3 className="mt-1.5 text-base font-semibold text-[var(--color-ink)]">
                {activeGuideline.title}
              </h3>
              <p className="mono mt-0.5 text-[11px] text-[var(--color-ink-soft)]">
                Issuing Body: {activeGuideline.issuingBody} · Published {activeGuideline.publicationDate} · SHA-256 {activeGuideline.contentSha256.slice(0, 16)}…
              </p>
            </div>
            <div className="flex items-center gap-3">
              <Link
                href={`/patients/${id}/packet`}
                className="mono border border-blue-700 bg-white px-2.5 py-1 text-[11px] uppercase text-blue-800 hover:bg-blue-50"
              >
                ← Back to Packet &amp; Studio
              </Link>
              <Link
                href={`/patients/${id}/sources`}
                className="mono border border-[var(--color-rule-strong)] bg-white px-2.5 py-1 text-[11px] uppercase text-[var(--color-ink-soft)]"
              >
                Close Viewer
              </Link>
            </div>
          </div>

          {guidelinePages.length > 1 ? (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="mono text-[11px] uppercase text-[var(--color-ink-soft)]">Page:</span>
              {guidelinePages.map((pNum) => (
                <Link
                  key={pNum}
                  href={`/patients/${id}/sources?guideline=${activeGuideline.id}&page=${pNum}`}
                  className={`mono border px-2 py-0.5 text-xs ${
                    pNum === effectiveGuidelinePage
                      ? 'border-blue-700 bg-blue-700 text-white font-semibold'
                      : 'border-blue-300 bg-white text-blue-900 hover:bg-blue-100'
                  }`}
                >
                  Page {pNum}
                </Link>
              ))}
            </div>
          ) : null}

          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            {/* Normalized Bounding-Box Page Canvas */}
            <div
              data-testid="guideline-bbox-canvas"
              className="relative min-h-[260px] border border-blue-300 bg-white p-3"
            >
              <p className="mono mb-2 text-[10px] uppercase tracking-wider text-slate-600">
                Page {effectiveGuidelinePage} Normalized Bounding-Box Map ([0, 1] Geometry)
              </p>
              <div className="relative h-56 w-full border border-dashed border-slate-300 bg-[#faf8f4]">
                {currentPageSpans.map((span) => {
                  const isHighlighted = span.spanId === highlightedSpanId;
                  return (
                    <Link
                      key={`bbox-${span.spanId}`}
                      href={`/patients/${id}/sources?guideline=${activeGuideline.id}&page=${span.pageNumber}&span=${span.spanId}`}
                      data-testid={isHighlighted ? 'guideline-bbox-highlighted' : 'guideline-bbox-box'}
                      style={{
                        left: `${Math.round(span.bbox.x * 100)}%`,
                        top: `${Math.round(span.bbox.y * 100)}%`,
                        width: `${Math.max(8, Math.round(span.bbox.w * 100))}%`,
                        height: `${Math.max(8, Math.round(span.bbox.h * 100))}%`,
                      }}
                      className={`absolute block overflow-hidden px-1 text-[9px] leading-tight transition-colors ${
                        isHighlighted
                          ? 'z-10 border-2 border-blue-700 bg-amber-200/75 font-semibold text-blue-950 shadow-xs'
                          : 'border border-slate-400/70 bg-white/80 text-slate-700 hover:border-blue-600'
                      }`}
                      title={`${span.sectionHeading}: ${span.verbatimText}`}
                    >
                      #{span.spanIndex} {span.verbatimText.slice(0, 48)}
                    </Link>
                  );
                })}
              </div>
            </div>

            {/* Verbatim Indexed Spans List */}
            <div className="space-y-2.5">
              {currentPageSpans.length === 0 ? (
                <p className="mono text-xs text-[var(--color-ink-soft)]">
                  No indexed spans found for this guideline page.
                </p>
              ) : (
                currentPageSpans.map((span) => {
                  const isHighlighted = span.spanId === highlightedSpanId;
                  return (
                    <article
                      key={span.spanId}
                      data-testid="guideline-viewer-span"
                      data-highlighted={isHighlighted ? 'true' : 'false'}
                      className={`border p-3 shadow-2xs ${
                        isHighlighted
                          ? 'border-2 border-blue-700 bg-amber-50/70'
                          : 'border-blue-200 bg-white'
                      }`}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
                        <Link
                          href={`/patients/${id}/sources?guideline=${activeGuideline.id}&page=${span.pageNumber}&span=${span.spanId}`}
                          className="mono font-semibold text-blue-900 underline decoration-dotted"
                        >
                          § {span.sectionHeading}
                        </Link>
                        <span className="mono text-[10px] text-slate-600">
                          p.{span.pageNumber} · span #{span.spanIndex} · bbox ({span.bbox.x.toFixed(2)},{' '}
                          {span.bbox.y.toFixed(2)}, {span.bbox.w.toFixed(2)}×{span.bbox.h.toFixed(2)})
                        </span>
                      </div>
                      <p className="doc-text mt-1.5 text-xs leading-relaxed text-[var(--color-ink)]">
                        “{span.verbatimText}”
                      </p>
                      {span.keywords.length > 0 ? (
                        <div className="mt-2 flex flex-wrap gap-1">
                          {span.keywords.map((kw) => (
                            <span
                              key={kw}
                              className="mono rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-700"
                            >
                              {kw}
                            </span>
                          ))}
                        </div>
                      ) : null}
                    </article>
                  );
                })
              )}
            </div>
          </div>
        </section>
      ) : null}

      <DocumentUploadForm
        patientId={id}
        abdmDriver={getAbdmGateway().driver}
        fallbackAction={uploadDocumentAction}
        directUploadAvailable={directUploadAvailable}
      />

      <section className="mt-6 border border-slate-200 p-4" aria-label="ABDM exchange status">
        <h3 className="mono text-sm">ABDM consent requests and transfers</h3>
        <p className="text-xs mt-2">{process.env.ABDM_DRIVER === 'sandbox' ? 'ABDM sandbox' : 'SIMULATED — synthetic records only; patient grant is simulated.'}</p>
        {abdmConsents.requests.map(request => (
          <p key={request.id} data-testid="abdm-request" className="mono mt-2 text-xs">
            Consent request {request.id}: {request.status}
          </p>
        ))}
        {abdmConsents.transfers.map(transfer => (
          <p key={transfer.id} data-testid="abdm-transfer" className="mono mt-2 text-xs">
            Transfer {transfer.id}: {transfer.status} · {transfer.receivedPages}/{transfer.pageCount} pages · {transfer.documentCount} imported documents
            {transfer.errorMessage ? ` · ${transfer.errorMessage}` : ''}
          </p>
        ))}
      </section>
      {abdmConsents.artifacts.length > 0 && (
        <section className="mt-6 border border-slate-200 bg-slate-50/50 p-4 rounded-lg">
          <h4 className="mono text-xs font-semibold uppercase tracking-wider text-slate-800">
            ABDM Consent Artifacts & Retention Deadlines
          </h4>
          <ul className="mt-3 divide-y divide-slate-200">
            {abdmConsents.artifacts.map((art) => (
              <li data-testid="abdm-artifact" key={art.id} className="py-2.5 flex flex-wrap items-center justify-between gap-3 text-xs">
                <div>
                  <span className="font-mono font-medium text-slate-800">{art.abdmConsentId}</span>
                  <span className="ml-2 text-slate-500">
                    Types: {art.hiTypes.join(', ')} · Erase at: {art.dataEraseAt.split('T')[0]}
                  </span>
                  <span
                    className={`ml-2 px-1.5 py-0.5 rounded text-[10px] uppercase font-mono ${
                      art.status === 'GRANTED' ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'
                    }`}
                  >
                    {art.status}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {art.status === 'GRANTED' ? (
                    <>
                      <AbdmPullControl patientId={id} consentId={art.abdmConsentId} />
                      <form action={revokeAbdmConsentAction}>
                        <input type="hidden" name="patientId" value={id} />
                        <input type="hidden" name="consentId" value={art.abdmConsentId} />
                        <button
                          type="submit"
                          className="mono border border-red-600 bg-red-50 px-2 py-1 text-[11px] text-red-700 hover:bg-red-100 uppercase"
                        >
                          revoke access & remove raw source
                        </button>
                      </form>
                    </>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

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
            {rows.map((d) => {
              const subpackets = subpacketsByDoc.get(d.id) ?? [];
              return (
                <li
                  key={d.id}
                  className="grid gap-3 border-b border-[var(--color-rule)] px-3 py-3 md:grid-cols-[1.6fr_1fr_auto]"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      {d.ingestError === 'consent_revoked_or_expired' ? (
                        <span className="mono text-sm">{d.filename} · access withdrawn</span>
                      ) : (
                        <Link
                          href={`/patients/${id}/sources/${d.id}`}
                          className="mono truncate text-sm text-[var(--color-accent)] underline decoration-dotted underline-offset-2"
                        >
                          {d.filename}
                        </Link>
                      )}
                      {d.isDemoFixture ? <DemoBadge /> : null}
                      {d.duplicateOf ? (
                        <span className="mono border border-[var(--color-state-extracted)] px-1.5 py-0.5 text-[11px] uppercase text-[var(--color-state-extracted)]">
                          duplicate — confirm
                        </span>
                      ) : null}
                      {subpackets.length > 1 ? (
                        <span
                          data-testid={`packet-segmented-badge-${d.id}`}
                          className="mono border border-blue-600 bg-blue-50 px-1.5 py-0.5 text-[10px] uppercase text-blue-800"
                        >
                          {subpackets.length} sub-reports segmented
                        </span>
                      ) : null}
                    </div>
                    <p className="mono mt-1 text-[11px] text-[var(--color-ink-soft)]">
                      {d.documentDate ?? 'no date'} · {d.issuingFacility ?? 'origin not stated'} ·{' '}
                      {d.pageCount ?? 0}p · {(d.byteSize / 1024).toFixed(0)}kb · v{d.docVersion}
                    </p>
                    <p className="mono mt-1 text-[11px] text-[var(--color-ink-soft)]">
                      ingest:{' '}
                      <span
                        style={{
                          color: d.ingestStatus === 'ready' ? undefined : 'var(--color-state-extracted)',
                        }}
                      >
                        {d.ingestStatus}
                      </span>
                      {d.ingestError ? ` · ${d.ingestError.replaceAll('_', ' ')}` : ''} · {d.factCount} facts
                    </p>
                    {/* TASK-017: Persistent Multi-Report Packet Breakdown */}
                    {subpackets.length > 0 && d.ingestError !== 'consent_revoked_or_expired' ? (
                      <div
                        data-testid={`document-subpackets-${d.id}`}
                        className="mt-2 flex flex-wrap gap-1.5"
                      >
                        {subpackets.map((sp) => (
                          <Link
                            key={`${d.id}-sp-${sp.subpacketIndex}`}
                            href={`/patients/${id}/sources/${d.id}?page=${sp.startPage}`}
                            className="mono border border-[var(--color-rule-strong)] bg-white px-2 py-0.5 text-[10px] text-[var(--color-ink)] hover:bg-[var(--color-accent-soft)]"
                            title={`Inspect sub-report #${sp.subpacketIndex} (${sp.category})`}
                          >
                            #{sp.subpacketIndex} {sp.category} (p.
                            {sp.startPage === sp.endPage
                              ? sp.startPage
                              : `${sp.startPage}–${sp.endPage}`}
                            {sp.statedDate ? ` · ${sp.statedDate}` : ''}
                            {sp.statedFacility ? ` · ${sp.statedFacility}` : ''})
                          </Link>
                        ))}
                      </div>
                    ) : null}
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
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
