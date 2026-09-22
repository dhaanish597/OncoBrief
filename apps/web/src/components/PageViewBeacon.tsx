'use client';

import { useEffect } from 'react';

/**
 * Records that a page was viewed. In a healthcare system *who looked at which
 * page* is itself auditable (architecture §5.3), and the log records only that
 * the page was viewed, never what it said.
 */
export function PageViewBeacon({
  patientId,
  documentId,
  pageNumber,
}: {
  patientId: string;
  documentId: string;
  pageNumber: number;
}) {
  useEffect(() => {
    const url = `/api/v1/patients/${patientId}/documents/${documentId}/pages/${pageNumber}`;
    void fetch(url, { method: 'POST', keepalive: true }).catch(() => undefined);
  }, [patientId, documentId, pageNumber]);
  return null;
}
