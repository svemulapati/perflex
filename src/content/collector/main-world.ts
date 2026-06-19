/**
 * Perflex collector — runs in the page's MAIN world so it can intercept the
 * page's own globals. It NEVER touches chrome.* (no access here). Events are
 * batched and posted to the isolated-world bridge via window.postMessage.
 */
import type { CollectorEvent } from '@/shared/types';
import { BATCH_FLUSH_INTERVAL } from '@/shared/constants';
import { CollectorContext } from './context';
import { CircuitBreaker, type ThrottleLevel } from './circuit-breaker';
import { setupPerformanceObservers } from './performance-observers';
import { setupNetworkInterceptor } from './network-interceptor';
import { setupTimerInterceptor } from './timer-interceptor';
import { setupLayoutThrashDetector } from './layout-thrash-detector';
import { setupDomMutationTracker } from './dom-mutation-tracker';
import { setupFrameBudgetTracker } from './frame-budget-tracker';
import { setupMemoryMonitor } from './memory-monitor';
import { setupInteractionTracker } from './interaction-tracker';
import { setupRuntimeHooks } from './runtime-hooks';
import { setupOverlay } from '../overlay/overlay';

export const PERFLEX_MESSAGE_SOURCE = 'perflex-collector';

interface CollectorMessage {
  source: typeof PERFLEX_MESSAGE_SOURCE;
  kind: 'events' | 'meta';
  events?: CollectorEvent[];
  throttleLevel?: ThrottleLevel;
  fps?: number;
  frameHealth?: number;
}

// Guard against double-injection (e.g. bfcache restores).
const w = window as unknown as { __perflexCollectorActive?: boolean };
if (!w.__perflexCollectorActive) {
  w.__perflexCollectorActive = true;
  start();
}

function start(): void {
  let batch: CollectorEvent[] = [];

  const breaker = new CircuitBreaker((level) => {
    post({ source: PERFLEX_MESSAGE_SOURCE, kind: 'meta', throttleLevel: level });
  });

  // Live stats for the in-page overlay.
  const liveStats = { longTasks: 0, heapMB: 0, reqTimes: [] as number[] };

  const ctx = new CollectorContext((event) => {
    batch.push(event);
    // Tap the stream for the overlay's live counters.
    if (event.kind === 'longtask') liveStats.longTasks++;
    else if (event.kind === 'memory') liveStats.heapMB = event.usedJSHeapSize / 1_048_576;
    else if (event.kind === 'network') liveStats.reqTimes.push(event.timestamp);
    // Hard cap a single batch so a burst can't blow memory before flush.
    if (batch.length >= 2000) flush();
  }, breaker);

  const post = (msg: CollectorMessage) => {
    try {
      window.postMessage(msg, '*');
    } catch {
      /* structured-clone failure — drop batch */
    }
  };

  const flush = () => {
    if (batch.length === 0) return;
    const events = batch;
    batch = [];
    post({ source: PERFLEX_MESSAGE_SOURCE, kind: 'events', events });
  };

  // Bring up every collector with error isolation around each setup.
  const teardown: Array<() => void> = [];
  const safeSetup = (name: string, fn: () => () => void) => {
    try {
      teardown.push(fn());
    } catch (err) {
      console.warn(`[Perflex] collector "${name}" failed to start`, err);
    }
  };

  safeSetup('performance-observers', () => setupPerformanceObservers(ctx));
  safeSetup('network', () => setupNetworkInterceptor(ctx));
  safeSetup('timer', () => setupTimerInterceptor(ctx));
  safeSetup('layout-thrash', () => setupLayoutThrashDetector(ctx));
  safeSetup('dom-mutation', () => setupDomMutationTracker(ctx));
  safeSetup('interaction', () => setupInteractionTracker(ctx));
  safeSetup('memory', () => setupMemoryMonitor(ctx));
  safeSetup('runtime-hooks', () => setupRuntimeHooks(ctx));

  const frameTracker = setupFrameBudgetTracker(ctx);
  teardown.push(frameTracker.stop);

  // In-page overlay (Shadow DOM). Hidden until toggled via Ctrl+Shift+X, which
  // the background relays to the isolated bridge → window 'perflex-control'.
  const overlay = setupOverlay(() => {
    const now = performance.now();
    while (liveStats.reqTimes.length && liveStats.reqTimes[0] < now - 1000) liveStats.reqTimes.shift();
    return {
      fps: frameTracker.getFps(),
      frameHealth: frameTracker.getFrameHealth(),
      throttle: breaker.throttleLevel,
      heapMB: liveStats.heapMB,
      longTasks: liveStats.longTasks,
      activeRequests: liveStats.reqTimes.length,
    };
  });
  teardown.push(overlay.destroy);

  window.addEventListener('message', (e: MessageEvent) => {
    if (e.source !== window) return;
    const data = e.data as { source?: string; action?: string } | undefined;
    if (data?.source === 'perflex-control' && data.action === 'toggle-overlay') overlay.toggle();
  });

  // Periodic flush + live meta (fps / frame health) for the overlay & popup.
  const flushInterval = window.setInterval(flush, BATCH_FLUSH_INTERVAL);
  const metaInterval = window.setInterval(() => {
    post({
      source: PERFLEX_MESSAGE_SOURCE,
      kind: 'meta',
      fps: frameTracker.getFps(),
      frameHealth: frameTracker.getFrameHealth(),
    });
  }, 1000);

  // Flush on page hide so we don't lose the tail of a session.
  window.addEventListener('pagehide', flush);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flush();
  });

  void teardown;
  void flushInterval;
  void metaInterval;
}
