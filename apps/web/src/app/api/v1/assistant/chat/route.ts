import { NextResponse } from 'next/server';
import { withTenant, addMessage, createConversation, getConversation, updateConversationTitle } from '@oncobrief/db';
import { getSession, tenantCtx } from '@/lib/session';
import { runAssistant, type AssistantContext } from '@/lib/assistant/orchestrator';

/**
 * Ask OncoBrief chat endpoint.
 *
 * Authorisation is enforced here, server-side. The client may send a patient
 * id as *context*, but it is never trusted as proof of access — every read
 * runs inside a tenant-scoped transaction and getPatient() runs under RLS, so
 * a cross-tenant id returns nothing. The LLM never chooses the patient.
 */
export async function POST(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: { code: 'unauthorized' } }, { status: 401 });
  }

  let body: {
    message?: string;
    conversationId?: string;
    context?: Partial<AssistantContext>;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: { code: 'bad_request' } }, { status: 400 });
  }

  const message = (body.message ?? '').trim();
  if (message.length === 0) {
    return NextResponse.json({ error: { code: 'empty_message' } }, { status: 400 });
  }
  if (message.length > 4000) {
    return NextResponse.json({ error: { code: 'message_too_long' } }, { status: 400 });
  }

  const context: AssistantContext = {
    patientId: body.context?.patientId ?? null,
    route: body.context?.route ?? '/workspace',
    ...(body.context?.selectedDocumentId ? { selectedDocumentId: body.context.selectedDocumentId } : {}),
    ...(body.context?.selectedEvidenceId ? { selectedEvidenceId: body.context.selectedEvidenceId } : {}),
    ...(body.context?.languageCode ? { languageCode: body.context.languageCode } : {}),
  };

  const result = await withTenant(tenantCtx(session), async (q) => {
    // Resolve or create the conversation, scoped to this user.
    let conversationId = body.conversationId ?? null;
    if (conversationId) {
      const existing = await getConversation(q, conversationId, session.userId);
      if (!existing) {
        // Do not reveal whether the conversation exists for another user.
        conversationId = null;
      }
    }

    const history: { role: 'user' | 'assistant'; content: string }[] = [];
    if (conversationId) {
      const existing = await getConversation(q, conversationId, session.userId);
      for (const m of existing?.messages.slice(-6) ?? []) {
        if (m.role === 'user' || m.role === 'assistant') {
          history.push({ role: m.role, content: m.content });
        }
      }
    } else {
      const created = await createConversation(q, {
        orgId: session.orgId,
        userId: session.userId,
        patientId: context.patientId,
        title: message.slice(0, 60),
      });
      conversationId = created.id;
    }

    await addMessage(q, { conversationId, role: 'user', content: message });

    const response = await runAssistant(q, { message, context, history });

    await addMessage(q, {
      conversationId,
      role: 'assistant',
      content: response.answer,
      intent: response.intent,
      grounded: response.grounded,
      sources: response.sources,
      navigation: response.navigation,
    });

    if (history.length === 0) {
      await updateConversationTitle(q, conversationId, session.userId, message.slice(0, 60));
    }

    return { conversationId, response };
  });

  return NextResponse.json({
    conversationId: result.conversationId,
    answer: result.response.answer,
    intent: result.response.intent,
    grounded: result.response.grounded,
    sources: result.response.sources,
    navigation: result.response.navigation,
    conflict: result.response.conflict,
    suggestedQuestions: result.response.suggestedQuestions,
    requestId: result.response.requestId,
  });
}
