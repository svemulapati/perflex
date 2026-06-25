import { useState } from 'react';
import { useSessionStore } from '../../stores/session-store';
import { describeStep, type Flow } from '@/shared/flow';
import { ms } from '../../format';

/**
 * Manual replay guidance: step the user through the recorded flow, then compare
 * the current session's vitals against the flow's recorded baseline.
 */
export function FlowReplay({ flow }: { flow: Flow }) {
  const snapshot = useSessionStore((s) => s.snapshot);
  const [i, setI] = useState(0);
  const done = i >= flow.steps.length;

  return (
    <div className="mt-1.5 rounded border border-zinc-800 bg-zinc-950 p-2">
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
          Replay · {Math.min(i, flow.steps.length)}/{flow.steps.length}
        </span>
        {i > 0 && (
          <button onClick={() => setI(0)} className="text-[10px] text-zinc-500 hover:text-zinc-300">
            Restart
          </button>
        )}
      </div>

      {!done ? (
        <div className="flex flex-col gap-1.5">
          <ol className="flex flex-col gap-1">
            {flow.steps.map((step, idx) => (
              <li
                key={idx}
                className={`flex items-center gap-2 text-[11px] ${
                  idx < i ? 'text-zinc-600 line-through' : idx === i ? 'text-zinc-100' : 'text-zinc-500'
                }`}
              >
                <span
                  className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[8px] ${
                    idx < i ? 'bg-severity-success/30 text-severity-success' : idx === i ? 'bg-brand text-white' : 'bg-zinc-800'
                  }`}
                >
                  {idx < i ? '✓' : idx + 1}
                </span>
                <span className="truncate" title={step.selector}>
                  {describeStep(step)}
                </span>
              </li>
            ))}
          </ol>
          <button
            onClick={() => setI((n) => n + 1)}
            className="mt-1 self-start rounded bg-brand px-2 py-1 text-[11px] font-semibold text-white hover:bg-indigo-500"
          >
            ✓ Did it — next step
          </button>
        </div>
      ) : (
        <ReplayResult flow={flow} snapshot={snapshot} />
      )}
    </div>
  );
}

function ReplayResult({ flow, snapshot }: { flow: Flow; snapshot: ReturnType<typeof useSessionStore.getState>['snapshot'] }) {
  if (!flow.baseline) {
    return <div className="text-[11px] text-zinc-500">Flow complete. No baseline was recorded for comparison.</div>;
  }
  if (!snapshot) {
    return <div className="text-[11px] text-zinc-500">Flow complete — interact with the page to capture results for comparison.</div>;
  }
  const b = flow.baseline;
  const rows: { label: string; base: number | null; cur: number | null; fmt: (n: number) => string }[] = [
    { label: 'Health', base: b.healthScore, cur: snapshot.healthScore, fmt: (n) => String(Math.round(n)) },
    { label: 'LCP', base: b.lcp, cur: snapshot.vitals.lcp, fmt: ms },
    { label: 'INP', base: b.inp, cur: snapshot.vitals.inp, fmt: ms },
    { label: 'CLS', base: b.cls, cur: snapshot.vitals.cls, fmt: (n) => n.toFixed(3) },
    { label: 'TBT', base: b.totalBlockingTime, cur: snapshot.totalBlockingTime, fmt: ms },
  ];
  // For Health, higher is better; for the rest, lower is better.
  const betterWhenLower = (label: string) => label !== 'Health';

  return (
    <div className="flex flex-col gap-1">
      <div className="text-[11px] font-semibold text-zinc-200">Flow complete — vs. recorded baseline</div>
      {rows.map((r) => {
        if (r.base === null || r.cur === null) return null;
        const delta = r.cur - r.base;
        const improved = betterWhenLower(r.label) ? delta < 0 : delta > 0;
        const flat = Math.abs(delta) < (r.label === 'CLS' ? 0.001 : 0.5);
        const color = flat ? 'text-zinc-400' : improved ? 'text-severity-success' : 'text-severity-critical';
        return (
          <div key={r.label} className="flex items-center justify-between text-[11px]">
            <span className="text-zinc-500">{r.label}</span>
            <span className="font-mono text-zinc-300">
              {r.fmt(r.base)} → {r.fmt(r.cur)}{' '}
              <span className={color}>
                ({delta > 0 ? '+' : ''}
                {r.label === 'CLS' ? delta.toFixed(3) : Math.round(delta)})
              </span>
            </span>
          </div>
        );
      })}
    </div>
  );
}
