import { useMemo } from 'react';
import type { PerformanceFinding } from '@/shared/types';
import { rankOpportunities, type LighthouseMetrics } from '@/shared/lighthouse-scoring';

interface WhatIfSimulatorProps {
  metrics: LighthouseMetrics;
  baseScore: number;
  findings: PerformanceFinding[];
}

/**
 * "What If" — for each fixable finding, estimate the Lighthouse-score gain from
 * resolving it, plus the projected score if everything were fixed. Estimates,
 * not promises.
 */
export function WhatIfSimulator({ metrics, baseScore, findings }: WhatIfSimulatorProps) {
  const { items, fixAllScore } = useMemo(() => {
    const { ranked, fixAllScore } = rankOpportunities(
      metrics,
      baseScore,
      findings.map((f) => ({
        coreWebVitalAffected: f.impact.coreWebVitalAffected,
        category: f.category,
        totalDuration: f.impact.totalDuration,
        finding: f,
      }))
    );
    return { items: ranked.slice(0, 5), fixAllScore };
  }, [metrics, baseScore, findings]);

  if (items.length === 0) {
    return <div className="text-[11px] text-zinc-500">No findings with an estimable score impact.</div>;
  }

  return (
    <div className="flex flex-col gap-1">
      {items.map(({ item, delta }) => {
        const finding = item.finding;
        return (
        <div
          key={finding.id}
          className="flex items-center justify-between gap-2 rounded border border-zinc-800 bg-zinc-900/40 px-2 py-1.5"
        >
          <span className="truncate text-[11px] text-zinc-300" title={finding.patternName}>
            Fix {finding.patternName}
          </span>
          <span className="shrink-0 font-mono text-[11px] font-semibold text-severity-success">
            +{delta}
          </span>
        </div>
        );
      })}
      {fixAllScore > baseScore && (
        <div className="mt-0.5 flex items-center justify-between gap-2 rounded bg-brand/10 px-2 py-1.5">
          <span className="text-[11px] font-semibold text-zinc-200">Fix all</span>
          <span className="font-mono text-[11px] font-semibold text-indigo-300">→ {fixAllScore}</span>
        </div>
      )}
    </div>
  );
}
