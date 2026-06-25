import { useState } from 'react';
import { useSessionStore } from '../stores/session-store';
import { ScriptLeaderboard } from '../components/ScriptLeaderboard';
import { ThirdParties } from './ThirdParties';

export function Scripts() {
  const snapshot = useSessionStore((s) => s.snapshot);
  const scripts = snapshot?.scripts ?? [];
  const [view, setView] = useState<'scripts' | 'thirdparty'>('scripts');

  return (
    <div className="contain-content flex flex-col">
      <div className="flex items-center gap-1 border-b border-zinc-800 px-3 py-2">
        {(['scripts', 'thirdparty'] as const).map((v) => (
          <button
            key={v}
            onClick={() => setView(v)}
            className={`rounded px-2.5 py-1 text-[11px] ${
              view === v ? 'bg-brand text-white' : 'bg-zinc-800 text-zinc-400 hover:text-zinc-200'
            }`}
          >
            {v === 'scripts' ? 'Scripts' : 'Third Parties'}
          </button>
        ))}
      </div>

      {view === 'scripts' ? (
        <div className="flex flex-col gap-3 p-3">
          <div className="flex items-baseline justify-between">
            <h2 className="text-sm font-semibold text-zinc-200">Script Leaderboard</h2>
            <span className="text-[11px] text-zinc-500">{scripts.length} scripts</span>
          </div>
          <ScriptLeaderboard scripts={scripts} />
        </div>
      ) : (
        <ThirdParties />
      )}
    </div>
  );
}
