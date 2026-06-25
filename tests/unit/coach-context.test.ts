import { describe, expect, it } from 'vitest';
import { anonymizeUrl, buildCoachContext, buildSystemPrompt } from '../../src/shared/coach-context';
import type { SessionSnapshot } from '../../src/shared/types';

describe('anonymizeUrl', () => {
  it('replaces the domain and blanks query values', () => {
    expect(anonymizeUrl('https://shop.acme.com/checkout?token=SECRET&step=2')).toBe('https://site.com/checkout?token=…&step=…');
  });
  it('keeps just the path when there is no query', () => {
    expect(anonymizeUrl('https://acme.com/a/b')).toBe('https://site.com/a/b');
  });
  it('degrades gracefully on a bad URL', () => {
    expect(anonymizeUrl('not a url')).toBe('site.com');
  });
});

function snap(): SessionSnapshot {
  return {
    tabId: 1, url: 'https://acme.com/p?token=abc', startedAt: 0, updatedAt: 1000, healthScore: 70,
    vitals: { lcp: 2200, inp: 120, cls: 0.05, fcp: 1200, fp: 1100, ttfb: 100 },
    totalBlockingTime: 90, heapSize: 10_485_760, frameDropRate: 0.1, networkRequestCount: 5,
    scripts: [
      { url: 'https://acme.com/app.js?v=1', origin: 'https://acme.com', classification: 'first-party', metrics: { totalMainThreadTime: 100, longTaskCount: 1, averageLongTaskDuration: 10, maxLongTaskDuration: 10, networkRequestCount: 1, totalNetworkTime: 5, totalTransferSize: 1000, forcedReflowCount: 0, layoutShiftContribution: 0, memoryGrowthRate: 0, estimatedCompileTime: 1, frameDropsAttributed: 0 }, hotFunctions: [], interactions: [], timeSeries: [] },
      { url: 'https://www.google-analytics.com/ga.js', origin: 'https://www.google-analytics.com', classification: 'third-party-known', metrics: { totalMainThreadTime: 100, longTaskCount: 0, averageLongTaskDuration: 0, maxLongTaskDuration: 0, networkRequestCount: 1, totalNetworkTime: 5, totalTransferSize: 2000, forcedReflowCount: 0, layoutShiftContribution: 0, memoryGrowthRate: 0, estimatedCompileTime: 1, frameDropsAttributed: 0 }, hotFunctions: [], interactions: [], timeSeries: [] },
    ],
    findings: [
      { id: 'x', patternId: 'sync-xhr', patternName: 'Synchronous XHR', category: 'execution', severity: 'critical', confidence: 0.9, description: 'blocked', evidence: { scriptUrl: 'https://acme.com/app.js?token=SECRET', sampleEntries: [] }, impact: { frequency: 2, totalDuration: 120, affectedInteractions: [], estimatedUserImpact: 'high', coreWebVitalAffected: 'INP' } },
    ],
    interactions: [], timeline: { start: 0, end: 1000, longTasks: [], network: [], layoutShifts: [], frames: [], memory: [], interactions: [] },
    frameworks: [{ name: 'React', version: '18', devBuild: true }], fps: 60,
  };
}

describe('buildCoachContext', () => {
  it('anonymizes, reduces scripts to filenames, and computes third-party %', () => {
    const c = buildCoachContext(snap());
    expect(c.url).toBe('https://site.com/p?token=…');
    expect(c.topScripts[0].file).toBe('app.js');
    expect(c.thirdPartyPercentage).toBe(50); // 100 / 200
    expect(c.heapSizeMB).toBe(10);
  });

  it('never leaks tokens from script or finding URLs', () => {
    const json = JSON.stringify(buildCoachContext(snap()));
    expect(json).not.toContain('SECRET');
    expect(json).not.toContain('?v=1');
  });

  it('embeds the context in the system prompt with the rules', () => {
    const sys = buildSystemPrompt(buildCoachContext(snap()));
    expect(sys).toContain('Perflex AI Coach');
    expect(sys).toContain('CURRENT SESSION DATA');
    expect(sys).toContain('site.com');
  });
});
