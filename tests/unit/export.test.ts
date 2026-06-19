import { describe, expect, it } from 'vitest';
import { toJSON, toHAR, toOTLP, buildReportHTML, findingToMarkdown } from '../../src/shared/export';
import type { ExportBundle, InteractionSession, PerformanceFinding, SessionSnapshot } from '../../src/shared/types';

const finding: PerformanceFinding = {
  id: 'sync',
  patternId: 'synchronous-xhr',
  patternName: 'Synchronous XHR',
  category: 'execution',
  severity: 'critical',
  confidence: 0.95,
  description: 'Sync XHR blocked the main thread',
  evidence: { sampleEntries: [] },
  impact: { frequency: 2, totalDuration: 200, affectedInteractions: [], estimatedUserImpact: 'high' },
  remediation: {
    source: 'template',
    summary: 'Use async fetch',
    detailed: 'Replace sync XHR',
    codeExample: { before: 'a', after: 'b', language: 'javascript' },
    riskLevel: 'review',
    riskExplanation: 'control flow changes',
    estimatedImpact: '200ms',
    validationSteps: ['test'],
    businessSafetyNote: 'same data',
    relatedResources: [],
  },
};

const interaction: InteractionSession = {
  id: 'int-1000',
  trigger: { type: 'click', target: 'button', timestamp: 1000 },
  duration: 150,
  inProgress: false,
  health: 60,
  networkCalls: [
    { seq: 0, kind: 'network', timestamp: 1010, url: 'https://example.com/api', method: 'GET', api: 'fetch', async: true, requestBodySize: 0, duration: 40, startTime: 1010, responseStatus: 200 },
  ],
  longTasks: [{ seq: 0, kind: 'longtask', timestamp: 1005, startTime: 1005, duration: 120, attribution: [] }],
  domMutations: [],
  layoutShifts: [],
  forcedReflows: [],
  frameBudgetViolations: [],
  causalChain: [],
  metrics: { totalBlockingTime: 70, totalNetworkTime: 40, totalDOMMutations: 0, cumulativeLayoutShift: 0, interactionToNextPaint: 90 },
};

const snapshot: SessionSnapshot = {
  tabId: 1,
  url: 'https://example.com/page',
  startedAt: 0,
  updatedAt: 2000,
  healthScore: 72,
  vitals: { lcp: 2200, inp: 90, cls: 0.05, fcp: 1200, fp: 1100, ttfb: 100 },
  totalBlockingTime: 70,
  heapSize: 5_000_000,
  frameDropRate: 0.1,
  networkRequestCount: 3,
  scripts: [
    { url: 'https://example.com/app.js', origin: 'https://example.com', classification: 'first-party', metrics: { totalMainThreadTime: 120, longTaskCount: 1, averageLongTaskDuration: 120, maxLongTaskDuration: 120, networkRequestCount: 1, totalNetworkTime: 40, totalTransferSize: 51200, forcedReflowCount: 0, layoutShiftContribution: 0, memoryGrowthRate: 0, estimatedCompileTime: 5, frameDropsAttributed: 0 }, hotFunctions: [], interactions: [], timeSeries: [] },
  ],
  findings: [finding],
  interactions: [interaction],
  timeline: { start: 0, end: 2000, longTasks: [{ start: 1005, duration: 120, scriptUrl: 'https://example.com/app.js' }], network: [], layoutShifts: [], frames: [], memory: [], interactions: [] },
  fps: 58,
};

const bundle: ExportBundle = {
  snapshot,
  resources: [
    { seq: 0, kind: 'resource', timestamp: 100, url: 'https://example.com/app.js', initiatorType: 'script', startTime: 100, duration: 50, transferSize: 51200, encodedBodySize: 51000, decodedBodySize: 120000, dns: 2, tcp: 3, tls: 1, ttfb: 20, download: 10, responseStatus: 200 },
  ],
  network: interaction.networkCalls,
};

const AT = 1_700_000_000_000;

describe('toJSON', () => {
  it('produces parseable JSON with a schema version and session data', () => {
    const obj = JSON.parse(toJSON(bundle, AT));
    expect(obj.schemaVersion).toBe('1.0');
    expect(obj.url).toBe('https://example.com/page');
    expect(obj.findings).toHaveLength(1);
    expect(obj.resources).toHaveLength(1);
  });
});

describe('toHAR', () => {
  it('produces a valid HAR 1.2 log with entries and _perflex extensions', () => {
    const har = JSON.parse(toHAR(bundle, AT));
    expect(har.log.version).toBe('1.2');
    expect(har.log.creator.name).toBe('Perflex');
    expect(har.log.entries).toHaveLength(1);
    expect(har.log.entries[0].timings.dns).toBe(2);
    expect(har.log._perflex.findings).toHaveLength(1);
    expect(typeof har.log.entries[0].startedDateTime).toBe('string');
  });
});

describe('toOTLP', () => {
  it('maps interactions to a trace with child spans and string nanos', () => {
    const otlp = JSON.parse(toOTLP(bundle, AT));
    const spans = otlp.resourceSpans[0].scopeSpans[0].spans;
    // root + 1 longtask + 1 network
    expect(spans).toHaveLength(3);
    const root = spans[0];
    expect(typeof root.startTimeUnixNano).toBe('string');
    expect(spans[1].parentSpanId).toBe(root.spanId);
    expect(spans.every((s: { traceId: string }) => s.traceId === root.traceId)).toBe(true);
  });
});

describe('buildReportHTML', () => {
  it('produces standalone HTML containing the score and findings, with no scripts', () => {
    const html = buildReportHTML(bundle, AT);
    expect(html).toContain('<!doctype html>');
    expect(html).toContain('72');
    expect(html).toContain('Synchronous XHR');
    expect(html).not.toContain('<script');
  });
});

describe('findingToMarkdown', () => {
  it('includes the pattern, fix, and code block', () => {
    const md = findingToMarkdown(finding);
    expect(md).toContain('### Synchronous XHR');
    expect(md).toContain('Use async fetch');
    expect(md).toContain('```javascript');
  });
});
