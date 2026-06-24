import { useDeferredValue } from 'react';
import { useSessionStore } from '../stores/session-store';
import { HealthScore } from '../components/HealthScore';
import { MetricBadge } from '../components/MetricBadge';
import { Sparkline } from '../components/Sparkline';
import { LighthouseGauge } from '../components/lighthouse/LighthouseGauge';
import { WhatIfSimulator } from '../components/lighthouse/WhatIfSimulator';
import { CWV_THRESHOLDS } from '@/shared/constants';
import { estimateSpeedIndex, scorePerformance, type LighthouseMetrics } from '@/shared/lighthouse-scoring';
import { bytes, ms, shortUrl } from '../format';
import type { CoreWebVitals } from '@/shared/types';

type Status = 'good' | 'warn' | 'poor' | 'neutral';

function vitalStatus(value: number | null, good: number, poor: number): Status {
  if (value === null) return 'neutral';
  if (value <= good) return 'good';
  if (value >= poor) return 'poor';
  return 'warn';
}

export function Overview() {
  const snapshot = useSessionStore((s) => s.snapshot);
  const meta = useSessionStore((s) => s.meta);
  // Deferred copy for the heavier secondary sections. Called before any early
  // return so the hook order stays stable.
  const deferred = useDeferredValue(snapshot);

  if (!snapshot) {
    return (
      <div className="p-6 text-center text-sm text-zinc-500">
        Waiting for performance data… interact with the page to begin profiling.
      </div>
    );
  }

  const v: CoreWebVitals = snapshot.vitals;
  // Let the health score + Core Web Vitals (critical) paint first; the heavier
  // secondary sections read a deferred snapshot so they can't block them (B.3).
  const secondary = deferred ?? snapshot;
  const topOffenders = secondary.scripts.filter((s) => s.metrics.totalMainThreadTime > 0).slice(0, 3);

  // Local Lighthouse v11 estimate (Feature 7). Computed from the deferred
  // snapshot so it can't jitter ahead of the critical metrics.
  const lhMetrics: LighthouseMetrics = {
    fcp: secondary.vitals.fcp,
    si: estimateSpeedIndex(secondary.vitals.fcp, secondary.totalBlockingTime),
    lcp: secondary.vitals.lcp,
    tbt: secondary.totalBlockingTime,
    cls: secondary.vitals.cls,
  };
  const lhEstimate = scorePerformance(lhMetrics);

  return (
    <div className="contain-content flex flex-col gap-4 p-3">
      <div className="flex items-center gap-3 rounded-lg border border-zinc-800 bg-zinc-900/40 p-3">
        <HealthScore score={snapshot.healthScore} />
        <div className="min-w-0 flex-1">
          <div className="text-xs uppercase tracking-wide text-zinc-500">Session Health</div>
          <div className="mt-1 grid grid-cols-2 gap-1.5">
            <MetricBadge label="FPS" value={String(meta.fps)} status={meta.fps >= 55 ? 'good' : meta.fps >= 30 ? 'warn' : 'poor'} />
            <MetricBadge
              label="Frame Health"
              value={`${meta.frameHealth}%`}
              status={meta.frameHealth >= 90 ? 'good' : meta.frameHealth >= 70 ? 'warn' : 'poor'}
            />
          </div>
        </div>
        <div
          className="flex shrink-0 flex-col items-center"
          title="Estimated from Perflex's measurements. Run Lighthouse for the official score."
        >
          <LighthouseGauge score={lhEstimate.score} />
        </div>
      </div>

      {snapshot.frameworks.length > 0 && (
        <section>
          <h3 className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
            Detected Frameworks
          </h3>
          <div className="flex flex-wrap gap-1.5">
            {snapshot.frameworks.map((f) => (
              <span
                key={f.name}
                className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
                  f.devBuild
                    ? 'bg-severity-critical/20 text-severity-critical'
                    : 'bg-zinc-800 text-zinc-300'
                }`}
                title={f.devBuild ? 'Development build detected' : undefined}
              >
                {f.name}
                {f.version ? ` ${f.version}` : ''}
                {f.devBuild ? ' · DEV' : ''}
              </span>
            ))}
          </div>
        </section>
      )}

      <section>
        <h3 className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
          Core Web Vitals
        </h3>
        <div className="grid grid-cols-3 gap-1.5">
          <MetricBadge label="LCP" value={ms(v.lcp)} status={vitalStatus(v.lcp, CWV_THRESHOLDS.lcp.good, CWV_THRESHOLDS.lcp.poor)} />
          <MetricBadge label="INP" value={ms(v.inp)} status={vitalStatus(v.inp, CWV_THRESHOLDS.inp.good, CWV_THRESHOLDS.inp.poor)} />
          <MetricBadge
            label="CLS"
            value={v.cls.toFixed(3)}
            status={vitalStatus(v.cls, CWV_THRESHOLDS.cls.good, CWV_THRESHOLDS.cls.poor)}
          />
        </div>
      </section>

      {lhEstimate.score !== null && secondary.findings.length > 0 && (
        <section>
          <h3 className="mb-1.5 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
            What If — Lighthouse Impact
            <span
              className="cursor-help text-zinc-600"
              title="Estimated score gains if you resolve each finding. Approximate — run Lighthouse for the official score."
            >
              ⓘ
            </span>
          </h3>
          <WhatIfSimulator metrics={lhMetrics} baseScore={lhEstimate.score} findings={secondary.findings} />
        </section>
      )}

      <section>
        <h3 className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
          Key Metrics
        </h3>
        <div className="grid grid-cols-2 gap-1.5">
          <MetricBadge label="Total Blocking" value={ms(secondary.totalBlockingTime)} status={secondary.totalBlockingTime > 300 ? 'poor' : secondary.totalBlockingTime > 150 ? 'warn' : 'good'} />
          <MetricBadge label="JS Heap" value={bytes(secondary.heapSize)} />
          <MetricBadge label="Requests" value={String(secondary.networkRequestCount)} />
          <MetricBadge label="Frame Drops" value={`${(secondary.frameDropRate * 100).toFixed(0)}%`} status={secondary.frameDropRate > 0.2 ? 'poor' : secondary.frameDropRate > 0.05 ? 'warn' : 'good'} />
        </div>
      </section>

      <section>
        <h3 className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
          Top Offenders
        </h3>
        {topOffenders.length === 0 ? (
          <div className="text-[11px] text-zinc-500">No main-thread offenders detected yet.</div>
        ) : (
          <div className="flex flex-col gap-1">
            {topOffenders.map((s) => (
              <div
                key={s.url}
                className="flex items-center justify-between rounded border border-zinc-800 bg-zinc-900/40 px-2 py-1.5"
              >
                <span className="truncate font-mono text-[11px] text-zinc-200" title={s.url}>
                  {shortUrl(s.url)}
                </span>
                <div className="flex items-center gap-2">
                  <Sparkline data={s.timeSeries} width={60} height={16} />
                  <span className="font-mono text-[11px] text-zinc-300">
                    {ms(s.metrics.totalMainThreadTime)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <h3 className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
          Recent Findings
        </h3>
        {secondary.findings.length === 0 ? (
          <div className="text-[11px] text-zinc-500">No findings yet.</div>
        ) : (
          <div className="flex flex-col gap-1">
            {secondary.findings.slice(0, 5).map((f) => (
              <div
                key={f.id}
                className="flex items-center gap-2 rounded border border-zinc-800 bg-zinc-900/40 px-2 py-1.5"
              >
                <span
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{
                    background:
                      f.severity === 'critical' ? '#EF4444' : f.severity === 'warning' ? '#F59E0B' : '#3B82F6',
                  }}
                />
                <span className="truncate text-[11px] text-zinc-200">{f.patternName}</span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
