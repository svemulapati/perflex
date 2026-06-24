import { describe, expect, it } from 'vitest';
import {
  METRIC_CURVES,
  metricScore,
  scoreBand,
  scorePerformance,
  estimateSpeedIndex,
  metricForFinding,
  improveMetric,
  type LighthouseMetric,
  type LighthouseMetrics,
} from '../../src/shared/lighthouse-scoring';

const METRICS = Object.keys(METRIC_CURVES) as LighthouseMetric[];

describe('metricScore (log-normal curve)', () => {
  it('scores the median at ~0.50 and p10 at ~0.90 for every metric', () => {
    for (const m of METRICS) {
      expect(metricScore(m, METRIC_CURVES[m].median)).toBeCloseTo(0.5, 2);
      expect(metricScore(m, METRIC_CURVES[m].p10)).toBeCloseTo(0.9, 2);
    }
  });

  it('approaches 1 for excellent values and 0 for terrible ones', () => {
    expect(metricScore('lcp', 1)).toBeGreaterThan(0.99);
    expect(metricScore('lcp', 60_000)).toBeLessThan(0.01);
    expect(metricScore('cls', 0)).toBe(1);
  });

  it('is monotonically decreasing in value', () => {
    expect(metricScore('tbt', 100)).toBeGreaterThan(metricScore('tbt', 400));
    expect(metricScore('tbt', 400)).toBeGreaterThan(metricScore('tbt', 1200));
  });
});

describe('scorePerformance', () => {
  const all = (v: number | ((m: LighthouseMetric) => number)): LighthouseMetrics => ({
    fcp: typeof v === 'function' ? v('fcp') : v,
    si: typeof v === 'function' ? v('si') : v,
    lcp: typeof v === 'function' ? v('lcp') : v,
    tbt: typeof v === 'function' ? v('tbt') : v,
    cls: typeof v === 'function' ? v('cls') : v,
  });

  it('returns ~90 when every metric sits at its p10', () => {
    const est = scorePerformance(all((m) => METRIC_CURVES[m].p10));
    expect(est.score).toBeGreaterThanOrEqual(89);
    expect(est.score).toBeLessThanOrEqual(91);
  });

  it('returns ~50 when every metric sits at its median', () => {
    const est = scorePerformance(all((m) => METRIC_CURVES[m].median));
    expect(est.score).toBeGreaterThanOrEqual(49);
    expect(est.score).toBeLessThanOrEqual(51);
  });

  it('renormalizes weights when some metrics are missing', () => {
    // Only LCP present and perfect → score should be 100, not dragged down.
    const est = scorePerformance({ fcp: null, si: null, lcp: 1, tbt: null, cls: null });
    expect(est.subScores).toHaveLength(1);
    expect(est.subScores[0].weight).toBeCloseTo(1, 5);
    expect(est.score).toBe(100);
  });

  it('returns null when no metrics are available', () => {
    expect(scorePerformance(all(null as unknown as number)).score).toBeNull();
  });
});

describe('helpers', () => {
  it('estimateSpeedIndex adds blocking time to first paint', () => {
    expect(estimateSpeedIndex(1000, 200)).toBe(1200);
    expect(estimateSpeedIndex(null, 300)).toBe(300);
  });

  it('scoreBand matches Lighthouse thresholds', () => {
    expect(scoreBand(49)).toBe('fail');
    expect(scoreBand(50)).toBe('average');
    expect(scoreBand(89)).toBe('average');
    expect(scoreBand(90)).toBe('pass');
  });
});

describe('What-If mapping', () => {
  it('routes findings to the right metric by vital then category', () => {
    expect(metricForFinding('LCP', 'network')).toBe('lcp');
    expect(metricForFinding('CLS', 'rendering')).toBe('cls');
    expect(metricForFinding('INP', 'execution')).toBe('tbt');
    expect(metricForFinding(undefined, 'execution')).toBe('tbt');
    expect(metricForFinding(undefined, 'rendering')).toBe('cls');
  });

  it('improveMetric sheds blocking ms and lifts the score', () => {
    const before: LighthouseMetrics = { fcp: 1800, si: 3000, lcp: 2500, tbt: 1000, cls: 0.1 };
    const after = improveMetric(before, 'tbt', 600);
    expect(after.tbt).toBe(400);
    expect(scorePerformance(after).score!).toBeGreaterThan(scorePerformance(before).score!);
  });

  it('clamps time metrics at zero and reduces CLS fractionally', () => {
    const m: LighthouseMetrics = { fcp: null, si: null, lcp: 100, tbt: null, cls: 0.2 };
    expect(improveMetric(m, 'lcp', 500).lcp).toBe(0);
    expect(improveMetric(m, 'cls', 9999).cls).toBeCloseTo(0.15, 5);
  });
});
