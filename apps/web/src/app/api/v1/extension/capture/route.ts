import { NextResponse } from 'next/server';
import {
  getExtractor,
  getOcr,
  getStorage,
  redeemExtensionGrantAndIngest,
  withOrgTransaction,
} from '@oncobrief/db';
import { getSessionFromCookies, withSession } from '@/lib/session';

export interface ExtensionCaptureRequest {
  token: string;
  origin: string;
  patientId?: string;
  orgId?: string;
  scope?: 'capture:pdf' | 'capture:dom_text' | 'capture:fhir_json';
  filename?: string;
  mimeType?: string;
  contentBase64?: string;
  plainText?: string;
  documentDate?: string;
  issuingFacility?: string;
}

/**
 * Browser Extension Capture & Ingestion Endpoint (`TASK-016`, Step 2E Security Hardened).
 *
 * Enforces:
 * - Valid `ob_ext_*` single-use token (hashed with SHA-256)
 * - 10-minute expiration window (`expires_at > now()`)
 * - Origin binding (`grant.origin` matches `origin` / `x-extension-origin`)
 * - Scope binding (`requiredScope` in `grant.scope`)
 * - Patient & tenant binding (`expectedPatientId`, `expectedOrgId`)
 * - Atomic consumption (`used_at IS NULL` -> `used_at = now()`) preventing replay
 */
export async function POST(req: Request): Promise<NextResponse> {
  try {
    const body = (await req.json()) as ExtensionCaptureRequest;
    const authHeader = req.headers.get('authorization');
    const bearerToken = authHeader?.startsWith('Bearer ')
      ? authHeader.slice(7).trim()
      : null;
    const rawToken = (body.token || bearerToken || '').trim();
    const originHeader = req.headers.get('x-extension-origin') || req.headers.get('origin');
    const origin = (body.origin || originHeader || 'https://ehr.hospital.example').trim();

    if (!rawToken.startsWith('ob_ext_')) {
      return NextResponse.json({ ok: false, error: 'invalid_extension_token' }, { status: 401 });
    }

    let contentBuffer: Buffer;
    let mimeType = body.mimeType || 'text/plain';
    const filename = body.filename || 'ehr_extension_capture.txt';
    let requiredScope: 'capture:pdf' | 'capture:dom_text' | 'capture:fhir_json' =
      body.scope || 'capture:dom_text';

    if (body.contentBase64) {
      contentBuffer = Buffer.from(body.contentBase64, 'base64');
      if (mimeType === 'application/pdf') requiredScope = 'capture:pdf';
      else if (mimeType.includes('json')) requiredScope = 'capture:fhir_json';
    } else if (body.plainText && body.plainText.trim().length > 0) {
      contentBuffer = Buffer.from(body.plainText, 'utf8');
      mimeType = 'text/plain';
      if (!body.scope) requiredScope = 'capture:dom_text';
    } else {
      return NextResponse.json({ ok: false, error: 'capture_content_empty' }, { status: 400 });
    }

    const deps = {
      storage: getStorage(),
      ocr: getOcr(),
      extractor: getExtractor(),
    };

    const session = await getSessionFromCookies();
    const result = session
      ? await withSession(async (q, s) =>
          redeemExtensionGrantAndIngest(q, deps, {
            token: rawToken,
            origin,
            requiredScope,
            filename,
            mimeType,
            content: contentBuffer,
            documentDate: body.documentDate ?? null,
            issuingFacility: body.issuingFacility ?? origin,
            expectedPatientId: body.patientId ?? null,
            expectedOrgId: body.orgId ?? s.orgId,
          }),
        )
      : await (async () => {
          const { createHash } = await import('node:crypto');
          const { getMigratorPool } = await import('@oncobrief/db');
          const tokenHash = createHash('sha256').update(rawToken, 'utf8').digest();
          const lookup = await getMigratorPool().query<{
            org_id: string;
            user_id: string;
            patient_id: string;
          }>(
            `SELECT org_id, user_id, patient_id FROM extension_grant WHERE token_hash = $1 LIMIT 1`,
            [tokenHash],
          );
          if (!lookup.rows[0]) {
            throw new Error('extension_grant_not_found');
          }
          if (body.orgId && body.orgId !== lookup.rows[0].org_id) {
            throw new Error('extension_grant_tenant_mismatch');
          }
          if (body.patientId && body.patientId !== lookup.rows[0].patient_id) {
            throw new Error('extension_grant_patient_mismatch');
          }
          return withOrgTransaction(
            {
              orgId: lookup.rows[0].org_id,
              userId: lookup.rows[0].user_id,
              role: 'records_officer',
            },
            async (q) =>
              redeemExtensionGrantAndIngest(q, deps, {
                token: rawToken,
                origin,
                requiredScope,
                filename,
                mimeType,
                content: contentBuffer,
                documentDate: body.documentDate ?? null,
                issuingFacility: body.issuingFacility ?? origin,
                expectedPatientId: body.patientId ?? lookup.rows[0]!.patient_id,
                expectedOrgId: lookup.rows[0]!.org_id,
              }),
          );
        })();

    return NextResponse.json({
      ok: true,
      grantId: result.grantId,
      documentId: result.documentId,
      patientId: result.patientId,
      ingestStatus: result.ingestStatus,
      promotedFacts: result.promotedFacts,
      subPacketCount: result.subPacketCount,
      redirectUrl: `/patients/${result.patientId}/sources/${result.documentId}`,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'extension_capture_failed';
    const status =
      /not_found|expired|revoked|already_used|invalid_extension_token/i.test(msg)
        ? 401
        : /origin_mismatch|scope_denied|tenant_mismatch|patient_mismatch|forbidden/i.test(msg)
          ? 403
          : 400;
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}
