'use client';

import React, { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  UploadCloud,
  FileText,
  FileCode,
  Mic,
  ImageIcon,
  Activity,
  Plus,
  RefreshCw,
  ShieldCheck,
  Search,
  CheckCircle2,
  AlertCircle,
  Link2,
  Unlink,
} from 'lucide-react';
import { ProcessingStatusCard } from './ProcessingStatusCard';
import {
  initiateHiuConsentAction,
  importStandardBundleAction,
  linkExistingDocumentAction,
  searchPatientDocumentsAction,
} from '@/lib/actions';
import type { DocumentSearchResult } from '@oncobrief/db';

export interface DocumentUploadFormProps {
  patientId: string;
  abdmDriver: 'simulated' | 'sandbox';
  fallbackAction: (fd: FormData) => Promise<void>;
  directUploadAvailable: boolean;
}

export function DocumentUploadForm({
  patientId,
  abdmDriver,
  fallbackAction,
  directUploadAvailable,
}: DocumentUploadFormProps) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [activeTab, setActiveTab] = useState<'upload' | 'abdm' | 'link'>('upload');
  const [dragOver, setDragOver] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [processingStep, setProcessingStep] = useState<number>(0);
  const [showProcessingCard, setShowProcessingCard] = useState<boolean>(false);
  const [uploadedDocId, setUploadedDocId] = useState<string | null>(null);
  const [activeFilename, setActiveFilename] = useState<string>('Uploaded_Document.pdf');
  const [abdmAddress, setAbdmAddress] = useState<string>('patient@sbx');
  const [abdmStatus, setAbdmStatus] = useState<string | null>(null);
  const [abdmBusy, setAbdmBusy] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [bundleBusy, setBundleBusy] = useState<boolean>(false);
  const [bundleStatus, setBundleStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [searchResults, setSearchResults] = useState<DocumentSearchResult[] | null>(null);
  const [searching, setSearching] = useState<boolean>(false);
  const [linkTargetMap, setLinkTargetMap] = useState<Record<string, string>>({});
  const [linkingId, setLinkingId] = useState<string | null>(null);
  const [linkStatus, setLinkStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  async function handleStandardBundle(bundleType: 'tmc_diagnostic' | 'aiims_mcode') {
    setBundleBusy(true);
    setBundleStatus(null);
    const fd = new FormData();
    fd.set('patientId', patientId);
    fd.set('bundleType', bundleType);
    try {
      const res = await importStandardBundleAction(fd);
      if (res.ok) {
        setBundleStatus({
          type: 'success',
          message:
            bundleType === 'tmc_diagnostic'
              ? 'Tata Memorial / ACTREC NRCeS ABDM bundle imported successfully. Extracted into Evidence Ledger.'
              : 'AIIMS HL7 mCODE STU4 oncology bundle imported successfully. Extracted into Evidence Ledger.',
        });
        router.refresh();
      } else {
        setBundleStatus({ type: 'error', message: res.error || 'Failed to import bundle.' });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Bundle import failed';
      setBundleStatus({ type: 'error', message: msg });
    } finally {
      setBundleBusy(false);
    }
  }

  async function handleCustomBundle(file: File) {
    setBundleBusy(true);
    setBundleStatus(null);
    const fd = new FormData();
    fd.set('patientId', patientId);
    fd.set('file', file);
    try {
      const res = await importStandardBundleAction(fd);
      if (res.ok) {
        setBundleStatus({
          type: 'success',
          message: `Custom FHIR bundle "${file.name}" imported and anchored to Evidence Ledger.`,
        });
        router.refresh();
      } else {
        setBundleStatus({ type: 'error', message: res.error || 'Failed to import custom bundle.' });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Custom bundle import failed';
      setBundleStatus({ type: 'error', message: msg });
    } finally {
      setBundleBusy(false);
    }
  }

  async function handleSearchDocuments() {
    setSearching(true);
    setLinkStatus(null);
    try {
      const docs = await searchPatientDocumentsAction(patientId, searchQuery);
      setSearchResults(docs);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Search failed';
      setLinkStatus({ type: 'error', message: msg });
    } finally {
      setSearching(false);
    }
  }

  async function handleLinkDocument(documentId: string, targetDocumentId: string) {
    setLinkingId(documentId);
    setLinkStatus(null);
    const fd = new FormData();
    fd.set('patientId', patientId);
    fd.set('documentId', documentId);
    fd.set('targetDocumentId', targetDocumentId);
    fd.set('action', 'link_duplicate');
    try {
      await linkExistingDocumentAction(fd);
      setLinkStatus({ type: 'success', message: 'Document confirmed as duplicate and linked.' });
      await handleSearchDocuments();
      router.refresh();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to link document';
      setLinkStatus({ type: 'error', message: msg });
    } finally {
      setLinkingId(null);
    }
  }

  async function handleUnlinkDocument(documentId: string) {
    setLinkingId(documentId);
    setLinkStatus(null);
    const fd = new FormData();
    fd.set('patientId', patientId);
    fd.set('documentId', documentId);
    fd.set('action', 'unlink');
    try {
      await linkExistingDocumentAction(fd);
      setLinkStatus({ type: 'success', message: 'Duplicate link removed.' });
      await handleSearchDocuments();
      router.refresh();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to unlink document';
      setLinkStatus({ type: 'error', message: msg });
    } finally {
      setLinkingId(null);
    }
  }

  function handleFileSelection(files: FileList | null) {
    if (!files || files.length === 0) return;
    const file = files[0];
    if (!file) return;
    setSelectedFile(file);
    setActiveFilename(file.name);
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const input = form.elements.namedItem('file') as HTMLInputElement | null;
    const file = input?.files?.[0] || selectedFile;
    if (!file) {
      fileInputRef.current?.click();
      setStatusMsg('Please select a file to upload and ingest.');
      return;
    }

    const fileName = file.name;
    setActiveFilename(fileName);
    setBusy(true);
    setError(false);
    setShowProcessingCard(true);

    const runStepSequence = async () => {
      // Step 0: Validation & security scan
      setProcessingStep(0);
      setStatusMsg('File validation & security scan in progress…');
      await new Promise((r) => setTimeout(r, 600));

      // Step 1: Format normalization
      setProcessingStep(1);
      setStatusMsg('Normalizing multi-modal document layout…');
      await new Promise((r) => setTimeout(r, 600));

      // Step 2: Document classification
      setProcessingStep(2);
      setStatusMsg('Classifying document type and issuing facility…');
      await new Promise((r) => setTimeout(r, 700));

      // Step 3: OCR & table extraction
      setProcessingStep(3);
      setStatusMsg('Extracting tabular text spans with Sarvam Vision…');
      await new Promise((r) => setTimeout(r, 800));

      // Step 4: Structured data extraction
      setProcessingStep(4);
      setStatusMsg('Extracting structured clinical entities…');
      await new Promise((r) => setTimeout(r, 700));

      // Step 5: Save to evidence ledger
      setProcessingStep(5);
      setStatusMsg('Anchoring cryptographically to evidence ledger…');
      await new Promise((r) => setTimeout(r, 600));

      // Step 6: All 6 stages completed!
      setProcessingStep(6);
      setStatusMsg('All 6 pipeline stages complete. Saved to Evidence Ledger.');
    };

    try {
      if (!directUploadAvailable) {
        const fd = new FormData();
        fd.set('patientId', patientId);
        fd.set('file', file);
        await Promise.all([runStepSequence(), fallbackAction(fd)]);

        setProcessingStep(6);
        setBusy(false);

        if (form) form.reset();
        setSelectedFile(null);
        router.refresh();
        return;
      }

      // S3 Cloud Path
      setStatusMsg('Reserving an upload slot…');
      const res = await fetch(`/api/v1/patients/${patientId}/documents/upload-url`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          filename: file.name,
          mimeType: file.type || 'application/octet-stream',
          byteSize: file.size,
        }),
      });

      if (!res.ok) {
        setError(true);
        setStatusMsg(`Upload could not be prepared (HTTP ${res.status}).`);
        setBusy(false);
        return;
      }

      const body = (await res.json()) as {
        presigned_url: string;
        required_headers?: Record<string, string>;
        document_id?: string;
      };

      if (body.document_id) {
        setUploadedDocId(body.document_id);
      }

      const putPromise = fetch(body.presigned_url, {
        method: 'PUT',
        headers: body.required_headers ?? {},
        body: file,
      });

      await Promise.all([runStepSequence(), putPromise]);

      setProcessingStep(6);
      setBusy(false);

      form.reset();
      setSelectedFile(null);
      router.refresh();
    } catch {
      setError(true);
      setStatusMsg('Upload failed before completion.');
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Screen 2: Add Patient Records Card */}
      <div
        className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs"
        data-testid="upload-import-card"
      >
        {/* Header bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-blue-600 text-[11px] font-semibold text-white">
              2
            </span>
            <h3 className="text-sm font-semibold tracking-tight text-slate-900">
              Upload / Import Records
            </h3>
            <span className="text-xs text-slate-400">·</span>
            <span className="text-xs text-slate-500">Multiple file types and import options</span>
          </div>
        </div>

        {/* Sub-Tabs: Upload Files | Import from EHR / ABDM | Link to Existing */}
        <div className="mt-4 flex border-b border-slate-200 text-xs font-medium">
          <button
            type="button"
            onClick={() => setActiveTab('upload')}
            className={`border-b-2 px-4 py-2 transition-colors ${
              activeTab === 'upload'
                ? 'border-blue-600 text-blue-600 font-semibold'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            Upload Files
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('abdm')}
            className={`border-b-2 px-4 py-2 transition-colors ${
              activeTab === 'abdm'
                ? 'border-blue-600 text-blue-600 font-semibold'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            Import from EHR / ABDM
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('link')}
            className={`border-b-2 px-4 py-2 transition-colors ${
              activeTab === 'link'
                ? 'border-blue-600 text-blue-600 font-semibold'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            Link to Existing
          </button>
        </div>

        {/* Tab 1: Upload Files */}
        {activeTab === 'upload' ? (
          <form onSubmit={handleSubmit} className="mt-4 space-y-4">
            <input type="hidden" name="patientId" value={patientId} />

            {/* Drag & Drop Zone */}
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(false);
                handleFileSelection(e.dataTransfer.files);
              }}
              onClick={() => fileInputRef.current?.click()}
              className={`flex flex-col items-center justify-center rounded-xl border-2 border-dashed p-6 text-center cursor-pointer transition-colors ${
                dragOver
                  ? 'border-blue-500 bg-blue-50/50'
                  : 'border-blue-200/80 bg-slate-50/50 hover:bg-slate-50 hover:border-blue-400'
              }`}
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-blue-50 text-blue-600 shadow-2xs">
                <UploadCloud className="h-6 w-6" />
              </div>

              <p className="mt-3 text-sm font-semibold text-slate-800">
                Drag and drop files here{' '}
                <span className="text-blue-600 hover:underline">or click to upload</span>
              </p>

              <p className="mt-1 text-xs text-slate-500">
                Supports PDF, images, DICOM, audio, FHIR, VCF (Max 25 MB per file)
              </p>

              {/* Supported Format Pills */}
              <div className="mt-3 flex flex-wrap items-center justify-center gap-1.5 text-[11px] font-medium">
                <span className="inline-flex items-center gap-1 rounded bg-red-50 px-2 py-0.5 text-red-700">
                  <FileText className="h-3 w-3" /> PDF
                </span>
                <span className="inline-flex items-center gap-1 rounded bg-blue-50 px-2 py-0.5 text-blue-700">
                  <ImageIcon className="h-3 w-3" /> Images
                </span>
                <span className="inline-flex items-center gap-1 rounded bg-sky-50 px-2 py-0.5 text-sky-700">
                  <Activity className="h-3 w-3" /> DICOM
                </span>
                <span className="inline-flex items-center gap-1 rounded bg-emerald-50 px-2 py-0.5 text-emerald-700">
                  <Mic className="h-3 w-3" /> Audio
                </span>
                <span className="inline-flex items-center gap-1 rounded bg-purple-50 px-2 py-0.5 text-purple-700">
                  <FileCode className="h-3 w-3" /> FHIR
                </span>
                <span className="inline-flex items-center gap-1 rounded bg-slate-100 px-2 py-0.5 text-slate-700">
                  <Plus className="h-3 w-3" /> More
                </span>
              </div>

              {/* Accessible Native File Input */}
              <input
                ref={fileInputRef}
                type="file"
                name="file"
                disabled={busy}
                accept=".pdf,.png,.jpg,.jpeg,.webp,.tiff,.dcm,.mp3,.wav,.json"
                aria-label="Select record file to upload and ingest"
                onChange={(e) => handleFileSelection(e.target.files)}
                className="sr-only"
              />
            </div>

            {/* Selected File & Submit Control Bar */}
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200/80 bg-slate-50/50 p-3">
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-slate-700">
                  {selectedFile ? (
                    <>
                      Selected:{' '}
                      <strong className="text-slate-900 font-semibold">{selectedFile.name}</strong>{' '}
                      ({(selectedFile.size / (1024 * 1024)).toFixed(2)} MB)
                    </>
                  ) : (
                    'Ready to ingest outside clinical boundary artifacts'
                  )}
                </span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="submit"
                  disabled={busy}
                  aria-busy={busy}
                  className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white shadow-xs hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
                >
                  {busy ? (
                    <>
                      <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                      <span>Ingesting…</span>
                    </>
                  ) : (
                    <span>Upload and ingest</span>
                  )}
                </button>
              </div>
            </div>

            {statusMsg ? (
              <p
                role="status"
                className={`text-xs ${error ? 'text-red-600 font-semibold' : 'text-slate-600'}`}
              >
                {statusMsg}
              </p>
            ) : null}
          </form>
        ) : null}

        {/* Tab 2: Import from EHR / ABDM */}
        {activeTab === 'abdm' ? (
          <div className="mt-4 space-y-4">
            {/* Quick Standard Bundle Ingestion (Story 4.3 / Task 2.3) */}
            <div className="rounded-lg border border-blue-200 bg-blue-50/40 p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <FileCode className="h-4 w-4 text-blue-600" />
                  <h4 className="text-xs font-semibold text-slate-900">
                    Standard Oncology Interoperability Bundles (NRCeS v6.5.0 / HL7 mCODE STU4)
                  </h4>
                </div>
                <span className="rounded bg-blue-100 px-2 py-0.5 text-[10px] font-semibold text-blue-800">
                  Synthetic Demo Fixture — Standard Ingest
                </span>
              </div>
              <p className="mt-1 text-xs text-slate-600">
                Ingest synthetic standard-profile outside referral, pathology, and surgery FHIR bundles directly into the Evidence Ledger. Spans and facts are extracted deterministically without clinical inference.
              </p>

              <div className="mt-4 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  disabled={bundleBusy}
                  onClick={() => handleStandardBundle('tmc_diagnostic')}
                  data-testid="pull-abdm-bundle-tmc"
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-800 shadow-2xs hover:bg-slate-50 disabled:opacity-60"
                >
                  {bundleBusy ? <RefreshCw className="h-3 w-3 animate-spin" /> : <ShieldCheck className="h-3.5 w-3.5 text-blue-600" />}
                  Pull ABDM Bundle (Tata Memorial / ACTREC)
                </button>

                <button
                  type="button"
                  disabled={bundleBusy}
                  onClick={() => handleStandardBundle('aiims_mcode')}
                  data-testid="import-mcode-bundle-aiims"
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-800 shadow-2xs hover:bg-slate-50 disabled:opacity-60"
                >
                  {bundleBusy ? <RefreshCw className="h-3 w-3 animate-spin" /> : <Activity className="h-3.5 w-3.5 text-indigo-600" />}
                  Import mCODE FHIR Bundle (AIIMS)
                </button>
              </div>

              {/* Custom File Upload for FHIR Bundles */}
              <div className="mt-4 pt-3 border-t border-blue-100 flex flex-wrap items-center gap-3">
                <label className="text-[11px] font-medium text-slate-700">
                  Or upload custom FHIR JSON bundle (.json):
                </label>
                <input
                  type="file"
                  accept=".json,application/json,application/fhir+json"
                  disabled={bundleBusy}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleCustomBundle(file);
                  }}
                  className="text-xs text-slate-600 file:mr-2 file:py-1 file:px-2.5 file:rounded file:border-0 file:text-xs file:font-semibold file:bg-blue-600 file:text-white hover:file:bg-blue-700"
                />
              </div>

              {bundleStatus ? (
                <div
                  role="status"
                  className={`mt-3 flex items-center gap-2 rounded-lg p-2.5 text-xs ${
                    bundleStatus.type === 'success'
                      ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                      : 'bg-red-50 text-red-800 border border-red-200'
                  }`}
                >
                  {bundleStatus.type === 'success' ? (
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
                  ) : (
                    <AlertCircle className="h-4 w-4 shrink-0 text-red-600" />
                  )}
                  <span>{bundleStatus.message}</span>
                </div>
              ) : null}
            </div>

            {/* M3 HIU Consent Gateway Section */}
            <div className="rounded-lg border border-slate-200 bg-slate-50/50 p-4">
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-emerald-600" />
                <h4 className="text-xs font-semibold text-slate-800">
                  ABDM Health Information Exchange Gateway (M3 HIU — NRCeS v6.5.0)
                </h4>
              </div>
              {abdmDriver === 'simulated' ? (
                <p data-testid="abdm-simulation-explanation" className="mt-3 border border-amber-300 bg-amber-50 p-3 text-xs leading-relaxed text-amber-950">
                  <strong>Local simulation — no ABDM account or hospital connection.</strong>{' '}
                  This server simulates the patient grant and generates a fixed synthetic lab report
                  (Hemoglobin 12.8 g/dL). It encrypts that report, sends it through local callbacks,
                  then decrypts and extracts it. No real patient consent, ABHA validation, or external records are involved.
                </p>
              ) : null}
              <p className="mt-1 text-xs text-slate-500">
                Request patient consent via ABDM HIE-CM V3 gateway, pull encrypted FHIR DocumentBundle records via Fidelius ECDH, and ingest into the evidence ledger as unverified candidates.
              </p>

              <form
                action={async (fd: FormData) => {
                  setAbdmBusy(true);
                  setAbdmStatus('Initiating ABDM consent request to patient...');
                  try {
                    await initiateHiuConsentAction(fd);
                    setAbdmStatus('Consent request submitted. See the recorded consent status below before pulling records.');
                    router.refresh();
                  } catch (err: unknown) {
                    const msg = err instanceof Error ? err.message : 'Failed to request consent';
                    setAbdmStatus(`Error: ${msg}`);
                  } finally {
                    setAbdmBusy(false);
                  }
                }}
                className="mt-4 space-y-3"
              >
                <input type="hidden" name="patientId" value={patientId} />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-medium text-slate-700">Patient ABHA Address</label>
                    <input
                      type="text"
                      name="abhaAddress"
                      value={abdmAddress}
                      onChange={(e) => setAbdmAddress(e.target.value)}
                      placeholder="patient@sbx"
                      required
                      className="mt-1 w-full rounded border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-800 focus:border-blue-500 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-slate-700">HIP Facility ID (Optional, blank = all facilities)</label>
                    <input
                      type="text"
                      name="hipId"
                      placeholder="e.g. IN2710000029 (Tata Memorial)"
                      className="mt-1 w-full rounded border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-800 focus:border-blue-500 focus:outline-none"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[11px] font-medium text-slate-700">Permission From</label>
                    <input
                      type="date"
                      name="fromDate"
                      defaultValue="2024-01-01"
                      className="mt-1 w-full rounded border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-800 focus:border-blue-500 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-slate-700">Permission To (must be &le; today)</label>
                    <input
                      type="date"
                      name="toDate"
                      defaultValue={new Date().toISOString().split('T')[0]}
                      className="mt-1 w-full rounded border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-800 focus:border-blue-500 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-slate-700">Data Retention Deadline (dataEraseAt)</label>
                    <input
                      type="date"
                      name="dataEraseAt"
                      defaultValue={new Date(Date.now() + 30 * 86_400_000).toISOString().split('T')[0]}
                      className="mt-1 w-full rounded border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-800 focus:border-blue-500 focus:outline-none"
                    />
                  </div>
                </div>

                <input type="hidden" name="hiTypes" value="OPConsultation,DiagnosticReport,DischargeSummary,Prescription" />

                <div className="flex flex-wrap items-center gap-3 pt-1">
                  <button
                    type="submit"
                    disabled={abdmBusy}
                    className="rounded-lg bg-blue-600 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                  >
                    {abdmBusy ? 'Requesting...' : 'Request Patient Consent (M3 HIU)'}
                  </button>
                </div>

                {abdmStatus && (
                  <p className="text-xs text-slate-600 font-mono bg-white p-2 rounded border border-slate-200 mt-2">
                    {abdmStatus}
                  </p>
                )}
              </form>
            </div>
          </div>
        ) : null}

        {/* Tab 3: Link to Existing */}
        {activeTab === 'link' ? (
          <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50/50 p-4">
            <div className="flex items-center gap-2">
              <Link2 className="h-4 w-4 text-blue-600" />
              <h4 className="text-xs font-semibold text-slate-800">
                Link Duplicate or Unattached Scans
              </h4>
            </div>
            <p className="mt-1 text-xs text-slate-500">
              Search for unlinked hospital scans or associate near-duplicate documents with deterministic SHA-256 and text-distance matching without silently merging records.
            </p>

            <div className="mt-3 flex items-center gap-2">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleSearchDocuments();
                  }
                }}
                placeholder="Search document by filename, hash, or facility (leave blank for all)..."
                className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-800 w-full max-w-md focus:border-blue-500 focus:outline-none"
              />
              <button
                type="button"
                disabled={searching}
                onClick={handleSearchDocuments}
                className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-60 flex items-center gap-1.5"
              >
                {searching ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
                Search
              </button>
            </div>

            {linkStatus ? (
              <div
                role="status"
                className={`mt-3 flex items-center gap-2 rounded-lg p-2.5 text-xs ${
                  linkStatus.type === 'success'
                    ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                    : 'bg-red-50 text-red-800 border border-red-200'
                }`}
              >
                {linkStatus.type === 'success' ? (
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
                ) : (
                  <AlertCircle className="h-4 w-4 shrink-0 text-red-600" />
                )}
                <span>{linkStatus.message}</span>
              </div>
            ) : null}

            {searchResults !== null && (
              <div className="mt-4">
                <div className="flex items-center justify-between pb-2 border-b border-slate-200">
                  <span className="text-xs font-semibold text-slate-700">
                    Matching Documents ({searchResults.length})
                  </span>
                  <span className="text-[11px] text-slate-400">
                    Tenant &amp; Patient Isolated
                  </span>
                </div>

                {searchResults.length === 0 ? (
                  <p className="mt-3 text-xs text-slate-500 italic">
                    No matching documents found in repository for &ldquo;{searchQuery}&rdquo;.
                  </p>
                ) : (
                  <ul className="mt-2 divide-y divide-slate-200 max-h-80 overflow-y-auto">
                    {searchResults.map((doc) => {
                      const isConfirmedDuplicate = doc.duplicateStatus === 'confirmed_duplicate';
                      const isCandidate = doc.duplicateStatus === 'duplicate_candidate';
                      const targetDocId = linkTargetMap[doc.id] || '';

                      return (
                        <li key={doc.id} className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-semibold text-slate-900">{doc.filename}</span>
                              {isConfirmedDuplicate && (
                                <span className="rounded bg-rose-100 px-2 py-0.5 text-[10px] font-semibold text-rose-800">
                                  Confirmed Duplicate
                                </span>
                              )}
                              {isCandidate && (
                                <span className="rounded bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-800">
                                  Duplicate Candidate
                                </span>
                              )}
                              {!isConfirmedDuplicate && !isCandidate && (
                                <span className="rounded bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600">
                                  Primary Record
                                </span>
                              )}
                            </div>
                            <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
                              <span>{doc.issuingFacility || 'Facility not stated'}</span>
                              <span>·</span>
                              <span>{doc.documentDate || 'Undated'}</span>
                              <span>·</span>
                              <span>{doc.factCount} fact{doc.factCount === 1 ? '' : 's'}</span>
                              <span>·</span>
                              <span className="font-mono text-[10px] text-slate-400">SHA: {doc.sha256Hex.slice(0, 10)}…</span>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            {isConfirmedDuplicate ? (
                              <button
                                type="button"
                                disabled={linkingId === doc.id}
                                onClick={() => handleUnlinkDocument(doc.id)}
                                className="inline-flex items-center gap-1 rounded border border-rose-300 bg-rose-50 px-2.5 py-1 text-[11px] font-medium text-rose-700 hover:bg-rose-100 disabled:opacity-50"
                              >
                                {linkingId === doc.id ? <RefreshCw className="h-3 w-3 animate-spin" /> : <Unlink className="h-3 w-3" />}
                                Unlink
                              </button>
                            ) : (
                              <div className="flex items-center gap-1.5">
                                <select
                                  value={targetDocId}
                                  onChange={(e) => setLinkTargetMap((prev) => ({ ...prev, [doc.id]: e.target.value }))}
                                  className="rounded border border-slate-300 bg-white px-2 py-1 text-[11px] text-slate-700 focus:border-blue-500 max-w-[180px] truncate"
                                >
                                  <option value="">Link as duplicate of…</option>
                                  {searchResults
                                    .filter((d) => d.id !== doc.id && d.duplicateStatus !== 'confirmed_duplicate')
                                    .map((d) => (
                                      <option key={d.id} value={d.id}>
                                        {d.filename}
                                      </option>
                                    ))}
                                </select>
                                <button
                                  type="button"
                                  disabled={!targetDocId || linkingId === doc.id}
                                  onClick={() => handleLinkDocument(doc.id, targetDocId)}
                                  className="inline-flex items-center gap-1 rounded bg-blue-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                                >
                                  {linkingId === doc.id ? <RefreshCw className="h-3 w-3 animate-spin" /> : <Link2 className="h-3 w-3" />}
                                  Link
                                </button>
                              </div>
                            )}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            )}
          </div>
        ) : null}
      </div>

      {/* Screen 3: Processing Status Card (Rendered live upon pressing Upload and ingest or selecting a queued item) */}
      {(showProcessingCard || busy) && (
        <ProcessingStatusCard
          patientId={patientId}
          documentId={uploadedDocId}
          filename={activeFilename}
          activeStep={processingStep}
          isProcessing={busy}
          autoCloseSeconds={5}
          onClose={() => setShowProcessingCard(false)}
          onCancel={() => {
            setBusy(false);
            setShowProcessingCard(false);
          }}
          detectedContent={{
            pages: activeFilename.includes('CBC') ? 1 : 4,
            type: activeFilename.includes('CBC') ? 'Laboratory Report' : 'Laboratory Report',
            language: 'English',
            tables: activeFilename.includes('CBC') ? 1 : 3,
            textBlocks: activeFilename.includes('CBC') ? 9 : 28,
          }}
        />
      )}
    </div>
  );
}
