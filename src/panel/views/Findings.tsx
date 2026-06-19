import { useMemo, useState } from 'react';
import { useSessionStore } from '../stores/session-store';
import { FindingCard } from '../components/FindingCard';
import type { FindingCategory, Severity } from '@/shared/types';

type SortKey = 'impact' | 'severity' | 'category';

const IMPACT_RANK: Record<string, number> = { high: 0, medium: 1, low: 2 };
const SEVERITY_RANK: Record<Severity, number> = { critical: 0, warning: 1, info: 2 };
const CATEGORIES: FindingCategory[] = ['loading', 'execution', 'rendering', 'network', 'third-party'];

export function Findings() {
  const snapshot = useSessionStore((s) => s.snapshot);
  const [sortKey, setSortKey] = useState<SortKey>('impact');
  const [categoryFilter, setCategoryFilter] = useState<FindingCategory | 'all'>('all');
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  const findings = useMemo(() => {
    const all = (snapshot?.findings ?? []).filter((f) => !dismissed.has(f.id));
    const filtered = categoryFilter === 'all' ? all : all.filter((f) => f.category === categoryFilter);
    return [...filtered].sort((a, b) => {
      if (sortKey === 'severity') return SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
      if (sortKey === 'category') return a.category.localeCompare(b.category);
      return (
        IMPACT_RANK[a.impact.estimatedUserImpact] - IMPACT_RANK[b.impact.estimatedUserImpact] ||
        b.impact.totalDuration - a.impact.totalDuration
      );
    });
  }, [snapshot, dismissed, categoryFilter, sortKey]);

  const counts = useMemo(() => {
    const all = snapshot?.findings ?? [];
    return {
      critical: all.filter((f) => f.severity === 'critical').length,
      warning: all.filter((f) => f.severity === 'warning').length,
      info: all.filter((f) => f.severity === 'info').length,
    };
  }, [snapshot]);

  return (
    <div className="flex flex-col gap-3 p-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-zinc-200">Findings</h2>
        <div className="flex gap-2 text-[10px]">
          <span className="text-severity-critical">{counts.critical} critical</span>
          <span className="text-severity-warning">{counts.warning} warning</span>
          <span className="text-severity-info">{counts.info} info</span>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value as FindingCategory | 'all')}
          className="rounded bg-zinc-800 px-2 py-0.5 text-xs text-zinc-300 outline-none"
        >
          <option value="all">All categories</option>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <select
          value={sortKey}
          onChange={(e) => setSortKey(e.target.value as SortKey)}
          className="rounded bg-zinc-800 px-2 py-0.5 text-xs text-zinc-300 outline-none"
        >
          <option value="impact">Sort: Impact</option>
          <option value="severity">Sort: Severity</option>
          <option value="category">Sort: Category</option>
        </select>
        {dismissed.size > 0 && (
          <button onClick={() => setDismissed(new Set())} className="text-[11px] text-zinc-500 hover:text-zinc-300">
            Restore {dismissed.size} dismissed
          </button>
        )}
      </div>

      {findings.length === 0 ? (
        <div className="py-10 text-center text-sm text-zinc-500">
          No findings{categoryFilter !== 'all' ? ' in this category' : ''} yet. Interact with the page to
          surface performance issues.
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {findings.map((f) => (
            <FindingCard
              key={f.id}
              finding={f}
              onDismiss={() => setDismissed((d) => new Set(d).add(f.id))}
            />
          ))}
        </div>
      )}
    </div>
  );
}
