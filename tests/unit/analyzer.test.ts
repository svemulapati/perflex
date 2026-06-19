import { describe, expect, it } from 'vitest';
import { analyze, PATTERN_META } from '../../src/shared/anti-patterns';
import { REMEDIATIONS } from '../../src/shared/remediation-templates';
import type { AnalysisInput, NetworkEvent, ResourceEvent } from '../../src/shared/types';

function baseInput(over: Partial<AnalysisInput> = {}): AnalysisInput {
  return {
    pageOrigin: 'https://example.com',
    allowlist: [],
    durationMs: 5000,
    fcp: 1000,
    vitals: { lcp: null, inp: null, cls: 0, fcp: 1000, fp: null, ttfb: null },
    scripts: [],
    interactions: [],
    timeline: { start: 0, end: 5000, longTasks: [], network: [], layoutShifts: [], frames: [], memory: [], interactions: [] },
    resources: [],
    network: [],
    reflows: [],
    timers: { maxActive: 0, rafCount: 0, rafLongCount: 0 },
    jsonParses: [],
    domQueries: [],
    runtime: null,
    ...over,
  };
}

function resource(over: Partial<ResourceEvent>): ResourceEvent {
  return {
    seq: 0,
    kind: 'resource',
    timestamp: 0,
    url: 'https://example.com/x.js',
    initiatorType: 'script',
    startTime: 0,
    duration: 10,
    transferSize: 1000,
    encodedBodySize: 900,
    decodedBodySize: 1000,
    dns: 0,
    tcp: 0,
    tls: 0,
    ttfb: 0,
    download: 0,
    ...over,
  };
}

describe('analyzer catalog', () => {
  it('has a remediation template for every catalogued pattern', () => {
    for (const id of Object.keys(PATTERN_META)) {
      expect(REMEDIATIONS[id], `missing remediation for ${id}`).toBeDefined();
    }
  });
});

describe('matchers', () => {
  it('flags synchronous XHR as critical', () => {
    const sync: NetworkEvent = {
      seq: 0,
      kind: 'network',
      timestamp: 0,
      url: 'https://example.com/api',
      method: 'GET',
      api: 'xhr',
      async: false,
      requestBodySize: 0,
      duration: 120,
      startTime: 0,
    };
    const findings = analyze(baseInput({ network: [sync] }));
    const f = findings.find((x) => x.patternId === 'synchronous-xhr');
    expect(f).toBeDefined();
    expect(f!.severity).toBe('critical');
    expect(f!.remediation).toBeDefined();
  });

  it('flags layout thrashing and escalates inside a busy interaction', () => {
    const reflows = Array.from({ length: 8 }, (_, i) => ({
      seq: 0,
      kind: 'reflow' as const,
      timestamp: i,
      property: 'offsetHeight',
    }));
    const findings = analyze(
      baseInput({
        reflows,
        interactions: [
          {
            id: 'i1',
            trigger: { type: 'click', target: 'b', timestamp: 0 },
            duration: 100,
            inProgress: false,
            health: 50,
            networkCalls: [],
            longTasks: [],
            domMutations: [],
            layoutShifts: [],
            forcedReflows: reflows,
            frameBudgetViolations: [],
            causalChain: [],
            metrics: { totalBlockingTime: 0, totalNetworkTime: 0, totalDOMMutations: 0, cumulativeLayoutShift: 0, interactionToNextPaint: 0 },
          },
        ],
      })
    );
    const f = findings.find((x) => x.patternId === 'layout-thrashing');
    expect(f?.severity).toBe('critical');
  });

  it('flags oversized payloads with per-resource findings', () => {
    const findings = analyze(
      baseInput({ resources: [resource({ url: 'https://example.com/huge.json', transferSize: 3 * 1024 * 1024 })] })
    );
    const f = findings.find((x) => x.patternId === 'oversized-payload');
    expect(f).toBeDefined();
    expect(f!.severity).toBe('critical');
  });

  it('flags third-party main-thread domination', () => {
    const findings = analyze(
      baseInput({
        scripts: [
          { url: 'https://example.com/app.js', origin: 'https://example.com', classification: 'first-party', metrics: m(100), hotFunctions: [], interactions: [], timeSeries: [] },
          { url: 'https://ga.com/a.js', origin: 'https://ga.com', classification: 'third-party-unknown', metrics: m(300), hotFunctions: [], interactions: [], timeSeries: [] },
        ],
      })
    );
    const f = findings.find((x) => x.patternId === 'third-party-main-thread');
    expect(f).toBeDefined();
    expect(f!.severity).toBe('critical'); // 300/400 = 75% > 50%
  });

  it('returns nothing on a clean session', () => {
    expect(analyze(baseInput())).toHaveLength(0);
  });
});

function m(mainThread: number) {
  return {
    totalMainThreadTime: mainThread,
    longTaskCount: 0,
    averageLongTaskDuration: 0,
    maxLongTaskDuration: 0,
    networkRequestCount: 0,
    totalNetworkTime: 0,
    totalTransferSize: 0,
    forcedReflowCount: 0,
    layoutShiftContribution: 0,
    memoryGrowthRate: 0,
    estimatedCompileTime: 0,
    frameDropsAttributed: 0,
  };
}
