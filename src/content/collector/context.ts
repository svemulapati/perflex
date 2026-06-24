import type { CollectorEvent } from '@/shared/types';
import { CircuitBreaker, type CollectorFeature } from './circuit-breaker';

/**
 * Shared context handed to every collector module. Centralizes:
 *  - sequence numbering
 *  - error isolation (a crashing hook must never break the host page)
 *  - overhead measurement feeding the circuit breaker
 */
export interface NativeClock {
  setTimeout: typeof window.setTimeout;
  clearTimeout: typeof window.clearTimeout;
  setInterval: typeof window.setInterval;
  clearInterval: typeof window.clearInterval;
  requestAnimationFrame: typeof window.requestAnimationFrame;
  cancelAnimationFrame: typeof window.cancelAnimationFrame;
}

export class CollectorContext {
  private seq = 0;
  private lastTimestamp = 0;
  readonly breaker: CircuitBreaker;

  /**
   * Native timer functions captured at construction — BEFORE the timer
   * interceptor patches the globals. Collector modules must use this for their
   * own scheduling so Perflex never instruments (or throttles) itself.
   */
  readonly clock: NativeClock = {
    setTimeout: window.setTimeout.bind(window),
    clearTimeout: window.clearTimeout.bind(window),
    setInterval: window.setInterval.bind(window),
    clearInterval: window.clearInterval.bind(window),
    requestAnimationFrame: window.requestAnimationFrame.bind(window),
    cancelAnimationFrame: window.cancelAnimationFrame.bind(window),
  };

  constructor(
    private readonly sink: (event: CollectorEvent) => void,
    breaker?: CircuitBreaker
  ) {
    this.breaker = breaker ?? new CircuitBreaker();
  }

  emit(event: CollectorEvent): void {
    event.seq = ++this.seq;
    // Guarantee monotonic timestamps. performance.now() can briefly go
    // backwards across clock adjustments; the correlator sorts by timestamp, so
    // nudge any regression to just past the last value (D.2 data integrity).
    if (event.timestamp < this.lastTimestamp) {
      event.timestamp = this.lastTimestamp + 0.001;
    }
    this.lastTimestamp = event.timestamp;
    this.sink(event);
  }

  isEnabled(feature: CollectorFeature): boolean {
    return this.breaker.isEnabled(feature);
  }

  /**
   * Run a collector callback with error isolation and overhead accounting.
   * Any throw is swallowed (never propagates to host page code).
   */
  measure<T>(fn: () => T, fallback?: T): T | undefined {
    const start = performance.now();
    try {
      return fn();
    } catch {
      return fallback;
    } finally {
      this.breaker.record(performance.now() - start);
    }
  }

  /** Wrap a function so it is permanently error-isolated + measured. */
  wrap<A extends unknown[], R>(fn: (...args: A) => R): (...args: A) => R | undefined {
    return (...args: A) => this.measure(() => fn(...args));
  }
}
