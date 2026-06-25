/**
 * Local Lighthouse v11 performance-score estimator (Feature 7).
 *
 * Lighthouse scores each metric on a log-normal curve anchored by two published
 * control points — p10 (the 10th-percentile value, which scores 0.90) and the
 * median (which scores 0.50) — then takes a weighted average. We reproduce that
 * math here so Perflex can show an *estimated* score with zero network calls.
 *
 * Curves + weights: Lighthouse v10/v11 mobile scoring.
 * This is an estimate — the banner in the UI says to run real Lighthouse for the
 * official number.
 */

export type LighthouseMetric = 'fcp' | 'si' | 'lcp' | 'tbt' | 'cls';

interface Curve {
  /** 10th-percentile value (scores 0.90). */
  p10: number;
  /** Median value (scores 0.50). */
  median: number;
  /** Contribution to the overall performance score. */
  weight: number;
}

export const METRIC_CURVES: Record<LighthouseMetric, Curve> = {
  fcp: { p10: 1800, median: 3000, weight: 0.1 },
  si: { p10: 3387, median: 5800, weight: 0.1 },
  lcp: { p10: 2500, median: 4000, weight: 0.25 },
  tbt: { p10: 200, median: 600, weight: 0.3 },
  cls: { p10: 0.1, median: 0.25, weight: 0.25 },
};

/** erfc^-1(0.4) — the z where the log-normal hits the p10 (0.90) score. */
const INVERSE_ERFC_ONE_FIFTH = 0.9061938024368232;

/** erf via Abramowitz & Stegun 7.1.26 (max error ~1.5e-7). */
function erf(x: number): number {
  const sign = x < 0 ? -1 : 1;
  const ax = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * ax);
  const y =
    1 -
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) *
      t *
      Math.exp(-ax * ax);
  return sign * y;
}

const erfc = (x: number): number => 1 - erf(x);
const clamp01 = (n: number): number => Math.max(0, Math.min(1, n));

/**
 * Score a single metric value in [0,1] using its log-normal curve. Lower values
 * are better for every Lighthouse metric.
 */
export function metricScore(metric: LighthouseMetric, value: number): number {
  const { median, p10 } = METRIC_CURVES[metric];
  if (value <= 0) return 1;
  const location = Math.log(median);
  // p10 < median, so this is negative; shape (sigma) is its magnitude scaled.
  const logRatio = Math.log(p10) - location;
  const shape = Math.abs(logRatio) / (Math.SQRT2 * INVERSE_ERFC_ONE_FIFTH);
  if (shape === 0) return value <= median ? 1 : 0;
  const standardized = (Math.log(value) - location) / (Math.SQRT2 * shape);
  return clamp01(0.5 * erfc(standardized));
}

/**
 * Estimate Speed Index, which Perflex doesn't measure directly. SI tracks how
 * quickly the page paints its content; first paint plus the blocking time that
 * delays subsequent paints is a reasonable proxy.
 */
export function estimateSpeedIndex(fcp: number | null, tbt: number): number {
  const base = fcp ?? 0;
  return base + tbt;
}

export interface LighthouseMetrics {
  fcp: number | null;
  si: number | null;
  lcp: number | null;
  tbt: number | null;
  cls: number | null;
}

export interface SubScore {
  metric: LighthouseMetric;
  value: number;
  score: number; // 0..1
  weight: number; // renormalized over available metrics
}

export interface LighthouseEstimate {
  /** 0..100, or null if no metrics are available. */
  score: number | null;
  subScores: SubScore[];
}

/**
 * Weighted Lighthouse performance estimate. Metrics that are null (not yet
 * measured) are excluded and the remaining weights renormalized, so an early
 * estimate isn't dragged down by missing data.
 */
export function scorePerformance(metrics: LighthouseMetrics): LighthouseEstimate {
  const present = (Object.keys(METRIC_CURVES) as LighthouseMetric[]).filter(
    (m) => metrics[m] !== null && metrics[m] !== undefined
  );
  if (present.length === 0) return { score: null, subScores: [] };

  const totalWeight = present.reduce((sum, m) => sum + METRIC_CURVES[m].weight, 0);
  const subScores: SubScore[] = present.map((metric) => {
    const value = metrics[metric] as number;
    return {
      metric,
      value,
      score: metricScore(metric, value),
      weight: METRIC_CURVES[metric].weight / totalWeight,
    };
  });

  const weighted = subScores.reduce((sum, s) => sum + s.score * s.weight, 0);
  return { score: Math.round(weighted * 100), subScores };
}

/** Lighthouse's score band colors. */
export function scoreBand(score: number): 'fail' | 'average' | 'pass' {
  if (score < 50) return 'fail';
  if (score < 90) return 'average';
  return 'pass';
}

/**
 * Map a finding (by the Core Web Vital it affects, falling back to category) to
 * the Lighthouse metric a fix would most improve. Heuristic — the "What If"
 * simulator is explicitly an estimate.
 */
export function metricForFinding(
  coreWebVitalAffected: string | undefined,
  category: string
): LighthouseMetric {
  const v = (coreWebVitalAffected ?? '').toUpperCase();
  if (v.includes('LCP')) return 'lcp';
  if (v.includes('CLS')) return 'cls';
  if (v.includes('FCP')) return 'fcp';
  if (v.includes('INP') || v.includes('TBT') || v.includes('FID')) return 'tbt';
  if (category === 'rendering') return 'cls';
  if (category === 'network') return 'lcp';
  // execution / loading / third-party / framework mostly show up as blocking time.
  return 'tbt';
}

/** Minimal shape needed to rank a fix's Lighthouse impact. */
export interface FindingLike {
  coreWebVitalAffected?: string;
  category: string;
  totalDuration: number;
}

export interface Opportunity<T> {
  item: T;
  delta: number;
}

/**
 * Rank fixes by estimated Lighthouse-score gain, and compute the projected
 * score if everything were fixed. Shared by the Overview "What If" simulator and
 * the PDF report so they can never disagree.
 */
export function rankOpportunities<T extends FindingLike>(
  metrics: LighthouseMetrics,
  baseScore: number,
  items: T[]
): { ranked: Opportunity<T>[]; fixAllScore: number } {
  const ranked = items
    .map((item) => {
      const metric = metricForFinding(item.coreWebVitalAffected, item.category);
      const projected = scorePerformance(improveMetric(metrics, metric, item.totalDuration)).score ?? baseScore;
      return { item, delta: projected - baseScore };
    })
    .filter((o) => o.delta > 0)
    .sort((a, b) => b.delta - a.delta);

  const allFixed = items.reduce(
    (m, it) => improveMetric(m, metricForFinding(it.coreWebVitalAffected, it.category), it.totalDuration),
    metrics
  );
  return { ranked, fixAllScore: scorePerformance(allFixed).score ?? baseScore };
}

/**
 * Apply an estimated fix to one metric and return new metrics. Time-based
 * metrics shed the finding's wasted milliseconds (clamped at 0); CLS isn't a
 * time metric, so a fix is modeled as removing a slice of accumulated shift.
 */
export function improveMetric(
  metrics: LighthouseMetrics,
  metric: LighthouseMetric,
  improvementMs: number
): LighthouseMetrics {
  const next = { ...metrics };
  const current = next[metric];
  if (current === null) return next;
  if (metric === 'cls') {
    next.cls = Math.max(0, current - Math.min(current, 0.05));
  } else {
    next[metric] = Math.max(0, current - Math.max(0, improvementMs));
  }
  return next;
}
