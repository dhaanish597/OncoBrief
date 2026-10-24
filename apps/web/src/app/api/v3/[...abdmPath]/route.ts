import { NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import {
  withTenant,
  getAppPool,
  getAbdmGateway,
  getStorage,
  getOcr,
  getExtractor,
  discoverPatientCareContexts,
  initUserLink,
  confirmUserLink,
  handleHipConsentNotify,
  processHealthInfoRequest,
  handleOnGenerateLinkToken,
  handleOnCareContextLinked,
  handleOnConsentRequestInit,
  handleHiuConsentNotify,
  handleOnFetchConsentArtifact,
  handleOnHealthInfoRequest,
  receiveHealthInfoPush,
  env,
} from '@oncobrief/db';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ abdmPath: string[] }> },
) {
  const { abdmPath } = await params;
  const path = '/' + abdmPath.join('/');
  const rawHeaders = Object.fromEntries(request.headers.entries());

  const inboundRequestId =
    request.headers.get('request-id') ||
    request.headers.get('x-request-id') ||
    randomUUID();

  const facilityId =
    request.headers.get('x-hip-id') ||
    request.headers.get('x-hiu-id') ||
    null;

  let body: Record<string, unknown> & {
    response?: { requestId?: string };
    consentRequestId?: string;
    consentRequest?: { id?: string };
    consentId?: string;
    transactionId?: string;
    careContextReference?: string;
    notification?: {
      consentRequestId?: string;
      consentId?: string;
      status?: 'GRANTED' | 'DENIED' | 'REVOKED' | 'EXPIRED';
      consentDetail?: {
        consentId?: string;
        patient?: { id: string };
        hiTypes?: string[];
        careContexts?: Array<{ careContextReference: string }>;
        permission?: {
          dateRange: { from: string; to: string };
          dataEraseAt: string;
        };
      };
      consentArtefacts?: Array<{ id: string }>;
    };
    hiRequest?: {
      transactionId?: string;
      consent?: { id: string };
      dateRange?: { from: string; to: string };
      dataPushUrl?: string;
      keyMaterial?: import('@oncobrief/ports').AbdmKeyMaterial;
      sessionStatus?: 'ACKNOWLEDGED' | 'FAILED';
    };
    patient?: {
      referenceNumber?: string;
      unverifiedIdentifier?: Array<{ type: string; value: string }>;
      verifiedIdentifier?: Array<{ type: string; value: string }>;
      careContexts?: Array<{ referenceNumber: string; display?: string }>;
    };
    confirmation?: {
      linkRefNumber?: string;
      token?: string;
    };
    consent?: {
      consentDetail: {
        consentId: string;
        hiTypes: string[];
        careContexts?: Array<{ careContextReference: string }>;
        permission: {
          dateRange: { from: string; to: string };
          dataEraseAt: string;
        };
      };
    };
    abhaAddress?: string;
    linkToken?: string;
    error?: { code: number; message: string };
    pageNumber?: number;
    pageCount?: number;
    entries?: import('@oncobrief/ports').AbdmEncryptedEntry[];
    keyMaterial?: import('@oncobrief/ports').AbdmKeyMaterial;
  } = {};

  try {
    body = (await request.json()) as typeof body;
  } catch {
    body = {};
  }

  // Correlation tokens
  const responseRequestId = body.response?.requestId || null;
  const consentRequestId = body.consentRequestId || body.notification?.consentRequestId || null;
  const consentId =
    body.consent?.consentDetail?.consentId ||
    body.consentId ||
    body.notification?.consentId ||
    body.notification?.consentDetail?.consentId ||
    body.hiRequest?.consent?.id ||
    null;
  const transactionId = body.transactionId || body.hiRequest?.transactionId || null;
  const careContextRef =
    body.careContextReference ||
    body.patient?.careContexts?.[0]?.referenceNumber ||
    null;

  // Resolve tenant via Security Definer function
  const pool = getAppPool();
  const resolveRes = await pool.query<{ org_id: string; patient_id: string | null }>(
    `SELECT org_id, patient_id FROM abdm_resolve_callback_tenant($1, $2, $3, $4, $5, $6)`,
    [
      responseRequestId ? responseRequestId : null,
      consentRequestId,
      consentId,
      transactionId,
      careContextRef,
      facilityId,
    ],
  );

  const targetOrgId = resolveRes.rows[0]?.org_id;

  if (!targetOrgId) {
    return NextResponse.json(
      { error: { code: 400, message: 'Unresolvable tenant context for callback' } },
      { status: 400 },
    );
  }

  // 1. Durably record in abdm_inbox for audit and idempotency under tenant RLS
  const recorded = await withTenant(
    { orgId: targetOrgId, userId: null, role: 'records_officer' },
    async (q) => {
      return q.query(
        `INSERT INTO abdm_inbox (org_id, request_id, endpoint, headers_json, payload_json, status)
         VALUES ($1, $2, $3, $4, $5, 'RECEIVED')
         ON CONFLICT (org_id, request_id, endpoint) DO NOTHING RETURNING id`,
        [targetOrgId, inboundRequestId, path, JSON.stringify(rawHeaders), JSON.stringify(body)],
      );
    },
  );

  if (!recorded.rowCount) return NextResponse.json({ response: { requestId: inboundRequestId } }, { status: 202 });

  // 2. Dispatch processing in background under tenant context
  const gateway = getAbdmGateway();
  const storage = getStorage();
  const ocr = getOcr();
  const extractor = getExtractor();

  const processing = withTenant(
    { orgId: targetOrgId, userId: null, role: 'records_officer' },
    async (q) => {
      await q.query('SAVEPOINT callback_processing');
      try {
        if (path.includes('/patient/care-context/discover') || path.endsWith('/discover')) {
          await discoverPatientCareContexts(q, {
            orgId: targetOrgId,
            inboundRequestId,
            transactionId: body.transactionId || randomUUID(),
            unverifiedIdentifiers: body.patient?.unverifiedIdentifier,
            verifiedIdentifiers: body.patient?.verifiedIdentifier,
            gateway,
          });
        } else if (path.includes('/link/care-context/init') || path.endsWith('/link/init')) {
          if (body.transactionId && body.patient?.referenceNumber) {
            await initUserLink(q, {
              orgId: targetOrgId,
              inboundRequestId,
              transactionId: body.transactionId,
              patientReference: body.patient.referenceNumber,
              careContextReferences: (body.patient?.careContexts || []).map(
                (c: { referenceNumber: string }) => c.referenceNumber,
              ),
              gateway,
            });
          }
        } else if (path.includes('/link/care-context/confirm') || path.endsWith('/link/confirm')) {
          if (body.transactionId && body.confirmation?.linkRefNumber && body.confirmation?.token) {
            await confirmUserLink(q, {
              orgId: targetOrgId,
              inboundRequestId,
              transactionId: body.transactionId,
              linkReferenceNumber: body.confirmation.linkRefNumber,
              token: body.confirmation.token,
              gateway,
            });
          }
        } else if (path.includes('/consent/request/hip/notify')) {
          const consentId = body.notification?.consentId || body.consentId;
          const rawStatus = body.notification?.status;
          const status = rawStatus === 'REVOKED' || rawStatus === 'EXPIRED' ? rawStatus : 'GRANTED';
          if (consentId) {
            await handleHipConsentNotify(q, {
              orgId: targetOrgId,
              inboundRequestId,
              consentId,
              status,
              consentDetail: body.notification?.consentDetail,
              gateway,
            });
          }
        } else if (path.includes('/hip/health-information/request')) {
          const transId = body.transactionId || body.hiRequest?.transactionId;
          const consId = body.hiRequest?.consent?.id;
          const pushUrl = body.hiRequest?.dataPushUrl;
          const km = body.hiRequest?.keyMaterial;
          if (transId && consId && pushUrl && km) {
            await processHealthInfoRequest(q, {
              orgId: targetOrgId,
              inboundRequestId,
              transactionId: transId,
              consentId: consId,
              dateRange: body.hiRequest?.dateRange,
              dataPushUrl: pushUrl,
              keyMaterial: km,
              gateway,
            });
          }
        } else if (path.includes('/token/on-generate-token')) {
          if (body.abhaAddress && body.linkToken) {
            await handleOnGenerateLinkToken(q, {
              orgId: targetOrgId,
              abhaAddress: body.abhaAddress,
              linkToken: body.linkToken,
              responseRequestId: body.response?.requestId,
            });
          }
        } else if (path.includes('/link/on_carecontext') || path.includes('/link/on-add-contexts')) {
          await handleOnCareContextLinked(q, {
            orgId: targetOrgId,
            careContextRef: careContextRef || undefined,
            responseRequestId: body.response?.requestId,
            status: body.error ? 'FAILED' : 'SUCCESS',
          });
        } else if (path.includes('/hiu/consent/request/on-init')) {
          if (body.response?.requestId && body.consentRequest?.id) {
            await handleOnConsentRequestInit(q, {
              orgId: targetOrgId,
              responseRequestId: body.response.requestId,
              consentRequestId: body.consentRequest.id,
            });
          }
        } else if (path.includes('/hiu/consent/request/notify')) {
          if (!body.notification?.status) throw new Error('missing_consent_notification_status');
          await handleHiuConsentNotify(q, {
            orgId: targetOrgId,
            storage,
            inboundRequestId,
            status: body.notification.status,
            consentRequestId: body.notification?.consentRequestId,
            consentArtefacts: body.notification?.consentArtefacts,
            gateway,
          });
        } else if (path.includes('/hiu/consent/on-fetch')) {
          if (body.consent?.consentDetail) {
            await handleOnFetchConsentArtifact(q, {
              orgId: targetOrgId,
              responseRequestId: body.response?.requestId,
              consent: body.consent,
            });
          }
        } else if (path.includes('/hiu/health-information/on-request')) {
          const transId = body.hiRequest?.transactionId || body.transactionId;
          if (transId) {
            await handleOnHealthInfoRequest(q, {
              orgId: targetOrgId,
              responseRequestId: body.response?.requestId,
              transactionId: transId,
              sessionStatus: body.hiRequest?.sessionStatus || 'ACKNOWLEDGED',
              error: body.error,
            });
          }
        } else if (path.includes('/hiu/health-information/push') || path.endsWith('/push')) {
          if (
            body.transactionId &&
            body.entries &&
            body.keyMaterial &&
            typeof body.pageNumber === 'number' &&
            typeof body.pageCount === 'number'
          ) {
            await receiveHealthInfoPush(q, {
              orgId: targetOrgId,
              payload: {
                transactionId: body.transactionId,
                pageNumber: body.pageNumber,
                pageCount: body.pageCount,
                entries: body.entries,
                keyMaterial: body.keyMaterial,
              },
              storage,
              ocr,
              extractor,
              gateway,
            });
          }
        }

        await q.query(
          `UPDATE abdm_inbox SET status = 'PROCESSED', processed_at = now()
            WHERE org_id = $1 AND request_id = $2 AND endpoint = $3`,
          [targetOrgId, inboundRequestId, path],
        );
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        await q.query('ROLLBACK TO SAVEPOINT callback_processing');
        if (path.includes('/hiu/health-information/push') && transactionId) {
          await q.query(`UPDATE abdm_hi_transfer SET status='FAILED', error_message=$3, ephemeral_private_key_enc=NULL
            WHERE org_id=$1 AND abdm_transaction_id=$2 AND status <> 'TRANSFERRED'`, [targetOrgId, transactionId, msg]);
        }
        await q.query(
          `UPDATE abdm_inbox SET status = 'FAILED', error_message = $4, processed_at = now()
            WHERE org_id = $1 AND request_id = $2 AND endpoint = $3`,
          [targetOrgId, inboundRequestId, path, msg],
        );
      }
    },
  );

  // Local simulator waits for the real handler and DB commit, never for an arbitrary timer.
  if (env.abdm.driver === 'simulated') {
    await processing;
    const result = await withTenant({ orgId: targetOrgId, userId: null, role: 'records_officer' },
      async (q) => q.query<{ status: string; error_message: string }>(
        'SELECT status, error_message FROM abdm_inbox WHERE org_id=$1 AND request_id=$2 AND endpoint=$3',
        [targetOrgId, inboundRequestId, path]));
    if (result.rows[0]?.status === 'FAILED') return NextResponse.json({ error: result.rows[0].error_message }, { status: 422 });
  } else {
    void processing.catch((err) => console.error('ABDM callback transaction failed', err));
  }

  // 3. Immediately reply 202 Accepted within < 500ms SLA
  const outReqId = randomUUID();
  const outTimestamp = new Date().toISOString();

  return NextResponse.json(
    {
      response: {
        requestId: inboundRequestId,
      },
    },
    {
      status: 202,
      headers: {
        'content-type': 'application/json',
        'request-id': outReqId,
        timestamp: outTimestamp,
      },
    },
  );
}
