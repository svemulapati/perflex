import { describe, expect, it } from 'vitest';
import { analyze } from '../../src/shared/anti-patterns';
import type { AnalysisInput, DetectedFramework, ResourceEvent } from '../../src/shared/types';

function input(frameworks: DetectedFramework[], resources: ResourceEvent[] = []): AnalysisInput {
  return {
    pageOrigin: 'https://example.com',
    allowlist: [],
    durationMs: 5000,
    fcp: 1000,
    vitals: { lcp: null, inp: null, cls: 0, fcp: 1000, fp: null, ttfb: null },
    scripts: [],
    interactions: [],
    timeline: { start: 0, end: 5000, longTasks: [], network: [], layoutShifts: [], frames: [], memory: [], interactions: [] },
    resources,
    network: [],
    reflows: [],
    timers: { maxActive: 0, rafCount: 0, rafLongCount: 0 },
    jsonParses: [],
    domQueries: [],
    runtime: null,
    frameworks,
    memory: { growthRatePerMin: 0, sampleCount: 0, spanMs: 0 },
  };
}

function res(url: string): ResourceEvent {
  return {
    seq: 0, kind: 'resource', timestamp: 0, url, initiatorType: 'script', startTime: 0, duration: 10,
    transferSize: 1000, encodedBodySize: 900, decodedBodySize: 1000, dns: 0, tcp: 0, tls: 0, ttfb: 0, download: 0,
  };
}

describe('framework matchers', () => {
  it('flags a React development build detected via bundleType', () => {
    const f = analyze(input([{ name: 'React', version: '18.2.0', major: 18, devBuild: true }]));
    const dev = f.find((x) => x.patternId === 'dev-build-shipped');
    expect(dev).toBeDefined();
    expect(dev!.severity).toBe('critical');
    expect(dev!.description).toContain('React');
  });

  it('flags a dev build detected via the bundle URL', () => {
    const f = analyze(input([{ name: 'React' }], [res('https://example.com/react-dom.development.js')]));
    expect(f.some((x) => x.patternId === 'dev-build-shipped')).toBe(true);
  });

  it('does not flag a production vue bundle as dev', () => {
    const f = analyze(input([{ name: 'Vue' }], [res('https://cdn/vue.global.prod.js')]));
    expect(f.some((x) => x.patternId === 'dev-build-shipped')).toBe(false);
  });

  it('flags multiple UI frameworks but ignores meta-frameworks', () => {
    const f = analyze(
      input([
        { name: 'React', major: 18 },
        { name: 'Next.js', meta: true },
        { name: 'jQuery', version: '3.6.0', major: 3 },
      ])
    );
    const multi = f.find((x) => x.patternId === 'multiple-ui-frameworks');
    expect(multi).toBeDefined();
    expect(multi!.description).toContain('jQuery');
    expect(multi!.description).not.toContain('Next.js');
  });

  it('flags an outdated major version as info', () => {
    const f = analyze(input([{ name: 'React', version: '17.0.2', major: 17 }]));
    const old = f.find((x) => x.patternId === 'outdated-framework');
    expect(old).toBeDefined();
    expect(old!.severity).toBe('info');
  });

  it('returns nothing when a single current framework is present', () => {
    const f = analyze(input([{ name: 'React', version: '18.2.0', major: 18 }]));
    expect(f).toHaveLength(0);
  });
});
