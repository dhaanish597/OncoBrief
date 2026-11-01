import { NextResponse } from 'next/server';
import {
  createPatientShareGrant,
  revokePatientShareGrant,
  withPatientPortalContext,
  appendAuditEvent,
} from '@oncobrief/db';
import { requirePatientPortalSession, NO_CACHE_HEADERS } from '@/lib/patient-session';

export async function POST(request: Request) {
  const auth = await requirePatientPortalSession(request);
  if (!auth.ok) return auth.response;
  const { session } = auth;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json(
      { error: { code: 'bad_request', message: 'Invalid JSON body' } },
      { status: 400, headers: NO_CACHE_HEADERS },
    );
  }

  const {
    recipientLabel,
    recipientRole = 'second_opinion_clinician',
    sharedDocumentIds = [],
    includeQuestions = true,
    expiresInHours = 72,
  } = body as {
    recipientLabel?: string;
    recipientRole?: 'caregiver' | 'second_opinion_clinician' | 'self_print';
    sharedDocumentIds?: string[];
    includeQuestions?: boolean;
    expiresInHours?: number;
  };

  if (!recipientLabel || typeof recipientLabel !== 'string' || !recipientLabel.trim()) {
    return NextResponse.json(
      { error: { code: 'bad_request', message: 'recipientLabel is required' } },
      { status: 400, headers: NO_CACHE_HEADERS },
    );
  }

  if (!['caregiver', 'second_opinion_clinician', 'self_print'].includes(recipientRole)) {
    return NextResponse.json(
      { error: { code: 'bad_request', message: 'Invalid recipientRole' } },
      { status: 400, headers: NO_CACHE_HEADERS },
    );
  }

  const result = await withPatientPortalContext(session, async (q) => {
    // 1. Ownership check: verify every sharedDocumentId belongs to this patient (SEC-NEG-06)
    if (sharedDocumentIds.length > 0) {
      const docsRes = await q.query<{ id: string }>(
        `SELECT id FROM document
         WHERE org_id = $1 AND patient_id = $2 AND id = ANY($3::uuid[])`,
        [session.orgId, session.patientId, sharedDocumentIds],
      );
      if (docsRes.rowCount !== sharedDocumentIds.length) {
        return {
          status: 404,
          error: 'invalid_document_selection',
          message: 'One or more selected documents do not belong to the authorized patient',
        };
      }
    }

    // 2. Create share grant
    const grant = await createPatientShareGrant(
      {
        orgId: session.orgId,
        patientId: session.patientId,
        recipientLabel: recipientLabel.trim(),
        recipientRole,
        sharedDocumentIds,
        includeQuestions,
        expiresInHours,
      },
      q,
    );

    // 3. Audit log
    try {
      await appendAuditEvent(q, {
        orgId: session.orgId,
        actor: { userId: null, role: session.actorRole },
        action: 'share.created' as unknown as Parameters<typeof appendAuditEvent>[1]['action'],
        entityKind: 'patient_share_grant',
        entityId: grant.grantId,
        outcome: 'success',
        metadata: {
          patientId: session.patientId,
          recipientLabel: recipientLabel.trim(),
          recipientRole,
          sharedCount: sharedDocumentIds.length,
          expiresAt: grant.expiresAt,
        },
      });
    } catch {
      /* non-fatal */
    }

    return {
      status: 201,
      grantId: grant.grantId,
      shareToken: grant.shareToken,
      expiresAt: grant.expiresAt,
      shareUrl: `/api/v1/patient-portal/shares/${grant.shareToken}`,
    };
  });

  if ('error' in result) {
    return NextResponse.json(
      { error: { code: result.error, message: result.message } },
      { status: result.status, headers: NO_CACHE_HEADERS },
    );
  }

  return NextResponse.json(
    {
      grantId: result.grantId,
      shareToken: result.shareToken,
      expiresAt: result.expiresAt,
      shareUrl: result.shareUrl,
    },
    { status: 201, headers: NO_CACHE_HEADERS },
  );
}

export async function DELETE(request: Request) {
  const auth = await requirePatientPortalSession(request);
  if (!auth.ok) return auth.response;
  const { session } = auth;

  const url = new URL(request.url);
  const grantId = url.searchParams.get('id');

  if (!grantId) {
    return NextResponse.json(
      { error: { code: 'bad_request', message: 'id query parameter is required' } },
      { status: 400, headers: NO_CACHE_HEADERS },
    );
  }

  const result = await withPatientPortalContext(session, async (q) => {
    const revoked = await revokePatientShareGrant(grantId, session, q);
    if (!revoked) {
      return { status: 404, error: 'not_found', message: 'Share grant not found or already revoked' };
    }

    try {
      await appendAuditEvent(q, {
        orgId: session.orgId,
        actor: { userId: null, role: session.actorRole },
        action: 'share.revoked' as unknown as Parameters<typeof appendAuditEvent>[1]['action'],
        entityKind: 'patient_share_grant',
        entityId: grantId,
        outcome: 'success',
        metadata: {
          patientId: session.patientId,
          grantId,
        },
      });
    } catch {
      /* non-fatal */
    }

    return { status: 200, grantId, revoked: true };
  });

  if ('error' in result) {
    return NextResponse.json(
      { error: { code: result.error, message: result.message } },
      { status: result.status, headers: NO_CACHE_HEADERS },
    );
  }

  return NextResponse.json(result, { status: 200, headers: NO_CACHE_HEADERS });
}
