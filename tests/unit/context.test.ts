import { describe, expect, it } from 'vitest';
import { CollectorContext } from '../../src/content/collector/context';
import type { CollectorEvent } from '../../src/shared/types';

function ev(timestamp: number): CollectorEvent {
  return { kind: 'memory', timestamp, seq: 0, usedJSHeapSize: 1, totalJSHeapSize: 2 } as CollectorEvent;
}

describe('CollectorContext.emit', () => {
  it('assigns monotonic sequence numbers', () => {
    const out: CollectorEvent[] = [];
    const ctx = new CollectorContext((e) => out.push(e));
    ctx.emit(ev(1));
    ctx.emit(ev(2));
    expect(out.map((e) => e.seq)).toEqual([1, 2]);
  });

  it('nudges a backwards timestamp past the last one, leaving forward ones intact', () => {
    const out: CollectorEvent[] = [];
    const ctx = new CollectorContext((e) => out.push(e));
    ctx.emit(ev(100));
    ctx.emit(ev(90)); // regressed clock
    ctx.emit(ev(95)); // still behind the nudged value
    ctx.emit(ev(200)); // forward — untouched
    const ts = out.map((e) => e.timestamp);
    expect(ts[0]).toBe(100);
    expect(ts[3]).toBe(200);
    // Strictly increasing, with the regressed values nudged just past 100.
    expect(ts[1]).toBeGreaterThan(100);
    expect(ts[2]).toBeGreaterThan(ts[1]);
    expect(ts[2]).toBeLessThan(101);
  });

  it('leaves equal (same-tick) timestamps unchanged', () => {
    const out: CollectorEvent[] = [];
    const ctx = new CollectorContext((e) => out.push(e));
    ctx.emit(ev(50));
    ctx.emit(ev(50));
    expect(out.map((e) => e.timestamp)).toEqual([50, 50]);
  });
});
