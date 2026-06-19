import type { MemoryEvent } from '@/shared/types';
import { MEMORY_POLL_INTERVAL } from '@/shared/constants';
import type { CollectorContext } from './context';

interface PerfWithMemory extends Performance {
  memory?: {
    usedJSHeapSize: number;
    totalJSHeapSize: number;
    jsHeapSizeLimit: number;
  };
}

/**
 * Polls JS heap usage (Chromium `performance.memory`). Degrades gracefully when
 * the API is unavailable.
 */
export function setupMemoryMonitor(ctx: CollectorContext): () => void {
  const perf = performance as PerfWithMemory;
  if (!perf.memory) return () => {};

  let timer = 0;
  const poll = () => {
    ctx.measure(() => {
      if (!ctx.isEnabled('memory')) return;
      const mem = perf.memory!;
      const event: MemoryEvent = {
        seq: 0,
        kind: 'memory',
        timestamp: performance.now(),
        usedJSHeapSize: mem.usedJSHeapSize,
        totalJSHeapSize: mem.totalJSHeapSize,
      };
      ctx.emit(event);
    });
    timer = window.setTimeout(poll, MEMORY_POLL_INTERVAL);
  };
  // First sample shortly after load, then on the interval.
  timer = window.setTimeout(poll, 1000);

  return () => clearTimeout(timer);
}
