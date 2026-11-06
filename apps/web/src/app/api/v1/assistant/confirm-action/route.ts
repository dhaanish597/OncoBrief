import { NextResponse } from 'next/server';
import {
  can,
  isTaskKind,
  type AssistantPendingActionProposal,
  type TaskKind,
} from '@oncobrief/domain';
import { appendAuditEvent, createTask, getConversation, withTenant } from '@oncobrief/db';
import { assertPatientBelongsToOrg, getSession, tenantCtx } from '@/lib/session';

/**
 * Confirmation-Gated Co-Pilot Action Execution Endpoint (`TASK-009`, ADR-005).
 *
 * `Ask OncoBrief` never mutates the database during a chat turn. Instead, it
 * stages an `AssistantPendingActionProposal` (`status: 'awaiting_human_approval'`)
 * on `chat_message.pending_action_json`. Only when an authorized human user
 * clicks "Approve & Create Task" (or "Dismiss") does this endpoint execute
 * the task creation under `withTenant` and record a hash-chained `audit_event`.
 */
export async function POST(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: { code: 'unauthorized' } }, { status: 401 });
  }

  let body: {
    conversationId?: string;
    messageId?: string;
    decision?: 'confirm' | 'cancel';
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: { code: 'bad_request' } }, { status: 400 });
  }

  const conversationId = (body.conversationId ?? '').trim();
  const messageId = (body.messageId ?? '').trim();
  const decision = body.decision === 'cancel' ? 'cancel' : 'confirm';

  if (!conversationId || !messageId) {
    return NextResponse.json({ error: { code: 'missing_parameters' } }, { status: 400 });
  }

  if (decision === 'confirm' && !can(session.role, 'task:create')) {
    return NextResponse.json({ error: { code: 'forbidden' } }, { status: 403 });
  }

  return withTenant(tenantCtx(session), async (q) => {
    const conv = await getConversation(q, conversationId, session.userId);
    if (!conv) {
      return NextResponse.json({ error: { code: 'conversation_not_found' } }, { status: 404 });
    }

    const msgRes = await q.query<{
      id: string;
      pending_action_json: AssistantPendingActionProposal | null;
    }>(
      `SELECT id, pending_action_json
         FROM chat_message
        WHERE org_id = $1 AND conversation_id = $2 AND id = $3
        FOR UPDATE`,
      [session.orgId, conversationId, messageId],
    );

    const row = msgRes.rows[0];
    if (!row || !row.pending_action_json) {
      return NextResponse.json({ error: { code: 'pending_action_not_found' } }, { status: 404 });
    }

    const proposal = row.pending_action_json;
    if (proposal.status !== 'awaiting_human_approval') {
      return NextResponse.json(
        { error: { code: 'action_already_processed' }, status: proposal.status },
        { status: 409 },
      );
    }

    await assertPatientBelongsToOrg(q, session.orgId, proposal.patientId);

    if (decision === 'cancel') {
      const updated: AssistantPendingActionProposal = {
        ...proposal,
        status: 'cancelled',
      };
      await q.query(
        `UPDATE chat_message SET pending_action_json = $3::jsonb WHERE org_id = $1 AND id = $2`,
        [session.orgId, messageId, JSON.stringify(updated)],
      );
      await appendAuditEvent(q, {
        orgId: session.orgId,
        actor: { userId: session.userId, role: session.role },
        action: 'assistant.action_cancelled',
        entityKind: 'chat_message',
        entityId: messageId,
        outcome: 'success',
        metadata: { proposalId: proposal.proposalId, actionKind: proposal.actionKind },
      });
      return NextResponse.json({ ok: true, status: 'cancelled', pendingAction: updated });
    }

    const taskKind: TaskKind = isTaskKind(proposal.taskKind)
      ? proposal.taskKind
      : 'retrieve_document';

    const origin =
      proposal.originKind === 'record_gap'
        ? ({ kind: 'record_gap' as const, recordGapId: proposal.originId })
        : proposal.originKind === 'document'
          ? ({ kind: 'document' as const, documentId: proposal.originId })
          : ({ kind: 'evidence' as const, evidenceFactId: proposal.originId });

    const createdTaskId = await createTask(q, {
      orgId: session.orgId,
      patientId: proposal.patientId,
      title: proposal.title,
      detail: proposal.detail,
      taskKind,
      origin,
      createdBy: session.userId,
    });

    const confirmed: AssistantPendingActionProposal = {
      ...proposal,
      status: 'confirmed',
    };

    await q.query(
      `UPDATE chat_message SET pending_action_json = $3::jsonb WHERE org_id = $1 AND id = $2`,
      [session.orgId, messageId, JSON.stringify(confirmed)],
    );

    await appendAuditEvent(q, {
      orgId: session.orgId,
      actor: { userId: session.userId, role: session.role },
      action: 'assistant.action_confirmed',
      entityKind: 'admin_task',
      entityId: createdTaskId,
      outcome: 'success',
      metadata: {
        proposalId: proposal.proposalId,
        actionKind: proposal.actionKind,
        messageId,
        originKind: proposal.originKind,
      },
    });

    return NextResponse.json({
      ok: true,
      status: 'confirmed',
      taskId: createdTaskId,
      pendingAction: confirmed,
    });
  });
}
