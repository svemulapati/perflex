import type { TimerEvent } from '@/shared/types';
import { fingerprintStack } from '@/shared/hash';
import type { CollectorContext } from './context';

/**
 * Wraps timer/callback scheduling globals to measure callback duration and
 * track how many timers are active simultaneously (timer-flooding detection).
 */
export function setupTimerInterceptor(ctx: CollectorContext): () => void {
  const activeTimers = new Set<number>();
  const activeIntervals = new Set<number>();

  const origSetTimeout = window.setTimeout;
  const origClearTimeout = window.clearTimeout;
  const origSetInterval = window.setInterval;
  const origClearInterval = window.clearInterval;
  const origRAF = window.requestAnimationFrame;

  const emit = (
    api: TimerEvent['api'],
    callbackDuration: number,
    requestedDelay: number | undefined,
    actualDelay: number | undefined,
    fingerprint: number
  ) => {
    if (!ctx.isEnabled('timer')) return;
    const event: TimerEvent = {
      seq: 0,
      kind: 'timer',
      timestamp: performance.now(),
      fingerprint,
      api,
      callbackDuration,
      requestedDelay,
      actualDelay,
      activeCount: activeTimers.size + activeIntervals.size,
    };
    ctx.emit(event);
  };

  window.setTimeout = function (
    this: unknown,
    handler: TimerHandler,
    timeout?: number,
    ...rest: unknown[]
  ): number {
    const fingerprint = fingerprintStack(new Error().stack);
    const scheduledAt = performance.now();
    if (typeof handler !== 'function') {
      return origSetTimeout.call(window, handler, timeout, ...rest);
    }
    const wrapped = (...args: unknown[]) => {
      const start = performance.now();
      try {
        return (handler as (...a: unknown[]) => unknown)(...args);
      } finally {
        const end = performance.now();
        activeTimers.delete(id);
        ctx.measure(() =>
          emit('setTimeout', end - start, timeout ?? 0, start - scheduledAt, fingerprint)
        );
      }
    };
    const id = origSetTimeout.call(window, wrapped, timeout, ...rest);
    activeTimers.add(id);
    return id;
  } as typeof window.setTimeout;

  window.clearTimeout = function (id?: number): void {
    if (id !== undefined) activeTimers.delete(id);
    return origClearTimeout.call(window, id);
  };

  window.setInterval = function (
    this: unknown,
    handler: TimerHandler,
    timeout?: number,
    ...rest: unknown[]
  ): number {
    const fingerprint = fingerprintStack(new Error().stack);
    if (typeof handler !== 'function') {
      return origSetInterval.call(window, handler, timeout, ...rest);
    }
    const wrapped = (...args: unknown[]) => {
      const start = performance.now();
      try {
        return (handler as (...a: unknown[]) => unknown)(...args);
      } finally {
        ctx.measure(() => emit('setInterval', performance.now() - start, timeout ?? 0, undefined, fingerprint));
      }
    };
    const id = origSetInterval.call(window, wrapped, timeout, ...rest);
    activeIntervals.add(id);
    return id;
  } as typeof window.setInterval;

  window.clearInterval = function (id?: number): void {
    if (id !== undefined) activeIntervals.delete(id);
    return origClearInterval.call(window, id);
  };

  window.requestAnimationFrame = function (cb: FrameRequestCallback): number {
    const fingerprint = fingerprintStack(new Error().stack);
    const wrapped: FrameRequestCallback = (t) => {
      const start = performance.now();
      try {
        return cb(t);
      } finally {
        const dur = performance.now() - start;
        // Only report rAF callbacks that did meaningful work.
        if (dur > 1) ctx.measure(() => emit('requestAnimationFrame', dur, undefined, undefined, fingerprint));
      }
    };
    return origRAF.call(window, wrapped);
  };

  return () => {
    window.setTimeout = origSetTimeout;
    window.clearTimeout = origClearTimeout;
    window.setInterval = origSetInterval;
    window.clearInterval = origClearInterval;
    window.requestAnimationFrame = origRAF;
  };
}
