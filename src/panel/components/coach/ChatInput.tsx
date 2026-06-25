import { useState } from 'react';

export function ChatInput({ onSend, disabled }: { onSend: (text: string) => void; disabled?: boolean }) {
  const [value, setValue] = useState('');

  const submit = () => {
    const t = value.trim();
    if (!t || disabled) return;
    onSend(t);
    setValue('');
  };

  return (
    <div className="flex items-end gap-1.5 border-t border-zinc-800 p-2">
      <textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            submit();
          }
        }}
        rows={1}
        placeholder={disabled ? 'Coach is thinking…' : 'Ask about this page…'}
        disabled={disabled}
        className="max-h-24 min-h-[32px] flex-1 resize-none rounded border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-[12px] outline-none focus:border-brand disabled:opacity-50"
      />
      <button
        onClick={submit}
        disabled={disabled || !value.trim()}
        className="rounded bg-brand px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-indigo-500 disabled:opacity-40"
      >
        Send
      </button>
    </div>
  );
}
