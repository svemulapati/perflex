import type { CoachMessage } from '../../stores/coach-store';
import { MarkdownRenderer } from './MarkdownRenderer';

export function ChatMessage({ message }: { message: CoachMessage }) {
  const isUser = message.role === 'user';
  const tone = isUser
    ? 'bg-brand text-white'
    : message.error
      ? 'bg-severity-critical/15 text-severity-critical'
      : 'bg-zinc-800 text-zinc-200';

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div className={`max-w-[85%] rounded-lg px-3 py-2 ${tone}`}>
        {isUser || message.error ? (
          <span className="whitespace-pre-wrap text-[12px] leading-relaxed">{message.content}</span>
        ) : message.content ? (
          <MarkdownRenderer text={message.content} />
        ) : (
          <TypingDots />
        )}
      </div>
    </div>
  );
}

function TypingDots() {
  return (
    <span className="flex items-center gap-1 py-1" aria-label="Coach is typing">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="h-1.5 w-1.5 animate-bounce rounded-full bg-zinc-500"
          style={{ animationDelay: `${i * 0.15}s` }}
        />
      ))}
    </span>
  );
}
