'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { pullAbdmRecordsAction } from '@/lib/actions';

export function AbdmPullControl({ patientId, consentId }: { patientId: string; consentId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return <form action={async (fd) => {
    setBusy(true);
    setError(null);
    try { await pullAbdmRecordsAction(fd); }
    catch (err) { setError(err instanceof Error ? err.message : 'Record transfer failed'); }
    finally { setBusy(false); router.refresh(); }
  }}>
    <input type="hidden" name="patientId" value={patientId} />
    <input type="hidden" name="consentId" value={consentId} />
    <button type="submit" disabled={busy} className="mono border border-blue-600 bg-blue-50 px-2 py-1 text-[11px] text-blue-700 hover:bg-blue-100 uppercase">
      {busy ? 'pulling encrypted records…' : 'pull records'}
    </button>
    {error ? <p role="alert" className="mt-2 text-red-800">{error}</p> : null}
  </form>;
}
