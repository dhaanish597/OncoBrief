'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { SourceCard, type SourceCardData } from './SourceCard';
import { useVoice, VOICE_LANGUAGES, type VoiceState } from './useVoice';

interface NavigationSuggestion {
  action: string;
  label: string;
  href: string;
}

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  intent?: string | null;
  grounded?: boolean;
  sources?: SourceCardData[];
  navigation?: NavigationSuggestion | null;
  conflict?: boolean;
  suggestedQuestions?: string[];
}

interface ConversationListItem {
  id: string;
  title: string;
  patientId: string | null;
  updatedAt: string;
}

const DEFAULT_SUGGESTIONS = [
  'Show the latest pathology report',
  'What documents are missing?',
  'Show conflicting evidence',
  'Take me to Evidence Journey',
];

function extractContext(pathname: string, search: URLSearchParams) {
  const patientMatch = pathname.match(/\/patients\/([0-9a-fA-F-]{36})/);
  const documentMatch = pathname.match(/\/sources\/([0-9a-fA-F-]{36})/);
  return {
    route: pathname,
    patientId: patientMatch?.[1] ?? null,
    selectedDocumentId: documentMatch?.[1] ?? null,
    selectedEvidenceId: search.get('fact'),
  };
}

export function AssistantPanel({ onClose }: { onClose: () => void }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();

  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [conversations, setConversations] = useState<ConversationListItem[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [languageCode, setLanguageCode] = useState('en-IN');
  const [pendingNav, setPendingNav] = useState<NavigationSuggestion | null>(null);
  const [readAloud, setReadAloud] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const context = extractContext(pathname, new URLSearchParams(searchParams.toString()));

  const voice = useVoice({
    languageCode,
    onTranscript: (text) => {
      setInput((prev) => (prev ? `${prev} ${text}` : text));
      void sendMessage(text);
    },
  });

  const scrollToBottom = useCallback(() => {
    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
    });
  }, []);

  useEffect(scrollToBottom, [messages, loading, scrollToBottom]);

  const loadConversations = useCallback(async () => {
    try {
      const url = context.patientId
        ? `/api/v1/assistant/conversations?patientId=${context.patientId}`
        : '/api/v1/assistant/conversations';
      const res = await fetch(url);
      if (!res.ok) return;
      const data = await res.json();
      setConversations(data.conversations ?? []);
    } catch {
      /* non-fatal */
    }
  }, [context.patientId]);

  useEffect(() => {
    void loadConversations();
  }, [loadConversations]);

  const sendMessage = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || loading) return;
      setInput('');
      setLoading(true);
      setPendingNav(null);

      const userMessage: Message = { id: `local-${Date.now()}`, role: 'user', content: trimmed };
      setMessages((prev) => [...prev, userMessage]);

      try {
        const res = await fetch('/api/v1/assistant/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: trimmed,
            conversationId,
            context: { ...context, languageCode },
          }),
        });

        if (!res.ok) {
          const data = await res.json().catch(() => null);
          const code = data?.error?.code;
          const fallback =
            code === 'unauthorized'
              ? 'Your session expired. Please sign in again.'
              : "I couldn't retrieve the requested OncoBrief information right now. Please try again.";
          setMessages((prev) => [...prev, { id: `err-${Date.now()}`, role: 'assistant', content: fallback }]);
          return;
        }

        const data = await res.json();
        if (data.conversationId) setConversationId(data.conversationId);

        const assistantMessage: Message = {
          id: `a-${Date.now()}`,
          role: 'assistant',
          content: data.answer,
          intent: data.intent,
          grounded: data.grounded,
          sources: data.sources ?? [],
          navigation: data.navigation ?? null,
          conflict: data.conflict ?? false,
          suggestedQuestions: data.suggestedQuestions ?? [],
        };
        setMessages((prev) => [...prev, assistantMessage]);
        if (data.navigation) setPendingNav(data.navigation);
        if (readAloud && data.answer) void voice.speak(data.answer);
        void loadConversations();
      } catch {
        setMessages((prev) => [
          ...prev,
          {
            id: `err-${Date.now()}`,
            role: 'assistant',
            content: "I couldn't reach OncoBrief right now. Please check your connection and try again.",
          },
        ]);
      } finally {
        setLoading(false);
      }
    },
    [context, conversationId, languageCode, loadConversations, loading, readAloud, voice],
  );

  const openConversation = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/v1/assistant/conversations/${id}`);
      if (!res.ok) return;
      const data = await res.json();
      setConversationId(id);
      setMessages(
        (data.conversation.messages ?? []).map(
          (m: {
            id: string;
            role: 'user' | 'assistant';
            content: string;
            intent?: string | null;
            grounded?: boolean;
            sources?: SourceCardData[];
            navigation?: NavigationSuggestion | null;
          }) => ({
            id: m.id,
            role: m.role,
            content: m.content,
            intent: m.intent,
            grounded: m.grounded,
            sources: m.sources ?? [],
            navigation: m.navigation ?? null,
            suggestedQuestions: [],
          }),
        ),
      );
      setShowHistory(false);
      setPendingNav(null);
    } catch {
      /* non-fatal */
    }
  }, []);

  const deleteConversation = useCallback(
    async (id: string) => {
      try {
        await fetch(`/api/v1/assistant/conversations/${id}`, { method: 'DELETE' });
        if (id === conversationId) {
          setConversationId(null);
          setMessages([]);
        }
        void loadConversations();
      } catch {
        /* non-fatal */
      }
    },
    [conversationId, loadConversations],
  );

  const confirmNavigation = useCallback(() => {
    if (!pendingNav) return;
    router.push(pendingNav.href);
    setPendingNav(null);
    onClose();
  }, [pendingNav, router, onClose]);

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void sendMessage(input);
    }
  };

  const latestSuggestions =
    [...messages].reverse().find((m) => m.role === 'assistant' && (m.suggestedQuestions?.length ?? 0) > 0)
      ?.suggestedQuestions ?? DEFAULT_SUGGESTIONS;

  return (
    <div
      data-testid="assistant-panel"
      className="fixed inset-x-0 bottom-0 z-50 flex h-[92vh] flex-col border border-[var(--color-rule-strong)] bg-[var(--color-paper)] shadow-[0_8px_40px_rgba(27,26,23,0.18)] sm:inset-x-auto sm:right-6 sm:bottom-6 sm:h-[42rem] sm:max-h-[calc(100vh-3rem)] sm:w-[26rem]"
      role="dialog"
      aria-label="Ask OncoBrief"
    >
      <header className="flex items-start gap-2 border-b border-[var(--color-rule-strong)] bg-[var(--color-paper-raised)] px-4 py-3">
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold tracking-tight">Ask OncoBrief</h2>
          <p className="mono text-[10px] uppercase tracking-[0.14em] text-[var(--color-ink-soft)]">
            Evidence-grounded assistant
          </p>
        </div>
        <select
          aria-label="Voice language"
          value={languageCode}
          onChange={(e) => setLanguageCode(e.target.value)}
          className="mono max-w-[6.5rem] border border-[var(--color-rule-strong)] bg-white px-1 py-1 text-[10px]"
        >
          {VOICE_LANGUAGES.map((l) => (
            <option key={l.code} value={l.code}>
              {l.label}
            </option>
          ))}
        </select>
        <button
          type="button"
          aria-label="Conversation history"
          data-testid="assistant-history"
          onClick={() => setShowHistory((s) => !s)}
          className="mono border border-[var(--color-rule-strong)] px-2 py-1 text-[10px] uppercase hover:bg-[var(--color-accent-soft)]"
        >
          History
        </button>
        <button
          type="button"
          aria-label="Close assistant"
          data-testid="assistant-close"
          onClick={onClose}
          className="mono border border-[var(--color-rule-strong)] px-2 py-1 text-[10px] uppercase hover:bg-[var(--color-accent-soft)]"
        >
          Close
        </button>
      </header>

      {showHistory ? (
        <div className="flex-1 overflow-y-auto p-3" data-testid="assistant-history-list">
          {conversations.length === 0 ? (
            <p className="mono text-xs text-[var(--color-ink-soft)]">No saved conversations yet.</p>
          ) : (
            <ul className="space-y-1">
              {conversations.map((c) => (
                <li key={c.id} className="flex items-center gap-2 border border-[var(--color-rule)] px-2 py-1.5">
                  <button
                    type="button"
                    onClick={() => void openConversation(c.id)}
                    className="min-w-0 flex-1 truncate text-left text-xs hover:underline"
                  >
                    {c.title}
                  </button>
                  <button
                    type="button"
                    aria-label="Delete conversation"
                    data-testid="assistant-delete"
                    onClick={() => void deleteConversation(c.id)}
                    className="mono text-[10px] text-[var(--color-state-conflicting)] hover:underline"
                  >
                    delete
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : (
        <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-3 py-3" data-testid="assistant-messages">
          {messages.length === 0 ? (
            <div className="space-y-2">
              <p className="text-xs leading-relaxed text-[var(--color-ink-soft)]">
                Ask about the selected patient&rsquo;s record, or ask me to guide you around OncoBrief. I only
                answer from the authorised evidence and I never invent clinical facts.
              </p>
            </div>
          ) : null}

          {messages.map((m) => (
            <div key={m.id} data-testid={`assistant-message-${m.role}`}>
              <div
                className={
                  m.role === 'user'
                    ? 'ml-auto max-w-[90%] border border-[var(--color-rule-strong)] bg-[var(--color-accent-soft)] px-3 py-2 text-[13px]'
                    : 'max-w-[95%] whitespace-pre-wrap border border-[var(--color-rule)] bg-[var(--color-paper-raised)] px-3 py-2 text-[13px] leading-relaxed'
                }
              >
                {m.role === 'assistant' && m.conflict ? (
                  <p className="mono mb-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--color-state-conflicting)]">
                    Conflicting evidence
                  </p>
                ) : null}
                {m.content}
              </div>

              {m.role === 'assistant' && (m.sources?.length ?? 0) > 0 ? (
                <div className="mt-2 space-y-2" data-testid="assistant-sources">
                  {m.sources!.map((s) => (
                    <SourceCard key={s.evidenceFactId + s.documentId} source={s} />
                  ))}
                </div>
              ) : null}
            </div>
          ))}

          {loading ? (
            <p className="mono text-[11px] text-[var(--color-ink-soft)]" data-testid="assistant-loading">
              {voice.state === 'transcribing' ? 'Transcribing…' : 'Checking the evidence…'}
            </p>
          ) : null}
        </div>
      )}

      {pendingNav ? (
        <div className="border-t border-[var(--color-rule-strong)] bg-[var(--color-paper-raised)] px-3 py-2">
          <p className="text-xs">{pendingNav.label}. Would you like me to open it?</p>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              data-testid="assistant-go"
              onClick={confirmNavigation}
              className="mono border border-[var(--color-accent)] bg-[var(--color-accent)] px-3 py-1 text-[10px] uppercase tracking-wider text-white"
            >
              Go there
            </button>
            <button
              type="button"
              data-testid="assistant-cancel"
              onClick={() => setPendingNav(null)}
              className="mono border border-[var(--color-rule-strong)] px-3 py-1 text-[10px] uppercase tracking-wider"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      {messages.length === 0 && !showHistory ? (
        <div className="flex flex-wrap gap-1.5 border-t border-[var(--color-rule)] px-3 py-2">
          {latestSuggestions.slice(0, 4).map((s) => (
            <button
              key={s}
              type="button"
              data-testid="assistant-suggestion"
              onClick={() => void sendMessage(s)}
              className="mono border border-[var(--color-rule-strong)] bg-[var(--color-paper-raised)] px-2 py-1 text-[10px] hover:bg-[var(--color-accent-soft)]"
            >
              {s}
            </button>
          ))}
        </div>
      ) : null}

      <footer className="border-t border-[var(--color-rule-strong)] bg-[var(--color-paper-raised)] p-3">
        <div className="flex items-end gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            rows={1}
            placeholder="Type message…"
            aria-label="Message"
            data-testid="assistant-input"
            className="max-h-24 min-h-[2.2rem] flex-1 resize-none border border-[var(--color-rule-strong)] bg-white px-2 py-1.5 text-[13px]"
          />
          {voice.state === 'listening' ? (
            <button
              type="button"
              data-testid="assistant-stop-voice"
              onClick={voice.stopListening}
              className="mono border border-[var(--color-state-conflicting)] px-2 py-2 text-[11px] text-[var(--color-state-conflicting)]"
              aria-label="Stop recording"
            >
              Stop
            </button>
          ) : (
            <button
              type="button"
              data-testid="assistant-mic"
              onClick={() => void voice.startListening()}
              className="border border-[var(--color-rule-strong)] px-2 py-2 text-sm hover:bg-[var(--color-accent-soft)]"
              aria-label="Start voice input"
            >
              &#127908;
            </button>
          )}
          {voice.isSpeaking ? (
            <button
              type="button"
              data-testid="assistant-stop-speak"
              onClick={voice.stopSpeaking}
              className="mono border border-[var(--color-rule-strong)] px-2 py-2 text-[10px] uppercase"
              aria-label="Stop read aloud"
            >
              Stop
            </button>
          ) : (
            <button
              type="button"
              data-testid="assistant-readaloud"
              onClick={() => setReadAloud((r) => !r)}
              aria-pressed={readAloud}
              className="mono border border-[var(--color-rule-strong)] px-2 py-2 text-[10px] uppercase hover:bg-[var(--color-accent-soft)]"
              aria-label="Read answers aloud"
              title="Read answers aloud"
            >
              {readAloud ? '🔊' : '🔈'}
            </button>
          )}
          <button
            type="button"
            data-testid="assistant-send"
            onClick={() => void sendMessage(input)}
            disabled={loading}
            className="mono border border-[var(--color-accent)] bg-[var(--color-accent)] px-3 py-2 text-[11px] uppercase tracking-wider text-white disabled:opacity-50"
          >
            Send
          </button>
        </div>

        <p className="mono mt-2 text-[10px] text-[var(--color-ink-soft)]" data-testid="assistant-voice-state">
          {voiceStateLabel(voice.state)}
          {voice.error ? ` · ${voice.error}` : ''}
          {voice.state === 'listening' ? ' · recording…' : ''}
        </p>
      </footer>
    </div>
  );
}

function voiceStateLabel(state: VoiceState): string {
  switch (state) {
    case 'listening':
      return '🔴 Recording…';
    case 'transcribing':
      return 'Transcribing…';
    case 'speaking':
      return 'Speaking…';
    case 'error':
      return 'Voice error';
    default:
      return 'Ready';
  }
}
