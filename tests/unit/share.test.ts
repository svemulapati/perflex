import { describe, expect, it } from 'vitest';
import { buildSharePayload, encodeSession, decodeSession, buildPermalink } from '../../src/shared/export/share';
import type { ExportBundle, SessionSnapshot } from '../../src/shared/types';

function snapshot(): SessionSnapshot {
  return {
    tabId: 1,
    url: 'https://example.com/page?token=abc',
    startedAt: 0,
    updatedAt: 2000,
    healthScore: 72,
    vitals: { lcp: 2200, inp: 90, cls: 0.05, fcp: 1200, fp: 1100, ttfb: 100 },
    totalBlockingTime: 70,
    heapSize: 5_000_000,
    frameDropRate: 0.1,
    networkRequestCount: 3,
    scripts: Array.from({ length: 40 }, (_, i) => ({
      url: `https://example.com/s${i}.js`,
      origin: 'https://example.com',
      classification: 'first-party' as const,
      metrics: { totalMainThreadTime: 40 - i, longTaskCount: 1, averageLongTaskDuration: 10, maxLongTaskDuration: 10, networkRequestCount: 1, totalNetworkTime: 5, totalTransferSize: 1000, forcedReflowCount: 0, layoutShiftContribution: 0, memoryGrowthRate: 0, estimatedCompileTime: 1, frameDropsAttributed: 0 },
      hotFunctions: [],
      interactions: [],
      timeSeries: [],
    })),
    findings: [
      {
        id: 'sync', patternId: 'synchronous-xhr', patternName: 'Synchronous XHR', category: 'execution', severity: 'critical', confidence: 0.95,
        description: 'blocked the main thread', evidence: { sampleEntries: [] },
        impact: { frequency: 1, totalDuration: 100, affectedInteractions: [], estimatedUserImpact: 'high' },
      },
    ],
    interactions: [],
    timeline: { start: 0, end: 2000, longTasks: [], network: [], layoutShifts: [], frames: [], memory: [], interactions: [] },
    frameworks: [{ name: 'React', version: '18.2.0', major: 18 }],
    fps: 58,
  };
}

const bundle: ExportBundle = { snapshot: snapshot(), resources: [], network: [] };

describe('share payload', () => {
  it('caps scripts to 25 and keeps findings + frameworks', () => {
    const p = buildSharePayload(bundle, 123);
    expect(p.scripts).toHaveLength(25);
    expect(p.findings).toHaveLength(1);
    expect(p.frameworks[0].name).toBe('React');
    expect(p.generatedAt).toBe(123);
  });
});

describe('encode/decode round-trip', () => {
  it('survives a gzip + base64url round-trip', async () => {
    const payload = buildSharePayload(bundle, 999);
    const encoded = await encodeSession(payload);
    expect(encoded).toMatch(/^[gr]/);
    expect(encoded).not.toMatch(/[+/=]/); // url-safe alphabet only
    const decoded = await decodeSession(encoded);
    expect(decoded.url).toBe(payload.url);
    expect(decoded.healthScore).toBe(72);
    expect(decoded.findings[0].patternId).toBe('synchronous-xhr');
    expect(decoded.scripts).toHaveLength(25);
  });
});

describe('buildPermalink', () => {
  it('puts the payload in the URL fragment after a normalized base', () => {
    const link = buildPermalink('gABC', 'https://x.github.io/perflex');
    expect(link).toBe('https://x.github.io/perflex/#s=gABC');
  });

  it('strips any existing fragment from the base', () => {
    const link = buildPermalink('gXYZ', 'https://x.github.io/perflex/#s=old');
    expect(link).toBe('https://x.github.io/perflex/#s=gXYZ');
  });
});
