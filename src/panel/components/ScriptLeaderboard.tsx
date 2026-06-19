import { useMemo, useState } from 'react';
import type { ScriptProfile } from '@/shared/types';
import { bytes, ms, originOf, shortUrl } from '../format';
import { Sparkline } from './Sparkline';

type SortKey =
  | 'totalMainThreadTime'
  | 'longTaskCount'
  | 'totalTransferSize'
  | 'networkRequestCount'
  | 'layoutShiftContribution'
  | 'memoryGrowthRate';

type PartyFilter = 'all' | 'first' | 'third';

const SORT_LABELS: Record<SortKey, string> = {
  totalMainThreadTime: 'Main-thread',
  longTaskCount: 'Long tasks',
  totalTransferSize: 'Transfer',
  networkRequestCount: 'Requests',
  layoutShiftContribution: 'CLS',
  memoryGrowthRate: 'Mem growth',
};

const CLASSIFICATION_BADGE: Record<string, { label: string; cls: string }> = {
  'first-party': { label: '1P', cls: 'bg-indigo-500/20 text-indigo-300' },
  'third-party-known': { label: '3P', cls: 'bg-amber-500/20 text-amber-300' },
  'third-party-unknown': { label: '3P?', cls: 'bg-rose-500/20 text-rose-300' },
  inline: { label: 'inline', cls: 'bg-zinc-600/30 text-zinc-300' },
};

/** Color a row by how much main-thread time it consumes. */
function rowSeverity(timeMs: number): string {
  if (timeMs >= 250) return 'border-l-2 border-l-severity-critical';
  if (timeMs >= 80) return 'border-l-2 border-l-severity-warning';
  if (timeMs > 0) return 'border-l-2 border-l-severity-success';
  return 'border-l-2 border-l-transparent';
}

export function ScriptLeaderboard({ scripts }: { scripts: ScriptProfile[] }) {
  const [sortKey, setSortKey] = useState<SortKey>('totalMainThreadTime');
  const [filter, setFilter] = useState<PartyFilter>('all');
  const [expanded, setExpanded] = useState<string | null>(null);

  const rows = useMemo(() => {
    const filtered = scripts.filter((s) => {
      if (filter === 'first') return s.classification === 'first-party';
      if (filter === 'third')
        return s.classification === 'third-party-known' || s.classification === 'third-party-unknown';
      return true;
    });
    return [...filtered].sort((a, b) => b.metrics[sortKey] - a.metrics[sortKey]);
  }, [scripts, sortKey, filter]);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-1 text-xs">
          {(['all', 'first', 'third'] as PartyFilter[]).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`rounded px-2 py-0.5 ${
                filter === f ? 'bg-brand text-white' : 'bg-zinc-800 text-zinc-400 hover:text-zinc-200'
              }`}
            >
              {f === 'all' ? 'All' : f === 'first' ? 'First-party' : 'Third-party'}
            </button>
          ))}
        </div>
        <select
          value={sortKey}
          onChange={(e) => setSortKey(e.target.value as SortKey)}
          className="rounded bg-zinc-800 px-2 py-0.5 text-xs text-zinc-300 outline-none"
        >
          {Object.entries(SORT_LABELS).map(([k, label]) => (
            <option key={k} value={k}>
              Sort: {label}
            </option>
          ))}
        </select>
      </div>

      {rows.length === 0 ? (
        <div className="py-8 text-center text-sm text-zinc-500">
          No scripts captured yet. Interact with the page to generate activity.
        </div>
      ) : (
        <div className="overflow-hidden rounded-md border border-zinc-800">
          <table className="w-full border-collapse text-left text-xs">
            <thead className="bg-zinc-900 text-[10px] uppercase tracking-wide text-zinc-500">
              <tr>
                <th className="px-2 py-1.5 font-medium">Script</th>
                <th className="px-2 py-1.5 text-right font-medium">Main</th>
                <th className="px-2 py-1.5 text-right font-medium">Tasks</th>
                <th className="px-2 py-1.5 text-right font-medium">Size</th>
                <th className="hidden px-2 py-1.5 sm:table-cell">Trend</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((s) => {
                const isOpen = expanded === s.url;
                const badge = CLASSIFICATION_BADGE[s.classification];
                return (
                  <FragmentRow
                    key={s.url}
                    script={s}
                    isOpen={isOpen}
                    badge={badge}
                    onToggle={() => setExpanded(isOpen ? null : s.url)}
                  />
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function FragmentRow({
  script: s,
  isOpen,
  badge,
  onToggle,
}: {
  script: ScriptProfile;
  isOpen: boolean;
  badge: { label: string; cls: string };
  onToggle: () => void;
}) {
  return (
    <>
      <tr
        onClick={onToggle}
        className={`cursor-pointer bg-zinc-950 hover:bg-zinc-900 ${rowSeverity(s.metrics.totalMainThreadTime)}`}
      >
        <td className="max-w-0 px-2 py-1.5">
          <div className="flex items-center gap-1.5">
            <span className={`shrink-0 rounded px-1 text-[9px] font-bold ${badge.cls}`}>
              {badge.label}
            </span>
            <span className="truncate font-mono text-zinc-200" title={s.url}>
              {shortUrl(s.url)}
            </span>
          </div>
          <div className="truncate text-[10px] text-zinc-500">
            {originOf(s.url)}
            {s.category ? ` · ${s.category}` : ''}
          </div>
        </td>
        <td className="px-2 py-1.5 text-right font-mono text-zinc-200">
          {ms(s.metrics.totalMainThreadTime)}
        </td>
        <td className="px-2 py-1.5 text-right font-mono text-zinc-300">{s.metrics.longTaskCount}</td>
        <td className="px-2 py-1.5 text-right font-mono text-zinc-300">
          {bytes(s.metrics.totalTransferSize)}
        </td>
        <td className="hidden px-2 py-1.5 sm:table-cell">
          <Sparkline data={s.timeSeries} />
        </td>
      </tr>
      {isOpen && (
        <tr className="bg-zinc-900/60">
          <td colSpan={5} className="px-3 py-2">
            <ExpandedDetail script={s} />
          </td>
        </tr>
      )}
    </>
  );
}

function ExpandedDetail({ script: s }: { script: ScriptProfile }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[11px] sm:grid-cols-3">
        <Detail label="Avg long task" value={ms(s.metrics.averageLongTaskDuration)} />
        <Detail label="Max long task" value={ms(s.metrics.maxLongTaskDuration)} />
        <Detail label="Network time" value={ms(s.metrics.totalNetworkTime)} />
        <Detail label="Requests" value={String(s.metrics.networkRequestCount)} />
        <Detail label="Est. compile" value={ms(s.metrics.estimatedCompileTime)} />
        <Detail label="Forced reflows" value={String(s.metrics.forcedReflowCount)} />
      </div>

      <div>
        <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
          Hot functions
        </div>
        {s.hotFunctions.length === 0 ? (
          <div className="text-[11px] text-zinc-500">
            No function-level data (requires Long Animation Frames API).
          </div>
        ) : (
          <table className="w-full text-[11px]">
            <tbody>
              {s.hotFunctions.map((fn) => (
                <tr key={`${fn.functionName}@${fn.charPosition}`} className="border-t border-zinc-800/60">
                  <td className="py-1 font-mono text-zinc-200">
                    {fn.functionName || '(anonymous)'}
                    {fn.charPosition >= 0 && (
                      <span className="text-zinc-500"> :{fn.charPosition}</span>
                    )}
                  </td>
                  <td className="py-1 text-right font-mono text-zinc-300">{ms(fn.totalDuration)}</td>
                  <td className="py-1 text-right text-zinc-500">×{fn.invocationCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-2">
      <span className="text-zinc-500">{label}</span>
      <span className="font-mono text-zinc-200">{value}</span>
    </div>
  );
}
