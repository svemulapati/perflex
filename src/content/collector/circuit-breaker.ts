import { OVERHEAD_DISABLE_THRESHOLD, OVERHEAD_THROTTLE_THRESHOLD } from '@/shared/constants';

export type CollectorFeature =
  | 'longtask'
  | 'resource'
  | 'loaf'
  | 'event'
  | 'lcp'
  | 'layout-shift'
  | 'paint'
  | 'navigation'
  | 'element'
  | 'network'
  | 'timer'
  | 'reflow'
  | 'mutation'
  | 'frame'
  | 'memory';

export type ThrottleLevel = 'none' | 'throttled' | 'minimal';

/**
 * Self-monitoring circuit breaker. The collector reports the wall-clock time
 * it spends in its own callbacks; if that exceeds a fraction of the frame
 * budget over a rolling 1s window, lower-value features are disabled.
 */
export class CircuitBreaker {
  private windowStart = performance.now();
  private overheadInWindow = 0;
  private level: ThrottleLevel = 'none';
  private sampleToggle = false;

  /** Highest-value, lowest-cost features that always stay on. */
  private static readonly ALWAYS_ON: Set<CollectorFeature> = new Set(['longtask', 'resource']);

  /** Features disabled first when throttled. */
  private static readonly LOW_PRIORITY: Set<CollectorFeature> = new Set(['element', 'memory', 'mutation']);

  constructor(private readonly onLevelChange?: (level: ThrottleLevel) => void) {}

  /** Record time (ms) spent in a collector callback and re-evaluate the window. */
  record(durationMs: number): void {
    const now = performance.now();
    this.overheadInWindow += durationMs;
    const elapsed = now - this.windowStart;
    if (elapsed >= 1000) {
      // Overhead as a fraction of total frames available in the window.
      const fraction = this.overheadInWindow / elapsed;
      this.evaluate(fraction);
      this.windowStart = now;
      this.overheadInWindow = 0;
    }
  }

  private evaluate(fraction: number): void {
    let next: ThrottleLevel = 'none';
    if (fraction > OVERHEAD_DISABLE_THRESHOLD) next = 'minimal';
    else if (fraction > OVERHEAD_THROTTLE_THRESHOLD) next = 'throttled';
    if (next !== this.level) {
      this.level = next;
      this.onLevelChange?.(next);
    }
  }

  get throttleLevel(): ThrottleLevel {
    return this.level;
  }

  /** Whether a feature should currently emit events. */
  isEnabled(feature: CollectorFeature): boolean {
    if (this.level === 'none') return true;
    if (CircuitBreaker.ALWAYS_ON.has(feature)) return true;
    if (this.level === 'minimal') return false;
    // throttled: drop low-priority features outright.
    return !CircuitBreaker.LOW_PRIORITY.has(feature);
  }

  /** When throttled, sample every other high-frequency event. */
  shouldSample(): boolean {
    if (this.level === 'none') return true;
    this.sampleToggle = !this.sampleToggle;
    return this.sampleToggle;
  }
}
