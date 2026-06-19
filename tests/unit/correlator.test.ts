import { describe, expect, it } from 'vitest';
import { Correlator } from '../../src/workers/correlator-core';
import type { CollectorEvent } from '../../src/shared/types';

const ORIGIN = 'https://example.com';

function loaf(url: string, fn: string, duration: number, ts = 100): CollectorEvent {
  return {
    seq: 0,
    kind: 'long-animation-frame',
    timestamp: ts,
    startTime: ts,
    duration,
    blockingDuration: Math.max(0, duration - 50),
    scriptDuration: duration,
    styleAndLayoutDuration: 0,
    scripts: [
      { sourceURL: url, sourceFunctionName: fn, sourceCharPosition: 42, duration },
    ],
  };
}

describe('Correlator', () => {
  it('attributes main-thread time to scripts and functions', () => {
    const c = new Correlator(ORIGIN);
    c.ingest([loaf('https://example.com/app.js', 'render', 120)]);
    c.ingest([loaf('https://example.com/app.js', 'render', 80)]);

    const snap = c.snapshot(1, ORIGIN);
    const app = snap.scripts.find((s) => s.url.includes('app.js'));
    expect(app).toBeDefined();
    expect(app!.metrics.totalMainThreadTime).toBe(200);
    expect(app!.classification).toBe('first-party');

    const fn = app!.hotFunctions[0];
    expect(fn.functionName).toBe('render');
    expect(fn.invocationCount).toBe(2);
    expect(fn.totalDuration).toBe(200);
    expect(fn.charPosition).toBe(42);
  });

  it('classifies third-party scripts in the leaderboard', () => {
    const c = new Correlator(ORIGIN);
    c.ingest([loaf('https://www.google-analytics.com/analytics.js', 'track', 60)]);
    const snap = c.snapshot(1, ORIGIN);
    const ga = snap.scripts[0];
    expect(ga.classification).toBe('third-party-known');
    expect(ga.category).toBe('analytics');
  });

  it('accumulates CLS only for shifts without recent input', () => {
    const c = new Correlator(ORIGIN);
    const shift = (value: number, hadRecentInput: boolean): CollectorEvent => ({
      seq: 0,
      kind: 'layout-shift',
      timestamp: 50,
      value,
      hadRecentInput,
      lastInputTime: 0,
      sources: [],
    });
    c.ingest([shift(0.1, false), shift(0.2, true), shift(0.05, false)]);
    const snap = c.snapshot(1, ORIGIN);
    expect(snap.vitals.cls).toBeCloseTo(0.15, 5);
  });

  it('produces a health score in [0,100]', () => {
    const c = new Correlator(ORIGIN);
    c.ingest([loaf('https://example.com/app.js', 'render', 300)]);
    const snap = c.snapshot(1, ORIGIN);
    expect(snap.healthScore).toBeGreaterThanOrEqual(0);
    expect(snap.healthScore).toBeLessThanOrEqual(100);
  });

  it('resets all accumulated state', () => {
    const c = new Correlator(ORIGIN);
    c.ingest([loaf('https://example.com/app.js', 'render', 100)]);
    c.reset();
    const snap = c.snapshot(1, ORIGIN);
    expect(snap.scripts).toHaveLength(0);
    expect(snap.vitals.cls).toBe(0);
  });
});
