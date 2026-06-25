import { describe, expect, it } from 'vitest';
import {
  groupByVendor,
  vendorRecommendations,
  removalSavings,
  applyRemoval,
  type VendorImpact,
} from '../../src/shared/third-party-impact';
import type { ScriptProfile } from '../../src/shared/types';

function script(url: string, classification: string, mt: number, transfer: number, cls = 0, tasks = 0, reqs = 1): ScriptProfile {
  return {
    url,
    origin: (() => {
      try {
        return new URL(url).origin;
      } catch {
        return url;
      }
    })(),
    classification: classification as ScriptProfile['classification'],
    category: 'analytics',
    metrics: {
      totalMainThreadTime: mt,
      longTaskCount: tasks,
      averageLongTaskDuration: 0,
      maxLongTaskDuration: 0,
      networkRequestCount: reqs,
      totalNetworkTime: 0,
      totalTransferSize: transfer,
      forcedReflowCount: 0,
      layoutShiftContribution: cls,
      memoryGrowthRate: 0,
      estimatedCompileTime: 0,
      frameDropsAttributed: 0,
    },
    hotFunctions: [],
    interactions: [],
    timeSeries: [],
  };
}

describe('groupByVendor', () => {
  it('groups known vendors and aggregates their metrics, sorted by main-thread time', () => {
    const vendors = groupByVendor([
      script('https://www.google-analytics.com/analytics.js', 'third-party-known', 60, 30000),
      script('https://www.googletagmanager.com/gtm.js', 'third-party-known', 210, 89000, 0.02),
      script('https://shop.example.com/app.js', 'first-party', 400, 100000), // excluded
    ]);
    expect(vendors).toHaveLength(2);
    expect(vendors[0].vendor).toBe('Google Tag Manager'); // highest main-thread first
    expect(vendors[0].layoutShiftContribution).toBe(0.02);
    expect(vendors.find((v) => v.vendor === 'Google Analytics')!.mainThreadTime).toBe(60);
  });

  it('falls back to hostname for unknown third parties', () => {
    const vendors = groupByVendor([script('https://cdn.weirdvendor.io/widget.js', 'third-party-unknown', 40, 5000)]);
    expect(vendors[0].vendor).toBe('cdn.weirdvendor.io');
  });
});

describe('vendorRecommendations', () => {
  const mk = (o: Partial<VendorImpact>): VendorImpact => ({
    vendor: 'X', category: 'analytics', scriptCount: 1, mainThreadTime: 0, transferSize: 0, requestCount: 1, layoutShiftContribution: 0, longTaskCount: 0, scripts: [], ...o,
  });

  it('flags layout shift and heavy main-thread cost', () => {
    const v = mk({ mainThreadTime: 200, layoutShiftContribution: 0.05 });
    const recs = vendorRecommendations(v, [v]);
    expect(recs.join(' ')).toMatch(/reserve space/i);
    expect(recs.join(' ')).toMatch(/main-thread/i);
  });

  it('suggests consolidating duplicate categories', () => {
    const a = mk({ vendor: 'GA', category: 'analytics' });
    const b = mk({ vendor: 'Mixpanel', category: 'analytics' });
    expect(vendorRecommendations(a, [a, b]).join(' ')).toMatch(/consolidat/i);
  });
});

describe('removal simulation', () => {
  const v = (mt: number, cls: number): VendorImpact => ({
    vendor: 'V', category: 'analytics', scriptCount: 1, mainThreadTime: mt, transferSize: 1000, requestCount: 1, layoutShiftContribution: cls, longTaskCount: 0, scripts: [],
  });

  it('sums savings across vendors', () => {
    const s = removalSavings([v(100, 0.02), v(50, 0.01)]);
    expect(s.mainThreadTime).toBe(150);
    expect(s.layoutShift).toBeCloseTo(0.03, 5);
  });

  it('reduces TBT and CLS, clamped at zero', () => {
    const after = applyRemoval({ fcp: 1800, si: 3000, lcp: 2500, tbt: 120, cls: 0.05 }, [v(100, 0.02)]);
    expect(after.tbt).toBe(20);
    expect(after.cls).toBeCloseTo(0.03, 5);
    const all = applyRemoval({ fcp: 1800, si: 3000, lcp: 2500, tbt: 80, cls: 0.01 }, [v(100, 0.02)]);
    expect(all.tbt).toBe(0); // clamped
    expect(all.cls).toBe(0);
  });
});
