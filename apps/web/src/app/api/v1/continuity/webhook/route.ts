import { createHmac, timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import {
  acceptOpdSlotOffer,
  declineOpdSlotOffer,
  getPool,
  processInboundAttendanceWebhook,
  withOrgTransaction,
} from '@oncobrief/db';
import { getSessionFromCookies, withSession } from '@/lib/session';

export interface ContinuityWebhookPayload {
  eventId?: string;
  orgId?: string;
  messageId: string;
  replyCode?: 'confirmed' | 'reschedule_requested' | 'declined';
  responseAction?:
    | 'confirm_attendance'
    | 'request_reschedule'
    | 'confirm_documents_ready'
    | 'accept_slot_offer'
    | 'decline_slot_offer'
    | 'cannot_attend';
  slotId?: string;
  waitlistEntryId?: string;
  responder?: 'patient' | 'caregiver';
  responderKind?: 'patient' | 'caregiver';
  channel?: 'sms' | 'whatsapp' | 'ivr';
  rawReplyText?: string;
  note?: string;
}

function computeContinuityWebhookSignature(rawBody: string, secret?: string): string {
  const effectiveSecret =
    secret ||
    process.env['CONTINUITY_WEBHOOK_SECRET'] ||
    'oncobrief-dev-continuity-webhook-secret';
  return createHmac('sha256', effectiveSecret).update(rawBody, 'utf8').digest('hex');
}

function verifyContinuityWebhookSignature(
  rawBody: string,
  signatureHeader: string | null,
  secret?: string,
): boolean {
  if (!signatureHeader) return false;
  const cleanSig = signatureHeader.replace(/^sha256=/i, '').trim();
  if (!/^[0-9a-f]{64}$/i.test(cleanSig)) return false;
  const expected = computeContinuityWebhookSignature(rawBody, secret);
  try {
    const a = Buffer.from(cleanSig, 'hex');
    const b = Buffer.from(expected, 'hex');
    return a.length === b.length && timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

/**
 * Inbound patient/caregiver continuity reply webhook (`TASK-023`, Step 2E Security Hardened).
 *
 * Security defenses enforced:
 * 1. Rejects requests with an invalid `x-oncobrief-signature` / `x-oncobrief-webhook-signature`
 *    header (`401 invalid_webhook_signature`) EVEN IF a session cookie is present.
 * 2. Requires either a valid HMAC-SHA256 signature OR an authenticated clinician/coordinator session.
 * 3. Rejects forged `orgId` payloads (`403 forged_org_id_mismatch`) if `body.orgId` does not
 *    match the authoritative `patient_message.org_id` (or active session `orgId`).
 * 4. Enforces `webhook_event_id` idempotency against duplicate/replayed callbacks.
 * 5. Rejects unauthorized state transitions (`400 message_not_delivered` when message is still
 *    `draft` or `pending_approval`).
 * 6. Supports both attendance confirmations (`confirmed`, `reschedule_requested`, `declined`)
 *    and two-step OPD slot offer responses (`accept_slot_offer`, `decline_slot_offer`).
 */
export async function POST(req: Request): Promise<NextResponse> {
  try {
    const rawBody = await req.text();
    const signatureHeader =
      req.headers.get('x-oncobrief-signature') ??
      req.headers.get('x-oncobrief-webhook-signature');

    // If a signature header is provided, it MUST be cryptographically valid
    if (signatureHeader !== null && !verifyContinuityWebhookSignature(rawBody, signatureHeader)) {
      return NextResponse.json({ ok: false, error: 'invalid_webhook_signature' }, { status: 401 });
    }

    const isHmacAuthenticated =
      signatureHeader !== null && verifyContinuityWebhookSignature(rawBody, signatureHeader);
    const session = await getSessionFromCookies();

    if (!isHmacAuthenticated && !session) {
      return NextResponse.json(
        { ok: false, error: 'unauthorized_webhook_signature_or_session' },
        { status: 401 },
      );
    }

    const body = JSON.parse(rawBody) as ContinuityWebhookPayload;
    if (!body.messageId) {
      return NextResponse.json({ ok: false, error: 'invalid_webhook_payload' }, { status: 400 });
    }

    // Normalize replyCode from either replyCode or responseAction
    const normalizedReplyCode: 'confirmed' | 'reschedule_requested' | 'declined' =
      body.replyCode ??
      (body.responseAction === 'confirm_attendance' ||
      body.responseAction === 'confirm_documents_ready' ||
      body.responseAction === 'accept_slot_offer'
        ? 'confirmed'
        : body.responseAction === 'request_reschedule'
          ? 'reschedule_requested'
          : 'declined');

    if (!['confirmed', 'reschedule_requested', 'declined'].includes(normalizedReplyCode)) {
      return NextResponse.json({ ok: false, error: 'invalid_webhook_payload' }, { status: 400 });
    }

    const responder = body.responder ?? body.responderKind ?? 'patient';
    const note = body.note ?? body.rawReplyText ?? null;

    const executeInTenant = async (
      q: Parameters<Parameters<typeof withSession>[0]>[0],
      orgId: string,
      actorUserId: string,
    ) => {
      if (body.orgId && body.orgId !== orgId) {
        throw new Error('forged_org_id_mismatch');
      }

      const webhookResult = await processInboundAttendanceWebhook(q, {
        orgId,
        actorUserId,
        messageId: body.messageId,
        replyCode: normalizedReplyCode,
        responder,
        channel: body.channel ?? 'sms',
        note,
        eventId: body.eventId ?? null,
      });

      // If this webhook reply is also accepting or declining a reserved OPD slot offer (TASK-008 + TASK-023)
      if (!webhookResult.idempotentReplay && body.slotId) {
        if (body.responseAction === 'accept_slot_offer') {
          await acceptOpdSlotOffer(q, {
            orgId,
            actorId: actorUserId,
            slotId: body.slotId,
            requestId: body.eventId || `webhook-accept-${body.messageId}`,
            ...(body.waitlistEntryId ? { waitlistEntryId: body.waitlistEntryId } : {}),
            reason: 'Patient accepted OPD slot offer via continuity reply',
          });
        } else if (body.responseAction === 'decline_slot_offer') {
          await declineOpdSlotOffer(q, {
            orgId,
            actorId: actorUserId,
            slotId: body.slotId,
            requestId: body.eventId || `webhook-decline-${body.messageId}`,
            ...(body.waitlistEntryId ? { waitlistEntryId: body.waitlistEntryId } : {}),
            reason: 'Patient declined OPD slot offer via continuity reply',
          });
        }
      }

      return webhookResult;
    };

    const result = session
      ? await withSession(async (q, s) => executeInTenant(q, s.orgId, s.userId))
      : await (async () => {
          const lookup = await getPool().query<{ org_id: string; composed_by: string }>(
            `SELECT org_id, composed_by FROM patient_message WHERE id = $1 LIMIT 1`,
            [body.messageId],
          );
          const msgRow = lookup.rows[0];
          if (!msgRow) {
            throw new Error('message_not_found');
          }
          if (body.orgId && body.orgId !== msgRow.org_id) {
            throw new Error('forged_org_id_mismatch');
          }
          return withOrgTransaction(
            {
              orgId: msgRow.org_id,
              userId: msgRow.composed_by,
              role: 'coordinator',
            },
            async (q) => executeInTenant(q, msgRow.org_id, msgRow.composed_by),
          );
        })();

    return NextResponse.json({
      ok: true,
      idempotentReplay: result.idempotentReplay,
      messageId: result.message.id,
      attendanceStatus: result.message.attendanceStatus,
      followUpTaskCreated: result.followUpTaskCreated,
      followUpTaskId: result.followUpTaskId,
      visitedNodes: result.visitedNodes,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'webhook_processing_failed';
    const status = /forged_org_id_mismatch|forbidden/i.test(message)
      ? 403
      : /not_found/i.test(message)
        ? 404
        : /not_delivered|invalid/i.test(message)
          ? 400
          : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
