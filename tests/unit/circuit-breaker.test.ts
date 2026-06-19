import { describe, expect, it, vi } from 'vitest';
import { CircuitBreaker } from '../../src/content/collector/circuit-breaker';

describe('CircuitBreaker', () => {
  it('stays at "none" under low overhead', () => {
    let now = 0;
    vi.spyOn(performance, 'now').mockImplementation(() => now);
    const cb = new CircuitBreaker();
    // 0.5% overhead over 1s.
    cb.record(5);
    now = 1001;
    cb.record(0);
    expect(cb.throttleLevel).toBe('none');
    vi.restoreAllMocks();
  });

  it('throttles between 2% and 5% overhead', () => {
    let now = 0;
    vi.spyOn(performance, 'now').mockImplementation(() => now);
    const changes: string[] = [];
    const cb = new CircuitBreaker((l) => changes.push(l));
    cb.record(30); // 3% of 1000ms
    now = 1001;
    cb.record(0);
    expect(cb.throttleLevel).toBe('throttled');
    expect(changes).toContain('throttled');
    vi.restoreAllMocks();
  });

  it('drops to minimal above 5% overhead and keeps always-on features', () => {
    let now = 0;
    vi.spyOn(performance, 'now').mockImplementation(() => now);
    const cb = new CircuitBreaker();
    cb.record(80); // 8%
    now = 1001;
    cb.record(0);
    expect(cb.throttleLevel).toBe('minimal');
    expect(cb.isEnabled('longtask')).toBe(true);
    expect(cb.isEnabled('resource')).toBe(true);
    expect(cb.isEnabled('mutation')).toBe(false);
    expect(cb.isEnabled('timer')).toBe(false);
    vi.restoreAllMocks();
  });
});
