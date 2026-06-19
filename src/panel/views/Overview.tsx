import { useSessionStore } from '../stores/session-store';
import { HealthScore } from '../components/HealthScore';
import { MetricBadge } from '../components/MetricBadge';
import { Sparkline } from '../components/Sparkline';
import { CWV_THRESHOLDS } from '@/shared/constants';
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

  if (!snapshot) {
    return (
      <div className="p-6 text-center text-sm text-zinc-500">
        Waiting for performance data… interact with the page to begin profiling.
      </div>
    );
  }

  const v: CoreWebVitals = snapshot.vitals;
  const topOffenders = snapshot.scripts.filter((s) => s.metrics.totalMainThreadTime > 0).slice(0, 3);

  return (
    <div className="flex flex-col gap-4 p-3">
      <div className="flex items-center gap-4 rounded-lg border border-zinc-800 bg-zinc-900/40 p-3">
        <HealthScore score={snapshot.healthScore} />
        <div className="flex-1">
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
      </div>

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

      <section>
        <h3 className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
          Key Metrics
        </h3>
        <div className="grid grid-cols-2 gap-1.5">
          <MetricBadge label="Total Blocking" value={ms(snapshot.totalBlockingTime)} status={snapshot.totalBlockingTime > 300 ? 'poor' : snapshot.totalBlockingTime > 150 ? 'warn' : 'good'} />
          <MetricBadge label="JS Heap" value={bytes(snapshot.heapSize)} />
          <MetricBadge label="Requests" value={String(snapshot.networkRequestCount)} />
          <MetricBadge label="Frame Drops" value={`${(snapshot.frameDropRate * 100).toFixed(0)}%`} status={snapshot.frameDropRate > 0.2 ? 'poor' : snapshot.frameDropRate > 0.05 ? 'warn' : 'good'} />
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
        {snapshot.findings.length === 0 ? (
          <div className="text-[11px] text-zinc-500">No findings yet.</div>
        ) : (
          <div className="flex flex-col gap-1">
            {snapshot.findings.slice(0, 5).map((f) => (
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
