import { useEffect, useRef } from 'react';
import { useSessionStore } from '../stores/session-store';
import { resolveAiConfig, useSettingsStore } from '../stores/settings-store';
import { useCoachStore, MAX_USER_MESSAGES } from '../stores/coach-store';
import { ChatMessage } from '../components/coach/ChatMessage';
import { ChatInput } from '../components/coach/ChatInput';

const QUICK_ACTIONS = [
  'Why is this page slow?',
  'What should I fix first?',
  'Explain my Core Web Vitals',
  'Analyze third-party impact',
];

export function Coach() {
  const settings = useSettingsStore();
  const aiConfig = resolveAiConfig(settings);
  const snapshot = useSessionStore((s) => s.snapshot);
  const messages = useCoachStore((s) => s.messages);
  const busy = useCoachStore((s) => s.busy);
  const userMessageCount = useCoachStore((s) => s.userMessageCount);
  const approxTokens = useCoachStore((s) => s.approxTokens);
  const send = useCoachStore((s) => s.send);
  const reset = useCoachStore((s) => s.reset);

  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [messages]);

  // Gate: the Coach is only available once a provider API key is configured.
  if (!aiConfig) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
        <div className="text-sm font-semibold text-zinc-200">AI Performance Coach</div>
        <p className="max-w-xs text-[12px] text-zinc-400">
          Add an API key (Claude or free Google Gemini) in <span className="text-brand">Settings → AI Provider</span> to
          chat with a coach that can see everything Perflex captured on this page.
        </p>
        <p className="max-w-xs text-[10px] text-zinc-600">
          Only an anonymized summary is sent — URLs are stripped to <code>site.com/path</code>, never page content.
        </p>
      </div>
    );
  }

  const atLimit = userMessageCount >= MAX_USER_MESSAGES;
  const showQuick = messages.length <= 1 && !busy;

  return (
    <div className="contain-content flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-zinc-800 px-3 py-1.5">
        <span className="text-[11px] font-semibold text-zinc-300">Performance Coach</span>
        <div className="flex items-center gap-2">
          <span className="text-[9px] text-zinc-600">
            {userMessageCount}/{MAX_USER_MESSAGES} · ~{approxTokens.toLocaleString()} tok
          </span>
          <button onClick={reset} className="rounded bg-zinc-800 px-2 py-0.5 text-[10px] text-zinc-400 hover:text-zinc-200">
            New
          </button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-auto p-2">
        {messages.map((m) => (
          <ChatMessage key={m.id} message={m} />
        ))}
        <div ref={endRef} />
      </div>

      {showQuick && (
        <div className="flex flex-wrap gap-1.5 px-2 pb-1">
          {QUICK_ACTIONS.map((q) => (
            <button
              key={q}
              onClick={() => send(q, snapshot)}
              className="rounded-full border border-zinc-700 px-2.5 py-1 text-[10px] text-zinc-300 hover:border-brand hover:text-zinc-100"
            >
              {q}
            </button>
          ))}
        </div>
      )}

      {atLimit ? (
        <div className="border-t border-zinc-800 p-2 text-center text-[10px] text-zinc-500">
          Message limit reached — start a <button onClick={reset} className="text-brand underline">new conversation</button>.
        </div>
      ) : (
        <ChatInput onSend={(t) => send(t, snapshot)} disabled={busy} />
      )}
    </div>
  );
}
