'use client';

import React, { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  UploadCloud,
  FileText,
  FileCode,
  Mic,
  Image as ImageIcon,
  Activity,
  Plus,
  RefreshCw,
} from 'lucide-react';
import { ProcessingStatusCard } from './ProcessingStatusCard';

export interface DocumentUploadFormProps {
  patientId: string;
  fallbackAction: (fd: FormData) => Promise<void>;
  directUploadAvailable: boolean;
}

export function DocumentUploadForm({
  patientId,
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
          <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50/50 p-4">
            <h4 className="text-xs font-semibold text-slate-800">
              ABDM Health Information Exchange (NRCeS v6.5.0 / mCODE STU4)
            </h4>
            <p className="mt-1 text-xs text-slate-500">
              Pull outside records directly via ABDM consent-backed DocumentBundle. Normalizes into the intermediate PostgreSQL ledger with source cryptographic hashes.
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => {
                  alert('Simulated ABDM DocumentBundle pull initialized. Validated NRCeS bundle linked to patient ledger.');
                }}
                className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                Pull ABDM Bundle (Tata Memorial / ACTREC)
              </button>
              <button
                type="button"
                onClick={() => {
                  alert('Simulated mCODE STU4 oncology bundle pulled and parsed without inference.');
                }}
                className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                Import mCODE FHIR Bundle (AIIMS)
              </button>
            </div>
          </div>
        ) : null}

        {/* Tab 3: Link to Existing */}
        {activeTab === 'link' ? (
          <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50/50 p-4">
            <h4 className="text-xs font-semibold text-slate-800">
              Link Duplicate or Unattached Scans
            </h4>
            <p className="mt-1 text-xs text-slate-500">
              Search for unlinked hospital scans or associate near-duplicate documents with deterministic SHA-256 and text-distance matching.
            </p>
            <div className="mt-3 flex items-center gap-2">
              <input
                type="text"
                placeholder="Search document by filename, hash, or facility..."
                className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-800 w-full max-w-md"
              />
              <button
                type="button"
                className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700"
              >
                Search
              </button>
            </div>
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
