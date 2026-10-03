'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Document upload (Phase 2, cloud path).
 *
 * When S3-backed storage is configured, the browser asks the server for a
 * short-lived presigned PUT and sends the bytes **directly to private,
 * KMS-encrypted object storage**. The application process never sees the file.
 * The S3 ObjectCreated notification then drives the cloud pipeline
 * (SQS -> Lambda -> Textract -> Bedrock -> evidence ledger), so the upload the
 * user performs is the one the worker processes.
 *
 * With the local filesystem driver (offline demo) there is no presigner, so the
 * form falls back to the in-process ingest server action unchanged.
 */
export function DocumentUploadForm({
  patientId,
  fallbackAction,
  directUploadAvailable,
}: {
  patientId: string;
  fallbackAction: (fd: FormData) => Promise<void>;
  directUploadAvailable: boolean;
}) {
  const router = useRouter();
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const input = form.elements.namedItem('file') as HTMLInputElement | null;
    const file = input?.files?.[0];
    if (!file) return;

    setBusy(true);
    setError(false);

    try {
      if (!directUploadAvailable) {
        const fd = new FormData();
        fd.set('patientId', patientId);
        fd.set('file', file);
        setStatus('Ingesting locally…');
        await fallbackAction(fd);
        form.reset();
        router.refresh();
        return;
      }

      setStatus('Reserving an upload slot…');
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
        setStatus(`Upload could not be prepared (HTTP ${res.status}).`);
        return;
      }
      const body = (await res.json()) as {
        presigned_url: string;
        required_headers?: Record<string, string>;
      };

      setStatus('Uploading to private storage…');
      const put = await fetch(body.presigned_url, {
        method: 'PUT',
        headers: body.required_headers ?? {},
        body: file,
      });
      if (!put.ok) {
        setError(true);
        setStatus(`Storage rejected the upload (HTTP ${put.status}).`);
        return;
      }

      form.reset();
      setStatus('Uploaded. OCR and extraction run in the background — reload to see the result.');
      router.refresh();
    } catch {
      setError(true);
      setStatus('Upload failed before completion.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="mt-6 flex flex-wrap items-end gap-3 border border-dashed border-[var(--color-rule-strong)] bg-[var(--color-paper-raised)] p-4"
    >
      <input type="hidden" name="patientId" value={patientId} />
      <label className="block">
        <span className="mono block text-[11px] uppercase tracking-wider text-[var(--color-ink-soft)]">
          Add an authorised document
        </span>
        <input
          type="file"
          name="file"
          required
          disabled={busy}
          className="mono mt-1 block text-xs file:mr-3 file:border file:border-[var(--color-rule-strong)] file:bg-[var(--color-paper)] file:px-2 file:py-1"
        />
      </label>
      <button
        type="submit"
        disabled={busy}
        className="mono border border-[var(--color-ink)] px-3 py-1.5 text-[11px] uppercase tracking-wider disabled:opacity-60"
      >
        {busy ? 'Working…' : 'Upload and ingest'}
      </button>
      {status ? (
        <p
          role="status"
          className="mono max-w-md text-[11px] leading-relaxed"
          style={{ color: error ? 'var(--color-state-conflicting)' : 'var(--color-ink-soft)' }}
        >
          {status}
        </p>
      ) : (
        <p className="mono max-w-md text-[11px] leading-relaxed text-[var(--color-ink-soft)]">
          Uploads are hashed server-side and MIME-sniffed from magic bytes. Scans with no embedded
          text layer are quarantined for manual transcription rather than guessed at.
        </p>
      )}
    </form>
  );
}
