import { describe, expect, it } from 'vitest';
import { analyze, PATTERN_META } from '../../src/shared/anti-patterns';
import { REMEDIATIONS } from '../../src/shared/remediation-templates';
import type { AnalysisInput, NetworkEvent, ResourceEvent, RuntimeStatsEvent } from '../../src/shared/types';

function runtimeStats(over: Partial<RuntimeStatsEvent> = {}): RuntimeStatsEvent {
  return {
    seq: 0, kind: 'runtime-stats', timestamp: 0, consolePerSec: 0, domElementCount: 0, domMaxDepth: 0,
    longestSiblingRun: 0, willChangeCount: 0, syncXhrCount: 0, hiFreqScrollPerSec: 0, hiFreqMovePerSec: 0,
    documentWriteCount: 0, documentWriteBytes: 0, ...over,
  };
}

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
    frameworks: [],
    memory: { growthRatePerMin: 0, sampleCount: 0, spanMs: 0 },
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

  it('flags render-blocking stylesheets', () => {
    const findings = analyze(
      baseInput({ resources: [resource({ url: 'https://example.com/app.css', initiatorType: 'link', renderBlockingStatus: 'blocking' })] })
    );
    const f = findings.find((x) => x.patternId === 'render-blocking-stylesheet');
    expect(f).toBeDefined();
    expect(f!.severity).toBe('warning');
  });

  it('flags document.write usage from runtime stats', () => {
    const findings = analyze(baseInput({ runtime: runtimeStats({ documentWriteCount: 3 }) }));
    const f = findings.find((x) => x.patternId === 'document-write');
    expect(f).toBeDefined();
    expect(f!.impact.frequency).toBe(3);
  });

  it('flags a suspected memory leak only with sustained growth + enough samples', () => {
    expect(
      analyze(baseInput({ memory: { growthRatePerMin: 10 * 1024 * 1024, sampleCount: 6, spanMs: 120_000 } }))
        .some((x) => x.patternId === 'suspected-memory-leak')
    ).toBe(true);
    // Too few samples → no finding (avoids false positives).
    expect(
      analyze(baseInput({ memory: { growthRatePerMin: 10 * 1024 * 1024, sampleCount: 2, spanMs: 120_000 } }))
        .some((x) => x.patternId === 'suspected-memory-leak')
    ).toBe(false);
  });

  it('flags oversized images and does not double-count them as oversized payloads', () => {
    const findings = analyze(
      baseInput({ resources: [resource({ url: 'https://example.com/hero.png', initiatorType: 'img', transferSize: 700 * 1024 })] })
    );
    expect(findings.some((x) => x.patternId === 'oversized-images')).toBe(true);
    expect(findings.some((x) => x.patternId === 'oversized-payload')).toBe(false);
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
