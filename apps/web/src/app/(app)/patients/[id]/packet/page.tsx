import { can } from '@oncobrief/domain';
import { getPacket, listPackets, listStudioArtifacts } from '@oncobrief/db';
import { requireSession, withSession } from '@/lib/session';
import { EmptyFinding, SectionHeading, StateBadge } from '@/components/evidence';
import { ProductivityStudio } from '@/components/ProductivityStudio';
import {
  approvePacketAction,
  createPacketAction,
  submitPacketAction,
  linkPacketCareContextAction,
} from '@/lib/actions';

/**
 * Consultation packet (architecture §11).
 *
 * Two sections are non-negotiable and render even when empty: open conflicts
 * and missing documents. A consult-prep artefact that quietly omits what it
 * does not know is the omission failure mode. Unverified items are included and
 * badged, never dropped.
 */
export default async function PacketPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requireSession();
  const canDraft = can(session.role, 'packet:draft');
  const canApprove = can(session.role, 'packet:approve');
  const canExport = can(session.role, 'packet:export');

  const data = await withSession(async (q, s) => {
    const packets = await listPackets(q, id);
    const latest = packets[0] ? await getPacket(q, s.orgId, packets[0].id) : null;
    let abdmCareContext: { careContextReference: string; status: string; linkedAt: string | null } | null = null;
    if (latest) {
      const ccRes = await q.query<{ care_context_reference: string; status: string; linked_at: Date | null }>(
        `SELECT care_context_reference, status, linked_at FROM abdm_care_context WHERE org_id = $1 AND packet_id = $2`,
        [s.orgId, latest.id],
      );
      if (ccRes.rows[0]) {
        abdmCareContext = {
          careContextReference: ccRes.rows[0].care_context_reference,
          status: ccRes.rows[0].status,
          linkedAt: ccRes.rows[0].linked_at ? (ccRes.rows[0].linked_at.toISOString().split('T')[0] ?? null) : null,
        };
      }
    }
    const studioArtifacts = await listStudioArtifacts(q, s.orgId, id);
    return { packets, latest, abdmCareContext, studioArtifacts };
  });

  const { packets, latest, abdmCareContext, studioArtifacts } = data;

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <SectionHeading title="Consultation packet" count={packets.length} />
        {canDraft ? (
          <form action={createPacketAction} className="flex flex-wrap items-end gap-2">
            <input type="hidden" name="patientId" value={id} />
            <label className="block">
              <span className="sr-only">Encounter label</span>
              <input
                name="encounterLabel"
                placeholder="encounter label"
                defaultValue="Surgical oncology OPD"
                aria-label="Encounter label"
                className="mono border border-[var(--color-rule-strong)] bg-white px-2.5 py-1.5 text-xs text-[var(--color-ink)]"
              />
            </label>
            <button
              type="submit"
              className="mono border border-[var(--color-ink)] px-3 py-1.5 text-[11px] uppercase tracking-wider hover:bg-[var(--color-accent-soft)]"
            >
              assemble draft
            </button>
          </form>
        ) : (
          <span className="mono text-[11px] text-[var(--color-ink-soft)] border border-[var(--color-rule)] px-2.5 py-1">
            Drafting requires clinician or coordinator role
          </span>
        )}
      </div>

      {!latest ? (
        <div className="mt-6">
          <EmptyFinding>
            No packet yet. Assembling one renders the ledger as it stands now, including what is
            missing and what is unresolved.
          </EmptyFinding>
        </div>
      ) : (
        <>
          <div className="mt-6 border border-[var(--color-rule-strong)] bg-[var(--color-paper-raised)]">
            <div className="flex flex-wrap items-center gap-3 border-b border-[var(--color-rule)] px-4 py-3">
              <span className="mono text-xs uppercase tracking-wider">{latest.status.replaceAll('_', ' ')}</span>
              <span className="mono text-[11px] text-[var(--color-ink-soft)]">{latest.encounterLabel}</span>
              {latest.snapshotSha256 ? (
                <span className="mono text-[11px] text-[var(--color-ink-soft)]">
                  sha256 {latest.snapshotSha256.slice(0, 16)}… · frozen at ledger seq{' '}
                  {latest.ledgerSeqAtApproval}
                </span>
              ) : null}
              <span className="ml-auto flex flex-wrap items-center gap-2">
                {latest.status === 'draft' ? (
                  <form action={submitPacketAction}>
                    <input type="hidden" name="patientId" value={id} />
                    <input type="hidden" name="packetId" value={latest.id} />
                    <button type="submit" className="mono border border-[var(--color-rule-strong)] px-3 py-1 text-[11px] uppercase">
                      submit for approval
                    </button>
                  </form>
                ) : null}
                {latest.status === 'draft' || latest.status === 'pending_approval' ? (
                  canApprove ? (
                    <form action={approvePacketAction} className="flex items-center gap-2">
                      <input type="hidden" name="patientId" value={id} />
                      <input type="hidden" name="packetId" value={latest.id} />
                      <label className="block">
                        <span className="sr-only">Approval note</span>
                        <input
                          name="approvalNote"
                          placeholder="approval note"
                          aria-label="Approval note"
                          className="mono border border-[var(--color-rule-strong)] bg-white px-2 py-1 text-xs"
                        />
                      </label>
                      <button
                        type="submit"
                        data-testid="approve-packet"
                        className="mono border border-[var(--color-state-verified)] px-3 py-1 text-[11px] uppercase text-[var(--color-state-verified)] hover:bg-[#e8f3ea]"
                      >
                        approve packet
                      </button>
                    </form>
                  ) : (
                    <span className="mono border border-[var(--color-rule)] px-2 py-1 text-[10px] text-[var(--color-ink-soft)]">
                      approval requires clinician authority
                    </span>
                  )
                ) : null}
                {canExport && latest.status === 'approved' && !latest.sourcesUnavailable ? (
                  <>
                    <a
                      href={`/api/v1/packets/${latest.id}/export`}
                      className="mono border border-[var(--color-rule-strong)] px-2.5 py-1 text-[11px] uppercase hover:bg-[var(--color-accent-soft)]"
                      data-testid="export-packet"
                      title="Export standard OncoBrief Consultation Packet JSON"
                    >
                      export json
                    </a>
                    <a
                      href={`/api/v1/packets/${latest.id}/export?format=abdm`}
                      className="mono border border-blue-600 bg-blue-50 px-2.5 py-1 text-[11px] uppercase text-blue-800 hover:bg-blue-100"
                      data-testid="export-abdm-fhir"
                      title="Export NRCeS v6.5.0 FHIR DocumentBundle"
                    >
                      export abdm fhir
                    </a>
                    <a
                      href={`/api/v1/packets/${latest.id}/export?format=mcode`}
                      className="mono border border-purple-600 bg-purple-50 px-2.5 py-1 text-[11px] uppercase text-purple-800 hover:bg-purple-100"
                      data-testid="export-mcode-fhir"
                      title="Export HL7 mCODE STU4 FHIR Bundle"
                    >
                      export mcode
                    </a>
                    {abdmCareContext?.status === 'LINKED' ? (
                      <span className="mono border border-emerald-600 bg-emerald-50 px-2 py-1 text-[10px] text-emerald-800">
                        ABDM LINKED · {abdmCareContext.careContextReference}
                      </span>
                    ) : (
                      <form action={linkPacketCareContextAction} className="inline-block">
                        <input type="hidden" name="patientId" value={id} />
                        <input type="hidden" name="packetId" value={latest.id} />
                        <button
                          type="submit"
                          className="mono border border-blue-600 px-2.5 py-1 text-[11px] uppercase text-blue-700 hover:bg-blue-50"
                          title="Link approved consultation packet to ABDM Care Context (M2 HIP)"
                        >
                          link abdm care context
                        </button>
                      </form>
                    )}
                  </>
                ) : canExport && !latest.sourcesUnavailable ? (
                  <a
                    href={`/api/v1/packets/${latest.id}/export`}
                    className="mono border border-[var(--color-rule-strong)] px-3 py-1 text-[11px] uppercase hover:bg-[var(--color-accent-soft)]"
                    data-testid="export-packet"
                  >
                    export json
                  </a>
                ) : null}
              </span>
            </div>

            {latest.ledgerAdvanced ? (
              <p className="mono border-b border-[var(--color-rule)] bg-[#fdf3df] px-4 py-2 text-[11px]">
                ⚠ the ledger has advanced since this packet was approved. Nothing has been rewritten;
                create a successor packet to reflect the new evidence.
              </p>
            ) : null}

            {latest.assembled ? (
              <div className="divide-y divide-[var(--color-rule)]">
                {latest.assembled.sections.map((section) => (
                  <section key={section.section} className="px-4 py-4">
                    <h3 className="mono text-[11px] uppercase tracking-[0.18em] text-[var(--color-ink-soft)]">
                      {section.label}
                      <span className="ml-2">{section.items.length}</span>
                    </h3>
                    {section.items.length === 0 ? (
                      <p className="mono mt-2 text-[11px] text-[var(--color-ink-soft)]">
                        — nothing to report in this section (rendered anyway: absence is a finding)
                      </p>
                    ) : (
                      <ul className="mt-2 space-y-1.5">
                        {section.items.map((item) => (
                          <li key={`${section.section}-${item.ordinal}`} className="flex flex-wrap items-baseline gap-2 text-sm">
                            {item.fact ? (
                              <>
                                <span className="mono text-[11px] uppercase text-[var(--color-ink-soft)]">
                                  {item.fact.factType.replaceAll('.', ' · ')}
                                </span>
                                <span className="mono">{item.fact.valueText}</span>
                                <StateBadge state={item.fact.state} compact />
                                <span className="mono text-[11px] text-[var(--color-ink-soft)]">
                                  {item.fact.documentName} p{item.fact.pageNumber}
                                  {item.fact.reviewerName ? ` · ${item.fact.reviewerName}` : ''}
                                </span>
                              </>
                            ) : null}
                            {item.gap ? (
                              <>
                                <span className="mono text-[11px] uppercase text-[var(--color-ink-soft)]">
                                  missing document
                                </span>
                                <span className="mono">{item.gap.checklistItemLabel}</span>
                                <span className="mono text-[11px] text-[var(--color-state-conflicting)]">
                                  {item.gap.status}
                                </span>
                              </>
                            ) : null}
                            {item.conflict ? (
                              <>
                                <span className="mono text-[11px] uppercase text-[var(--color-ink-soft)]">
                                  open conflict
                                </span>
                                <span className="mono">
                                  {item.conflict.factType} — {item.conflict.memberValueTexts.join('  |  ')}
                                </span>
                              </>
                            ) : null}
                            {item.task ? (
                              <>
                                <span className="mono text-[11px] uppercase text-[var(--color-ink-soft)]">
                                  task
                                </span>
                                <span className="mono">{item.task.title}</span>
                                <span className="mono text-[11px] text-[var(--color-ink-soft)]">{item.task.status}</span>
                              </>
                            ) : null}
                          </li>
                        ))}
                      </ul>
                    )}
                  </section>
                ))}
              </div>
            ) : (
              <p className="mono px-4 py-4 text-xs text-[var(--color-ink-soft)]">
                {latest.sourcesUnavailable ? 'Source withdrawn or unavailable. Frozen content is hidden and export is blocked; review accessible sources in a successor packet.' : 'Draft assembled but not yet frozen. Approval serialises and hashes the content.'}
              </p>
            )}
          </div>

          <p className="mono mt-3 max-w-3xl text-[11px] leading-relaxed text-[var(--color-ink-soft)]">
            The packet contains no generated prose. Every line is a rendered evidence row with its
            provenance, and approval freezes the content — later ledger activity cannot alter it.
          </p>
        </>
      )}

      {/* Clinician Productivity Studio (Use Case 05) */}
      <ProductivityStudio
        patientId={id}
        artifacts={studioArtifacts}
        canDraft={canDraft}
        canApprove={canApprove}
        canExport={canExport}
      />
    </div>
  );
}

