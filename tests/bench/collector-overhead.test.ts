/**
 * Collector overhead benchmark (spec Part B testing requirement: <0.3ms/sec).
 *
 * Scope, stated honestly: this measures the JS hot paths Perflex *controls* and
 * changed in Phase 2 — the emit/dispatch path and stack fingerprinting. It does
 * NOT measure real DOM-geometry interception or PerformanceObserver cost, which
 * need a live browser. Those are dominated by the page's own work; the cache
 * here is the lever we have over them.
 *
 * It asserts a generous ceiling (so it won't flake on a loaded CI box) and logs
 * the real numbers for the record.
 */
import { describe, expect, it } from 'vitest';
import { CollectorContext } from '../../src/content/collector/context';
import { fingerprintStack, __resetStackCache } from '../../src/shared/hash';
import type { CollectorEvent } from '../../src/shared/types';

/** A representative "busy second" of page activity (~250 events). */
function busySecond(): CollectorEvent[] {
  const out: CollectorEvent[] = [];
  let t = 0;
  const push = (e: Record<string, unknown>) => out.push({ seq: 0, timestamp: (t += 0.7), ...e } as CollectorEvent);
  for (let i = 0; i < 60; i++) push({ kind: 'frame', frameDuration: 24, overrun: 7 });
  for (let i = 0; i < 40; i++) push({ kind: 'timer', api: 'setTimeout', callbackDuration: 2, requestedDelay: 0, actualDelay: 1, activeCount: 3 });
  for (let i = 0; i < 20; i++) push({ kind: 'network', url: `https://api.site.com/r/${i}`, method: 'GET', transport: 'fetch', async: true, requestBodySize: 0, responseStatus: 200, responseSize: 1024, duration: 30, startTime: t });
  for (let i = 0; i < 30; i++) push({ kind: 'mutation', addedNodes: 2, removedNodes: 1, attributeChanges: 3, targetDepth: 8 });
  for (let i = 0; i < 50; i++) push({ kind: 'reflow', property: 'offsetWidth', precedingWrite: 'style.left' });
  for (let i = 0; i < 50; i++) push({ kind: 'dom-query', selector: '.row', complexity: 2, duration: 0.2, resultCount: 12 });
  push({ kind: 'interaction', interactionId: 'i1', inputType: 'click', target: 'button' });
  return out;
}

describe('collector overhead benchmark', () => {
  it('emit/dispatch path stays far under the 0.3ms/sec budget', () => {
    const workload = busySecond();
    // Sink mirrors main-world: batch + the overlay liveStats taps.
    let batch: CollectorEvent[] = [];
    const liveStats = { longTasks: 0, heapMB: 0, reqTimes: [] as number[] };
    const ctx = new CollectorContext((event) => {
      batch.push(event);
      if (event.kind === 'longtask') liveStats.longTasks++;
      else if (event.kind === 'memory') liveStats.heapMB = (event as { usedJSHeapSize: number }).usedJSHeapSize / 1_048_576;
      else if (event.kind === 'network') liveStats.reqTimes.push(event.timestamp);
      if (event.kind === 'interaction' || batch.length >= 2000) batch = [];
    });

    const ITER = 300;
    const start = performance.now();
    for (let i = 0; i < ITER; i++) for (const e of workload) ctx.emit({ ...e });
    const msPerSecond = (performance.now() - start) / ITER;

    // eslint-disable-next-line no-console
    console.log(`[bench] emit path: ${msPerSecond.toFixed(4)} ms per simulated second of activity (${workload.length} events/sec)`);
    expect(msPerSecond).toBeLessThan(0.3);
  });

  it('fingerprint cache makes repeated call sites cheaper (validates batch-1 LRU)', () => {
    const stacks = Array.from({ length: 20 }, (_, i) => `Error\n  at fn${i} (mod${i}.js:${i})\n  at caller (app.js:${i})`);
    const N = 20_000;

    __resetStackCache();
    let s = performance.now();
    for (let i = 0; i < N; i++) {
      __resetStackCache(); // force a miss every call
      fingerprintStack(stacks[i % stacks.length]);
    }
    const uncachedMs = performance.now() - s;

    __resetStackCache();
    s = performance.now();
    for (let i = 0; i < N; i++) fingerprintStack(stacks[i % stacks.length]); // warm cache → hits
    const cachedMs = performance.now() - s;

    // eslint-disable-next-line no-console
    console.log(`[bench] fingerprintStack ${N}x — uncached ${uncachedMs.toFixed(2)}ms vs cached ${cachedMs.toFixed(2)}ms (${(uncachedMs / Math.max(cachedMs, 0.0001)).toFixed(1)}x)`);
    expect(cachedMs).toBeLessThanOrEqual(uncachedMs);
  });
});
