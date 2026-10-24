'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  CheckCircle2,
  FileText,
  Loader2,
  X,
  ExternalLink,
  Cpu,
  Layers,
} from 'lucide-react';

export type PipelineStepStatus = 'completed' | 'processing' | 'pending' | 'failed';

export interface PipelineStep {
  id: string;
  label: string;
  status: PipelineStepStatus;
  duration?: string;
  badge?: string;
}

export interface ProcessingStatusCardProps {
  filename?: string;
  patientId: string;
  documentId?: string | null;
  activeStep?: number; // 0 to 6
  isProcessing?: boolean;
  onCancel?: () => void;
  onClose?: () => void;
  autoCloseSeconds?: number;
  detectedContent?: {
    pages?: number;
    type?: string;
    language?: string;
    tables?: number;
    textBlocks?: number;
    thumbnailUrl?: string | null;
  };
}

export function ProcessingStatusCard({
  filename = 'Lab_Report_2024.pdf',
  patientId,
  documentId,
  activeStep = 3,
  isProcessing = false,
  onCancel,
  onClose,
  autoCloseSeconds = 5,
  detectedContent = {
    pages: 1,
    type: 'Laboratory Report',
    language: 'English',
    tables: 2,
    textBlocks: 18,
  },
}: ProcessingStatusCardProps) {
  const [elapsed, setElapsed] = useState(12.5);
  const [countdown, setCountdown] = useState<number>(autoCloseSeconds);
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const [isClosing, setIsClosing] = useState<boolean>(false);

  const allCompleted = activeStep >= 6 && !isProcessing;

  useEffect(() => {
    if (!isProcessing) return;
    const interval = setInterval(() => {
      setElapsed((prev) => +(prev + 0.5).toFixed(1));
    }, 500);
    return () => clearInterval(interval);
  }, [isProcessing]);

  // 5-second countdown timer once all six steps are completed
  useEffect(() => {
    if (!allCompleted || isPaused) return;

    setCountdown(autoCloseSeconds);
    const interval = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          handleSmoothClose();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [allCompleted, isPaused, autoCloseSeconds]);

  function handleSmoothClose() {
    setIsClosing(true);
    setTimeout(() => {
      onClose?.();
    }, 700);
  }

  const steps: PipelineStep[] = [
    {
      id: 'validation',
      label: 'File validation & security scan',
      status: activeStep > 0 ? 'completed' : activeStep === 0 ? 'processing' : 'pending',
      duration: '1.2s',
    },
    {
      id: 'normalization',
      label: 'Format normalization',
      status: activeStep > 1 ? 'completed' : activeStep === 1 ? 'processing' : 'pending',
      duration: '0.8s',
    },
    {
      id: 'classification',
      label: 'Document classification',
      status: activeStep > 2 ? 'completed' : activeStep === 2 ? 'processing' : 'pending',
      duration: '2.1s',
      badge: detectedContent.type || 'Lab Report',
    },
    {
      id: 'ocr',
      label: 'OCR & table extraction',
      status: activeStep > 3 ? 'completed' : activeStep === 3 ? 'processing' : 'pending',
      duration: isProcessing && activeStep === 3 ? `${elapsed}s` : '12.5s',
    },
    {
      id: 'extraction',
      label: 'Structured data extraction',
      status: activeStep > 4 ? 'completed' : activeStep === 4 ? 'processing' : 'pending',
      duration: '1.9s',
    },
    {
      id: 'ledger',
      label: 'Save to evidence ledger',
      status: activeStep >= 6 ? 'completed' : activeStep === 5 ? 'processing' : 'pending',
      duration: '0.7s',
    },
  ];

  const completedCount = steps.filter((s) => s.status === 'completed').length;
  const progressPercent = Math.min(100, Math.round((completedCount / steps.length) * 100));

  return (
    <div
      className={`transition-all duration-700 ease-in-out transform origin-top ${
        isClosing
          ? 'opacity-0 -translate-y-4 max-h-0 overflow-hidden pointer-events-none scale-95 my-0 py-0'
          : 'opacity-100 translate-y-0 max-h-[2000px] scale-100 mt-6'
      }`}
      data-testid="processing-status-card"
    >
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
        {/* All-steps completed auto-dismiss countdown banner */}
        {allCompleted ? (
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-emerald-200 bg-emerald-50/90 px-3.5 py-2.5 text-xs text-emerald-900 shadow-2xs animate-in fade-in slide-in-from-top-1 duration-300">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
              <span className="font-semibold text-emerald-950">
                {isPaused
                  ? 'All 6 pipeline stages completed successfully · Auto-close paused'
                  : `All 6 pipeline stages completed successfully · Auto-closing smoothly in ${countdown}s`}
              </span>
            </div>
            <div className="flex items-center gap-2">
              {!isPaused ? (
                <button
                  type="button"
                  onClick={() => setIsPaused(true)}
                  className="rounded px-2 py-0.5 text-[11px] font-medium text-emerald-700 hover:bg-emerald-100/80 hover:text-emerald-950 transition-colors"
                >
                  Keep open
                </button>
              ) : null}
              <button
                type="button"
                onClick={handleSmoothClose}
                className="rounded bg-emerald-700 px-2.5 py-1 text-[11px] font-semibold text-white shadow-2xs hover:bg-emerald-800 transition-colors"
              >
                Close now
              </button>
            </div>
          </div>
        ) : null}

        {/* Header bar */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-blue-600 text-[11px] font-semibold text-white">
                3
              </span>
              <h3 className="text-sm font-semibold tracking-tight text-slate-900">
                Processing Status
              </h3>
            </div>
            <p className="mt-0.5 text-xs text-slate-500">
              See real-time pipeline progress
            </p>
          </div>

          <div className="flex items-center gap-2">
            {documentId ? (
              <Link
                href={`/patients/${patientId}/sources/${documentId}`}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100 transition-colors"
              >
                <span>View in Source Inspector</span>
                <ExternalLink className="h-3.5 w-3.5" />
              </Link>
            ) : null}

            <button
              type="button"
              onClick={handleSmoothClose}
              aria-label="Close processing status"
              className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

      {/* Active File Header Card */}
      <div className="mt-4 rounded-lg border border-slate-100 bg-slate-50/70 p-3.5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-red-50 text-red-600">
              <FileText className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-800">{filename}</p>
              <p className="text-[11px] text-slate-500">
                {completedCount}/{steps.length} steps completed
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-xs font-semibold text-slate-700">{progressPercent}%</span>
            {onCancel && isProcessing ? (
              <button
                type="button"
                onClick={onCancel}
                className="rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition-colors"
              >
                Cancel
              </button>
            ) : null}
          </div>
        </div>

        {/* Progress Bar */}
        <div className="mt-2.5 h-1.5 w-full overflow-hidden rounded-full bg-slate-200">
          <div
            className="h-full bg-blue-600 transition-all duration-300"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>

      {/* Main Grid: Pipeline Checklist (Left) & Detected Content/Models (Right) */}
      <div className="mt-4 grid gap-5 lg:grid-cols-[1.4fr_1fr]">
        {/* Left: 6-Stage Stepper Checklist */}
        <div className="space-y-2.5">
          {steps.map((step) => {
            const isCompleted = step.status === 'completed';
            const isRunning = step.status === 'processing';

            return (
              <div
                key={step.id}
                className={`flex items-center justify-between rounded-lg border px-3 py-2 text-xs transition-colors ${
                  isRunning
                    ? 'border-blue-200 bg-blue-50/40 text-blue-900'
                    : isCompleted
                      ? 'border-slate-100 bg-white text-slate-800'
                      : 'border-slate-100 bg-slate-50/50 text-slate-400'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  {isCompleted ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                  ) : isRunning ? (
                    <Loader2 className="h-4 w-4 animate-spin text-blue-600 shrink-0" />
                  ) : (
                    <div className="h-4 w-4 rounded-full border border-slate-300 shrink-0" />
                  )}

                  <span className={`font-medium ${isRunning ? 'text-blue-950 font-semibold' : ''}`}>
                    {step.label}
                  </span>

                  {step.badge ? (
                    <span className="rounded-md bg-blue-100/70 px-1.5 py-0.5 text-[10px] font-medium text-blue-700">
                      {step.badge}
                    </span>
                  ) : null}
                </div>

                <div className="text-[11px] font-mono">
                  {isCompleted ? (
                    <span className="text-slate-500">Completed · {step.duration}</span>
                  ) : isRunning ? (
                    <span className="text-blue-600 font-medium">Processing · {step.duration}</span>
                  ) : (
                    <span className="text-slate-400">Pending</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Right: Detected Content & Models Used */}
        <div className="space-y-4">
          {/* Detected Content Card */}
          <div className="rounded-lg border border-slate-200/80 bg-white p-3.5">
            <div className="flex items-center gap-2 border-b border-slate-100 pb-2">
              <Layers className="h-3.5 w-3.5 text-slate-500" />
              <h4 className="text-[11px] font-semibold uppercase tracking-wider text-slate-600">
                Detected Content
              </h4>
            </div>

            <div className="mt-2.5 flex items-start gap-3">
              {/* Thumbnail representation */}
              <div className="flex h-16 w-12 shrink-0 flex-col items-center justify-center rounded border border-slate-200 bg-slate-50 shadow-2xs">
                <FileText className="h-6 w-6 text-slate-400" />
                <span className="text-[9px] font-mono text-slate-500">p.1</span>
              </div>

              {/* Stats Key-Value */}
              <dl className="grid flex-1 grid-cols-2 gap-x-2 gap-y-1 text-xs">
                <div>
                  <dt className="text-[10px] text-slate-400">Pages:</dt>
                  <dd className="font-semibold text-slate-800">{detectedContent.pages ?? 1}</dd>
                </div>
                <div>
                  <dt className="text-[10px] text-slate-400">Type:</dt>
                  <dd className="font-semibold text-slate-800 truncate">
                    {detectedContent.type ?? 'Lab Report'}
                  </dd>
                </div>
                <div>
                  <dt className="text-[10px] text-slate-400">Language:</dt>
                  <dd className="font-medium text-slate-700">{detectedContent.language ?? 'English'}</dd>
                </div>
                <div>
                  <dt className="text-[10px] text-slate-400">Tables:</dt>
                  <dd className="font-medium text-slate-700">{detectedContent.tables ?? 0}</dd>
                </div>
                <div className="col-span-2">
                  <dt className="text-[10px] text-slate-400">Text Blocks:</dt>
                  <dd className="font-medium text-slate-700">{detectedContent.textBlocks ?? 0}</dd>
                </div>
              </dl>
            </div>
          </div>

          {/* Models Used Card */}
          <div className="rounded-lg border border-slate-200/80 bg-white p-3.5">
            <div className="flex items-center gap-2 border-b border-slate-100 pb-2">
              <Cpu className="h-3.5 w-3.5 text-slate-500" />
              <h4 className="text-[11px] font-semibold uppercase tracking-wider text-slate-600">
                Models Used
              </h4>
            </div>

            <ul className="mt-2.5 space-y-2 text-xs">
              <li className="flex items-center justify-between">
                <span className="text-slate-700">Sarvam Vision (OCR)</span>
                <span className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700">
                  Active
                </span>
              </li>
              <li className="flex items-center justify-between">
                <span className="text-slate-700">Custom Table Parser</span>
                <span className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700">
                  Active
                </span>
              </li>
              <li className="flex items-center justify-between">
                <span className="text-slate-700">Document Classifier</span>
                <span className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700">
                  Active
                </span>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  </div>
);
}
