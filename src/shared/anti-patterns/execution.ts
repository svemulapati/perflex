import type { AnalysisInput, PerformanceFinding } from '../types';
import { makeFinding } from './base';

const KB = 1024;

export function executionMatchers(input: AnalysisInput): PerformanceFinding[] {
  const out: PerformanceFinding[] = [];

  // 7. Layout thrashing (concentrated within an interaction)
  const reflowTotal = input.reflows.length;
  const worstInteraction = input.interactions.reduce((m, i) => Math.max(m, i.forcedReflows.length), 0);
  if (reflowTotal > 0) {
    const critical = worstInteraction > 5;
    out.push(
      makeFinding('layout-thrashing', critical ? 'critical' : 'warning', {
        confidence: 0.8,
        description: critical
          ? `Up to ${worstInteraction} forced reflows within a single interaction — classic layout thrashing.`
          : `${reflowTotal} forced reflow(s) detected (interleaved DOM reads/writes).`,
        evidence: { stackFingerprint: input.reflows[0]?.fingerprint, sampleEntries: input.reflows.slice(0, 5) },
        impact: { frequency: reflowTotal, totalDuration: reflowTotal * 2, coreWebVitalAffected: 'INP' },
      })
    );
  }

  // 8. Long main-thread tasks
  const longTasks = input.timeline.longTasks.filter((t) => t.duration > 100);
  if (longTasks.length > 0) {
    const critical = longTasks.some((t) => t.duration > 250);
    out.push(
      makeFinding('long-main-thread-task', critical ? 'critical' : 'warning', {
        confidence: 0.9,
        description: `${longTasks.length} task(s) over 100ms blocked the main thread${critical ? ' (some over 250ms)' : ''}.`,
        evidence: { sampleEntries: longTasks.slice(0, 5) },
        impact: { frequency: longTasks.length, totalDuration: longTasks.reduce((s, t) => s + t.duration, 0), coreWebVitalAffected: 'INP' },
      })
    );
  }

  // 8b. Suspected memory leak — sustained heap growth over the session.
  const mem = input.memory;
  const mbPerMin = mem.growthRatePerMin / (1024 * 1024);
  if (mbPerMin > 5 && mem.sampleCount >= 4 && mem.spanMs >= 60_000) {
    out.push(
      makeFinding('suspected-memory-leak', 'warning', {
        confidence: 0.4,
        description: `JS heap grew ~${mbPerMin.toFixed(1)} MB/min over ${(mem.spanMs / 60000).toFixed(1)} min. This may indicate a leak — verify it isn't legitimate data loading.`,
        impact: { frequency: mem.sampleCount, totalDuration: 0, estimatedUserImpact: 'medium' },
      })
    );
  }

  // 9. Unthrottled high-frequency listeners
  const rt = input.runtime;
  if (rt && (rt.hiFreqScrollPerSec > 30 || rt.hiFreqMovePerSec > 60) && input.timeline.frames.length > 0) {
    const type = rt.hiFreqScrollPerSec > 30 ? 'scroll/resize' : 'pointer/touch move';
    out.push(
      makeFinding('unthrottled-listeners', 'warning', {
        confidence: 0.5,
        description: `High-frequency ${type} events firing with frame drops present — handlers may be unthrottled.`,
        impact: { frequency: Math.round(Math.max(rt.hiFreqScrollPerSec, rt.hiFreqMovePerSec)), totalDuration: 0 },
      })
    );
  }

  // 10. Synchronous XHR
  const syncXhr = input.network.filter((n) => n.api === 'xhr' && !n.async);
  if (syncXhr.length > 0) {
    out.push(
      makeFinding('synchronous-xhr', 'critical', {
        confidence: 0.95,
        description: `${syncXhr.length} synchronous XHR request(s) blocked the main thread until they completed.`,
        evidence: { sampleEntries: syncXhr.slice(0, 5) },
        impact: { frequency: syncXhr.length, totalDuration: syncXhr.reduce((s, n) => s + n.duration, 0) },
      })
    );
  }

  // 11. Large main-thread JSON parsing
  const bigParses = input.jsonParses.filter((p) => p.size > 50 * KB);
  if (bigParses.length > 0) {
    const critical = bigParses.some((p) => p.size > 200 * KB);
    out.push(
      makeFinding('large-json-parse', critical ? 'critical' : 'warning', {
        confidence: 0.85,
        description: `${bigParses.length} JSON.parse call(s) on large payloads (up to ${Math.round(Math.max(...bigParses.map((p) => p.size)) / KB)}KB) ran on the main thread.`,
        evidence: { stackFingerprint: bigParses[0].fingerprint, sampleEntries: bigParses.slice(0, 5) },
        impact: { frequency: bigParses.length, totalDuration: bigParses.reduce((s, p) => s + p.duration, 0) },
      })
    );
  }

  // 12. Expensive DOM queries
  const slowQueries = input.domQueries.filter((q) => q.duration > 1 || q.complexity > 3);
  if (slowQueries.length > 0) {
    out.push(
      makeFinding('expensive-dom-query', 'info', {
        confidence: 0.6,
        description: `${slowQueries.length} expensive DOM query(ies) detected (complex selectors or slow execution).`,
        evidence: { sampleEntries: slowQueries.slice(0, 5).map((q) => ({ selector: q.selector, duration: q.duration, results: q.resultCount })) },
        impact: { frequency: slowQueries.length, totalDuration: slowQueries.reduce((s, q) => s + q.duration, 0) },
      })
    );
  }

  // 13. Timer flooding
  if (input.timers.maxActive > 50) {
    out.push(
      makeFinding('timer-flooding', 'warning', {
        confidence: 0.7,
        description: `Up to ${input.timers.maxActive} timers were active simultaneously.`,
        impact: { frequency: input.timers.maxActive, totalDuration: 0 },
      })
    );
  }

  // 14. Recursive rAF chains
  if (input.timers.rafLongCount > 30) {
    out.push(
      makeFinding('recursive-raf', 'warning', {
        confidence: 0.6,
        description: `${input.timers.rafLongCount} requestAnimationFrame callbacks did >5ms of work — a heavy rAF loop.`,
        impact: { frequency: input.timers.rafLongCount, totalDuration: 0 },
      })
    );
  }

  // 15. Excessive console logging
  if (rt && rt.consolePerSec > 100) {
    out.push(
      makeFinding('excessive-console', 'info', {
        confidence: 0.8,
        description: `~${Math.round(rt.consolePerSec)} console calls/second — logging has measurable cost in production.`,
        impact: { frequency: Math.round(rt.consolePerSec), totalDuration: 0 },
      })
    );
  }

  return out;
}
