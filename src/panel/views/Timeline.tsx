import { useState } from 'react';
import { useSessionStore } from '../stores/session-store';
import { SessionTimeline } from '../components/SessionTimeline';
import { ms, scoreColor } from '../format';
import type { CausalStep } from '@/shared/types';

const STEP_COLOR: Record<CausalStep['kind'], string> = {
  trigger: '#6366F1',
  longtask: '#EF4444',
  network: '#F59E0B',
  mutation: '#14B8A6',
  'layout-shift': '#F59E0B',
  reflow: '#EF4444',
  paint: '#10B981',
};

export function Timeline() {
  const snapshot = useSessionStore((s) => s.snapshot);
  const [selected, setSelected] = useState<string | null>(null);

  if (!snapshot) {
    return <div className="p-6 text-center text-sm text-zinc-500">Waiting for data…</div>;
  }

  const session = snapshot.interactions.find((i) => i.id === selected) ?? null;

  return (
    <div className="flex flex-col gap-3 p-3">
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm font-semibold text-zinc-200">Session Timeline</h2>
        <span className="text-[11px] text-zinc-500">{snapshot.interactions.length} interactions</span>
      </div>

      <SessionTimeline
        timeline={snapshot.timeline}
        selectedInteraction={selected}
        onSelectInteraction={setSelected}
      />

      {session ? (
        <div className="rounded-md border border-zinc-800 bg-zinc-900/40 p-3">
          <div className="mb-2 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span
                className="inline-block h-2.5 w-2.5 rounded-full"
                style={{ background: scoreColor(session.health) }}
              />
              <span className="font-mono text-xs text-zinc-200">
                {session.trigger.type} → {session.trigger.target}
              </span>
              {session.inProgress && (
                <span className="rounded bg-severity-info/20 px-1 text-[9px] text-severity-info">LIVE</span>
              )}
            </div>
            <button onClick={() => setSelected(null)} className="text-[11px] text-zinc-500 hover:text-zinc-300">
              Close
            </button>
          </div>

          <div className="mb-3 grid grid-cols-3 gap-2 text-[11px]">
            <Metric label="Duration" value={ms(session.duration)} />
            <Metric label="Blocking" value={ms(session.metrics.totalBlockingTime)} />
            <Metric label="INP" value={ms(session.metrics.interactionToNextPaint)} />
            <Metric label="Network" value={ms(session.metrics.totalNetworkTime)} />
            <Metric label="DOM Δ" value={String(session.metrics.totalDOMMutations)} />
            <Metric label="CLS" value={session.metrics.cumulativeLayoutShift.toFixed(3)} />
          </div>

          <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
            Causal chain
          </div>
          <ol className="relative ml-1 border-l border-zinc-700">
            {session.causalChain.map((step, i) => (
              <li key={i} className="relative pl-3 pb-1.5">
                <span
                  className="absolute -left-[5px] top-1 h-2 w-2 rounded-full"
                  style={{ background: STEP_COLOR[step.kind] }}
                />
                <div className="flex items-baseline justify-between gap-2">
                  <span className="font-mono text-[11px] text-zinc-200">{step.label}</span>
                  <span className="shrink-0 font-mono text-[10px] text-zinc-500">
                    +{ms(step.offset)}
                    {step.duration !== undefined ? ` · ${ms(step.duration)}` : ''}
                  </span>
                </div>
              </li>
            ))}
          </ol>
        </div>
      ) : (
        <div className="text-[11px] text-zinc-500">
          Click an interaction block (top lane) to inspect its causal chain.
        </div>
      )}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-zinc-800 bg-zinc-950 px-2 py-1">
      <div className="text-[9px] uppercase tracking-wide text-zinc-500">{label}</div>
      <div className="font-mono text-zinc-200">{value}</div>
    </div>
  );
}
