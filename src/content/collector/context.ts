import type { CollectorEvent } from '@/shared/types';
import { CircuitBreaker, type CollectorFeature } from './circuit-breaker';

/**
 * Shared context handed to every collector module. Centralizes:
 *  - sequence numbering
 *  - error isolation (a crashing hook must never break the host page)
 *  - overhead measurement feeding the circuit breaker
 */
export class CollectorContext {
  private seq = 0;
  readonly breaker: CircuitBreaker;

  constructor(
    private readonly sink: (event: CollectorEvent) => void,
    breaker?: CircuitBreaker
  ) {
    this.breaker = breaker ?? new CircuitBreaker();
  }

  emit(event: CollectorEvent): void {
    event.seq = ++this.seq;
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
