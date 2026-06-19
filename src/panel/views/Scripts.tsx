import { useSessionStore } from '../stores/session-store';
import { ScriptLeaderboard } from '../components/ScriptLeaderboard';

export function Scripts() {
  const snapshot = useSessionStore((s) => s.snapshot);
  const scripts = snapshot?.scripts ?? [];

  return (
    <div className="flex flex-col gap-3 p-3">
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm font-semibold text-zinc-200">Script Leaderboard</h2>
        <span className="text-[11px] text-zinc-500">{scripts.length} scripts</span>
      </div>
      <ScriptLeaderboard scripts={scripts} />
    </div>
  );
}
