'use client';

import { useState, useEffect } from 'react';
import type { StudioArtifactRecord } from '@oncobrief/db';
import {
  createStudioArtifactAction,
  updateStudioArtifactAction,
  approveStudioArtifactAction,
} from '@/lib/actions';

interface ProductivityStudioProps {
  patientId: string;
  artifacts: StudioArtifactRecord[];
  canDraft: boolean;
  canApprove: boolean;
  canExport: boolean;
}

const ARTIFACT_KINDS = [
  { kind: 'referral_letter', label: '1. Specialist Referral / Transfer Letter', desc: 'Transfer summary with procedures, serial lab flowsheets and sign-off fields' },
  { kind: 'tumor_board_deck', label: '2. Multidisciplinary Tumor Board Deck', desc: 'Structured slide-by-slide presentation with facts, conflicts, and NCG guideline links' },
  { kind: 'academic_case_abstract', label: '3. De-Identified Academic Case Report', desc: 'Research & teaching draft with relative day offsets; direct identifiers must pass review' },
  { kind: 'patient_info_sheet', label: '4. Patient & Caregiver Visit Summary', desc: 'Plain-language administrative guidance with verified appointments and documents to bring' },
] as const;

export function ProductivityStudio({
  patientId,
  artifacts,
  canDraft,
  canApprove,
  canExport,
}: ProductivityStudioProps) {
  const [selectedArtifactId, setSelectedArtifactId] = useState<string | null>(
    artifacts[0]?.id ?? null,
  );
  const [selectedKind, setSelectedKind] = useState<string>('referral_letter');
  const [activeTab, setActiveTab] = useState<'editor' | 'slides' | 'citations'>('editor');

  const selected = artifacts.find((a) => a.id === selectedArtifactId) ?? artifacts[0] ?? null;

  const [editableTitle, setEditableTitle] = useState(selected?.title ?? '');
  const [editableMarkdown, setEditableMarkdown] = useState(selected?.markdownBody ?? '');

  const latestId = artifacts[0]?.id;
  useEffect(() => {
    if (artifacts[0]) {
      setSelectedArtifactId(artifacts[0].id);
      setEditableTitle(artifacts[0].title);
      setEditableMarkdown(artifacts[0].markdownBody);
      if (artifacts[0].artifactKind === 'tumor_board_deck') {
        setActiveTab('slides');
      } else {
        setActiveTab('editor');
      }
    }
  }, [latestId]);

  // Synchronize when selection changes
  const handleSelect = (art: StudioArtifactRecord) => {
    setSelectedArtifactId(art.id);
    setEditableTitle(art.title);
    setEditableMarkdown(art.markdownBody);
    if (art.artifactKind === 'tumor_board_deck') {
      setActiveTab('slides');
    } else {
      setActiveTab('editor');
    }
  };

  // Extract slides for slide preview
  const slides = selected?.markdownBody
    ? selected.markdownBody.split(/\n---\n/).map((s) => s.trim()).filter((s) => s.length > 0)
    : [];

  return (
    <section
      aria-label="Clinician Productivity Studio"
      className="mt-8 border border-[var(--color-rule-strong)] bg-[var(--color-paper-raised)] p-5"
      data-testid="productivity-studio"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--color-rule)] pb-4">
        <div>
          <h2 className="mono text-sm font-semibold uppercase tracking-wider text-[var(--color-ink)]">
            Clinician Productivity & Document Studio
          </h2>
          <p className="mono mt-1 text-xs text-[var(--color-ink-soft)]">
            Generate and edit source-cited oncology artifacts from verified Evidence Ledger facts and institutional SOPs
          </p>
        </div>
        <span className="mono border border-[var(--color-rule)] bg-white px-2.5 py-1 text-[11px] text-[var(--color-ink-soft)]">
          {artifacts.length} draft{artifacts.length === 1 ? '' : 's'} available
        </span>
      </div>

      {/* Draft Creation Form */}
      {canDraft ? (
        <form
          action={createStudioArtifactAction}
          className="mt-4 border border-[var(--color-rule)] bg-white p-4"
          data-testid="create-studio-draft-form"
        >
          <input type="hidden" name="patientId" value={patientId} />
          <h3 className="mono text-xs font-semibold uppercase tracking-wider text-[var(--color-ink)]">
            Compose New Oncology Document Draft
          </h3>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="artifactKindSelect" className="mono block text-[11px] text-[var(--color-ink-soft)]">
                Document Format
              </label>
              <select
                id="artifactKindSelect"
                name="artifactKind"
                value={selectedKind}
                onChange={(e) => setSelectedKind(e.target.value)}
                className="mono mt-1 w-full border border-[var(--color-rule-strong)] bg-white px-2.5 py-1.5 text-xs text-[var(--color-ink)]"
                data-testid="artifact-kind-select"
              >
                {ARTIFACT_KINDS.map((k) => (
                  <option key={k.kind} value={k.kind}>
                    {k.label}
                  </option>
                ))}
              </select>
              <p className="mono mt-1 text-[10px] text-[var(--color-ink-soft)]">
                {ARTIFACT_KINDS.find((k) => k.kind === selectedKind)?.desc}
              </p>
            </div>
            <div className="flex flex-col justify-end">
              <label className="flex items-center gap-2 mb-2 cursor-pointer">
                <input
                  type="checkbox"
                  name="includeUnverified"
                  value="true"
                  className="rounded border-[var(--color-rule-strong)] text-[var(--color-accent)]"
                />
                <span className="mono text-[11px] text-[var(--color-ink-soft)]">
                  Include unverified facts in preview draft (labeled before sign-off)
                </span>
              </label>
              <button
                type="submit"
                className="mono border border-[var(--color-ink)] bg-[var(--color-ink)] px-4 py-2 text-xs uppercase tracking-wider text-white hover:bg-black transition-colors"
                data-testid="generate-draft-btn"
              >
                Generate Source-Cited Draft
              </button>
            </div>
          </div>
        </form>
      ) : null}

      {/* Artifact Inventory & Detail Workspace */}
      {artifacts.length === 0 ? (
        <p className="mono mt-6 text-xs text-[var(--color-ink-soft)]">
          No studio artifacts generated yet for this patient. Select a format above to generate a source-grounded draft.
        </p>
      ) : (
        <div className="mt-6 grid gap-6 lg:grid-cols-12">
          {/* Artifact Selector Sidebar */}
          <div className="lg:col-span-4 border border-[var(--color-rule)] bg-white p-3 divide-y divide-[var(--color-rule)]">
            <h4 className="mono text-[11px] uppercase font-semibold text-[var(--color-ink-soft)] pb-2">
              Saved Documents & Drafts
            </h4>
            <div className="pt-2 space-y-2">
              {artifacts.map((art) => {
                const isCurrent = art.id === selected?.id;
                return (
                  <button
                    key={art.id}
                    type="button"
                    onClick={() => handleSelect(art)}
                    className={`w-full text-left p-2.5 transition-colors border ${
                      isCurrent
                        ? 'border-[var(--color-accent)] bg-[var(--color-accent-soft)]'
                        : 'border-transparent hover:bg-slate-50'
                    }`}
                    data-testid={`artifact-card-${art.id}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="mono text-[10px] uppercase text-[var(--color-ink-soft)]">
                        {art.artifactKind.replaceAll('_', ' ')}
                      </span>
                      <span
                        className={`mono text-[9px] uppercase px-1.5 py-0.5 rounded font-medium ${
                          art.status === 'approved'
                            ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                            : 'bg-amber-100 text-amber-800 border border-amber-300'
                        }`}
                      >
                        {art.status}
                      </span>
                    </div>
                    <p className="mono mt-1 text-xs font-medium text-[var(--color-ink)] truncate" title={art.title}>
                      {art.title}
                    </p>
                    <p className="mono mt-1 text-[10px] text-[var(--color-ink-soft)]">
                      {art.citedFactIds.length} fact citations · {art.citedGuidelineIds.length} guideline citations
                    </p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Active Artifact Workspace */}
          {selected?.sourcesUnavailable ? (
            <div className="lg:col-span-8 border border-amber-700 bg-amber-50 p-4" role="status">
              Source unavailable: this document is restricted because a backing source was withdrawn or is no longer accessible. Preview, approval, printing and export are blocked.
            </div>
          ) : selected ? (
            <div className="lg:col-span-8 border border-[var(--color-rule)] bg-white p-4">
              {/* Header with Status & Actions */}
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--color-rule)] pb-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`mono text-[10px] uppercase px-2 py-0.5 rounded font-semibold ${
                        selected.status === 'approved'
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-amber-100 text-amber-800'
                      }`}
                    >
                      {selected.status.toUpperCase()}
                    </span>
                    {selected.isDeidentified ? (
                      <span className="mono text-[10px] uppercase px-2 py-0.5 rounded bg-blue-100 text-blue-800 border border-blue-200">
                        DIRECT IDENTIFIERS CHECKED
                      </span>
                    ) : null}
                  </div>
                  {selected.snapshotSha256 ? (
                    <p className="mono mt-1 text-[10px] text-[var(--color-ink-soft)]">
                      Frozen SHA-256: {selected.snapshotSha256.slice(0, 16)}… · Signed by Clinician
                    </p>
                  ) : (
                    <p className="mono mt-1 text-[10px] text-[var(--color-ink-soft)]">
                      Editable draft · Requires clinician approval to freeze and export
                    </p>
                  )}
                </div>

                {/* View Mode Tabs */}
                <div className="flex items-center gap-1 border border-[var(--color-rule)] p-0.5 bg-slate-50">
                  <button
                    type="button"
                    onClick={() => setActiveTab('editor')}
                    className={`mono px-2.5 py-1 text-[10px] uppercase ${
                      activeTab === 'editor' ? 'bg-white shadow-sm font-semibold' : 'text-slate-600'
                    }`}
                    data-testid="editor-tab"
                  >
                    Markdown
                  </button>
                  {selected.artifactKind === 'tumor_board_deck' ? (
                    <button
                      type="button"
                      onClick={() => setActiveTab('slides')}
                      className={`mono px-2.5 py-1 text-[10px] uppercase ${
                        activeTab === 'slides' ? 'bg-white shadow-sm font-semibold' : 'text-slate-600'
                      }`}
                      data-testid="slides-tab"
                    >
                      Slides View
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => setActiveTab('citations')}
                    className={`mono px-2.5 py-1 text-[10px] uppercase ${
                      activeTab === 'citations' ? 'bg-white shadow-sm font-semibold' : 'text-slate-600'
                    }`}
                  >
                    Citations ({selected.citedFactIds.length + selected.citedGuidelineIds.length})
                  </button>
                </div>
              </div>

              {/* View Content */}
              {activeTab === 'slides' && selected.artifactKind === 'tumor_board_deck' ? (
                <div className="mt-4 space-y-4" data-testid="tumor-board-slides-view">
                  <div className="flex justify-between items-center mb-2">
                    <span className="mono text-[11px] text-[var(--color-ink-soft)]">
                      Printable Slide Deck ({slides.length} slides)
                    </span>
                    <span className="mono text-[10px] text-[var(--color-ink-soft)]">Use an audited export below to save this document.</span>
                  </div>
                  {slides.map((slide, idx) => (
                    <article
                      key={idx}
                      className="border-2 border-slate-300 bg-slate-50/50 p-4 rounded shadow-sm"
                    >
                      <span className="mono text-[10px] uppercase tracking-wider text-slate-500 font-semibold">
                        Slide {idx + 1}
                      </span>
                      <pre className="mt-2 font-mono text-xs whitespace-pre-wrap leading-relaxed text-slate-800">
                        {slide}
                      </pre>
                    </article>
                  ))}
                </div>
              ) : activeTab === 'citations' ? (
                <div className="mt-4 space-y-3">
                  <h5 className="mono text-xs font-semibold uppercase text-[var(--color-ink)]">
                    Evidentiary Provenance & Ledger Anchors
                  </h5>
                  <p className="mono text-[11px] text-[var(--color-ink-soft)]">
                    Every factual claim maps to an immutable source span or institutional reference SOP:
                  </p>
                  <div className="mt-2 space-y-2">
                    {selected.citedFactIds.map((factId, idx) => (
                      <div
                        key={factId}
                        className="border border-[var(--color-rule)] p-2.5 bg-slate-50/50 text-xs flex justify-between items-center"
                      >
                        <span className="mono font-semibold text-[var(--color-accent)]">[E{idx + 1}]</span>
                        <span className="mono text-[11px] text-slate-700 truncate max-w-md">Fact ID: {factId}</span>
                        <span className="mono text-[10px] uppercase text-emerald-700 bg-emerald-50 px-1.5 py-0.5 border border-emerald-200">
                          Anchored to Ledger
                        </span>
                      </div>
                    ))}
                    {selected.citedGuidelineIds.map((guideId, idx) => (
                      <div
                        key={guideId}
                        className="border border-[var(--color-rule)] p-2.5 bg-blue-50/30 text-xs flex justify-between items-center"
                      >
                        <span className="mono font-semibold text-blue-800">[G{idx + 1}]</span>
                        <span className="mono text-[11px] text-slate-700 truncate max-w-md">Guideline Doc ID: {guideId}</span>
                        <span className="mono text-[10px] uppercase text-blue-700 bg-blue-50 px-1.5 py-0.5 border border-blue-200">
                          Institutional Reference
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="mt-4">
                  {selected.status === 'draft' ? (
                    <form action={updateStudioArtifactAction} className="space-y-3">
                      <input type="hidden" name="patientId" value={patientId} />
                      <input type="hidden" name="artifactId" value={selected.id} />
                      <div>
                        <label className="mono block text-[11px] text-[var(--color-ink-soft)]">
                          Document Title
                        </label>
                        <input
                          name="title"
                          value={editableTitle}
                          onChange={(e) => setEditableTitle(e.target.value)}
                          className="mono mt-1 w-full border border-[var(--color-rule-strong)] bg-white px-2.5 py-1.5 text-xs text-[var(--color-ink)]"
                        />
                      </div>
                      <div>
                        <label className="mono block text-[11px] text-[var(--color-ink-soft)]">
                          Draft Body (Markdown with [E#] & [G#] Citations)
                        </label>
                        <textarea
                          name="markdownBody"
                          rows={14}
                          value={editableMarkdown}
                          onChange={(e) => setEditableMarkdown(e.target.value)}
                          className="mono mt-1 w-full border border-[var(--color-rule-strong)] bg-white p-3 text-xs leading-relaxed text-[var(--color-ink)] font-mono"
                          data-testid="studio-markdown-editor"
                        />
                      </div>
                      <div className="flex justify-between items-center pt-2">
                        <span className="mono text-[10px] text-[var(--color-ink-soft)]">
                          Edits are audited · Modifying factual text revalidates citations automatically
                        </span>
                        <button
                          type="submit"
                          className="mono border border-[var(--color-ink)] px-3 py-1.5 text-xs uppercase tracking-wider hover:bg-[var(--color-accent-soft)]"
                          data-testid="save-draft-btn"
                        >
                          Save Draft Revision
                        </button>
                      </div>
                    </form>
                  ) : (
                    <div>
                      <h4 className="mono text-xs font-semibold text-[var(--color-ink)]">{selected.title}</h4>
                      <pre className="mt-3 p-4 border border-[var(--color-rule)] bg-slate-50/50 font-mono text-xs whitespace-pre-wrap leading-relaxed text-slate-800">
                        {selected.markdownBody}
                      </pre>
                    </div>
                  )}
                </div>
              )}

              {/* Approval & Export Actions Footer */}
              <div className="mt-6 border-t border-[var(--color-rule)] pt-4 flex flex-wrap items-center justify-between gap-3">
                {selected.status === 'draft' ? (
                  canApprove ? (
                    <form action={approveStudioArtifactAction} className="flex items-center gap-2">
                      <input type="hidden" name="patientId" value={patientId} />
                      <input type="hidden" name="artifactId" value={selected.id} />
                      <input
                        name="approvalNote"
                        placeholder="clinician approval note"
                        aria-label="Clinician approval note"
                        className="mono border border-[var(--color-rule-strong)] bg-white px-2 py-1 text-xs"
                      />
                      <button
                        type="submit"
                        data-testid="approve-studio-artifact"
                        className="mono border border-emerald-600 bg-emerald-600 px-3 py-1 text-[11px] uppercase tracking-wider text-white hover:bg-emerald-700 transition-colors"
                      >
                        Approve & Freeze Document
                      </button>
                    </form>
                  ) : (
                    <span className="mono text-[11px] text-[var(--color-ink-soft)] border border-[var(--color-rule)] px-2.5 py-1">
                      Approval requires clinician authority
                    </span>
                  )
                ) : (
                  <span className="mono text-xs text-emerald-800 font-semibold">
                    ✓ Document Approved & Frozen · Immutable
                  </span>
                )}

                {/* Export Options */}
                {canExport && selected.status === 'approved' ? (
                  <div className="flex flex-wrap items-center gap-2">

                    <a
                      href={`/api/v1/studio/${selected.id}/export?format=markdown`}
                      className="mono border border-[var(--color-rule-strong)] px-2.5 py-1 text-[10px] uppercase hover:bg-[var(--color-accent-soft)]"
                      data-testid="export-studio-markdown"
                    >
                      Export Markdown
                    </a>
                    <a
                      href={`/api/v1/studio/${selected.id}/export?format=json`}
                      className="mono border border-[var(--color-rule-strong)] px-2.5 py-1 text-[10px] uppercase hover:bg-[var(--color-accent-soft)]"
                    >
                      Export JSON
                    </a>
                    {!selected.isDeidentified ? <><a
                      href={`/api/v1/studio/${selected.id}/export?format=abdm`}
                      className="mono border border-blue-600 bg-blue-50 px-2 py-1 text-[10px] uppercase text-blue-800 hover:bg-blue-100"
                    >
                      ABDM FHIR
                    </a>
                    <a
                      href={`/api/v1/studio/${selected.id}/export?format=mcode`}
                      className="mono border border-purple-600 bg-purple-50 px-2 py-1 text-[10px] uppercase text-purple-800 hover:bg-purple-100"
                    >
                      mCODE FHIR
                    </a></> : <span className="mono text-xs">FHIR export unavailable for de-identified drafts</span>}
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>
      )}
    </section>
  );
}
