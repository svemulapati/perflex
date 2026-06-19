import { describe, expect, it } from 'vitest';
import { Correlator } from '../../src/workers/correlator-core';
import type { CollectorEvent } from '../../src/shared/types';

const ORIGIN = 'https://example.com';

function trigger(ts: number, type = 'click', target = 'button#go'): CollectorEvent {
  return { seq: 0, kind: 'interaction', timestamp: ts, interactionId: `x${ts}`, inputType: type, target };
}
function longtask(ts: number, duration: number): CollectorEvent {
  return { seq: 0, kind: 'longtask', timestamp: ts, startTime: ts, duration, attribution: [] };
}
function network(ts: number, duration: number, url = 'https://example.com/api'): CollectorEvent {
  return {
    seq: 0,
    kind: 'network',
    timestamp: ts,
    url,
    method: 'GET',
    api: 'fetch',
    async: true,
    requestBodySize: 0,
    duration,
    startTime: ts,
  };
}

describe('interaction session assembly', () => {
  it('groups events after a trigger into one session and closes on the quiet window', () => {
    const c = new Correlator(ORIGIN);
    c.ingest([trigger(1000), longtask(1010, 120), network(1050, 80)]);
    // A later event beyond the 500ms quiet window opens nothing but closes the session.
    c.ingest([longtask(2000, 30)]);

    const snap = c.snapshot(1, ORIGIN);
    const session = snap.interactions.find((s) => s.id === 'int-1000');
    expect(session).toBeDefined();
    expect(session!.inProgress).toBe(false);
    expect(session!.longTasks).toHaveLength(1);
    expect(session!.networkCalls).toHaveLength(1);
    // TBT = max(0, 120-50) = 70.
    expect(session!.metrics.totalBlockingTime).toBe(70);
    expect(session!.metrics.totalNetworkTime).toBe(80);
  });

  it('builds a time-ordered causal chain starting with the trigger', () => {
    const c = new Correlator(ORIGIN);
    c.ingest([trigger(500), network(560, 40), longtask(520, 90)]);
    c.ingest([longtask(2000, 10)]); // force-close

    const snap = c.snapshot(1, ORIGIN);
    const session = snap.interactions.find((s) => s.id === 'int-500')!;
    const chain = session.causalChain;
    expect(chain[0].kind).toBe('trigger');
    // Offsets are sorted ascending; longtask (+20) precedes network (+60).
    const kinds = chain.map((s) => s.kind);
    expect(kinds.indexOf('longtask')).toBeLessThan(kinds.indexOf('network'));
  });

  it('exposes the open session as in-progress in the timeline', () => {
    const c = new Correlator(ORIGIN);
    c.ingest([trigger(1000), longtask(1010, 60)]);
    const snap = c.snapshot(1, ORIGIN);
    const live = snap.interactions.find((s) => s.id === 'int-1000')!;
    expect(live.inProgress).toBe(true);
    expect(snap.timeline.interactions.some((t) => t.id === 'int-1000' && t.inProgress)).toBe(true);
  });

  it('populates timeline lanes', () => {
    const c = new Correlator(ORIGIN);
    c.ingest([
      trigger(100),
      longtask(110, 70),
      {
        seq: 0,
        kind: 'resource',
        timestamp: 120,
        url: 'https://example.com/a.js',
        initiatorType: 'script',
        startTime: 120,
        duration: 50,
        transferSize: 1000,
        encodedBodySize: 900,
        decodedBodySize: 2000,
        dns: 0,
        tcp: 0,
        tls: 0,
        ttfb: 10,
        download: 5,
      },
    ]);
    const snap = c.snapshot(1, ORIGIN);
    expect(snap.timeline.longTasks.length).toBe(1);
    expect(snap.timeline.network.length).toBe(1);
    expect(snap.timeline.network[0].initiatorType).toBe('script');
  });
});
