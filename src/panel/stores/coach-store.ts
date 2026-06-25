import { create } from 'zustand';
import { streamChat, type ChatTurn } from '@/shared/ai-client';
import { buildCoachContext, buildSystemPrompt, COACH_SYSTEM_PROMPT } from '@/shared/coach-context';
import type { SessionSnapshot } from '@/shared/types';
import { resolveAiConfig, useSettingsStore } from './settings-store';

export interface CoachMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  streaming?: boolean;
  error?: boolean;
}

/** Cap to prevent runaway API spend within a single coaching session. */
export const MAX_USER_MESSAGES = 20;

const GREETING: CoachMessage = {
  id: 'greeting',
  role: 'assistant',
  content:
    "I'm your performance coach. I can see everything Perflex has captured on this page. Ask me anything — why is this page slow? What should I fix first? How do I optimize this script?",
};

let idSeq = 0;
const nextId = () => `m${++idSeq}`;

interface CoachState {
  messages: CoachMessage[];
  busy: boolean;
  userMessageCount: number;
  approxTokens: number;
  send: (text: string, snapshot: SessionSnapshot | null) => Promise<void>;
  reset: () => void;
}

export const useCoachStore = create<CoachState>((set, get) => ({
  messages: [GREETING],
  busy: false,
  userMessageCount: 0,
  approxTokens: 0,

  reset() {
    set({ messages: [GREETING], busy: false, userMessageCount: 0, approxTokens: 0 });
  },

  async send(text, snapshot) {
    const trimmed = text.trim();
    const { busy, userMessageCount, messages } = get();
    if (!trimmed || busy) return;

    const cfg = resolveAiConfig(useSettingsStore.getState());
    if (!cfg) return;

    if (userMessageCount >= MAX_USER_MESSAGES) {
      set({
        messages: [
          ...messages,
          { id: nextId(), role: 'user', content: trimmed },
          { id: nextId(), role: 'assistant', content: `You've reached the ${MAX_USER_MESSAGES}-message limit for this session. Start a new conversation to continue.`, error: true },
        ],
        userMessageCount: userMessageCount + 1,
      });
      return;
    }

    // API messages = real turns so far (drop the local greeting) + this question.
    const apiMessages: ChatTurn[] = messages
      .filter((m) => m.id !== 'greeting' && m.content)
      .map((m) => ({ role: m.role, content: m.content }));
    apiMessages.push({ role: 'user', content: trimmed });

    const context = snapshot ? buildCoachContext(snapshot) : null;
    const system = context
      ? buildSystemPrompt(context)
      : `${COACH_SYSTEM_PROMPT}\n\n(No session data has been captured yet — interact with the page first.)`;

    const assistantId = nextId();
    set({
      busy: true,
      userMessageCount: userMessageCount + 1,
      messages: [
        ...messages,
        { id: nextId(), role: 'user', content: trimmed },
        { id: assistantId, role: 'assistant', content: '', streaming: true },
      ],
    });

    const append = (chunk: string) =>
      set((s) => ({
        messages: s.messages.map((m) => (m.id === assistantId ? { ...m, content: m.content + chunk } : m)),
      }));

    try {
      const full = await streamChat(cfg, { system, messages: apiMessages, onText: append });
      set((s) => ({
        busy: false,
        approxTokens: s.approxTokens + Math.ceil((system.length + trimmed.length + full.length) / 4),
        messages: s.messages.map((m) =>
          m.id === assistantId ? { ...m, streaming: false, content: m.content || '(no response)' } : m
        ),
      }));
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Something went wrong talking to Claude.';
      set((s) => ({
        busy: false,
        messages: s.messages.map((m) => (m.id === assistantId ? { ...m, streaming: false, error: true, content: message } : m)),
      }));
    }
  },
}));
