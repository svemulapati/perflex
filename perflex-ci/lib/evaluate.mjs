/**
 * Pure evaluation logic for Perflex CI — no Playwright, fully unit-testable.
 * Turns per-page metrics into a journey summary and checks it against either a
 * budget file or the flow's recorded baseline (regression mode).
 */

/** Roll per-page metrics into one journey summary. */
export function aggregateMetrics(perPage) {
  const m = { lcp: 0, cls: 0, tbt: 0, fcp: 0 };
  for (const p of perPage) {
    m.lcp = Math.max(m.lcp, p.lcp || 0); // worst page's LCP
    m.cls += p.cls || 0; // shifts accumulate across the journey
    m.tbt += p.tbt || 0; // blocking time accumulates
    if (!m.fcp && p.fcp) m.fcp = p.fcp; // first paint of the journey
  }
  return {
    lcp: Math.round(m.lcp),
    cls: Math.round(m.cls * 1000) / 1000,
    tbt: Math.round(m.tbt),
    fcp: Math.round(m.fcp),
  };
}

const OPS = {
  '<': (a, b) => a < b,
  '<=': (a, b) => a <= b,
  '>': (a, b) => a > b,
  '>=': (a, b) => a >= b,
};

/** Check metrics against an explicit budget list. */
export function evaluateBudgets(metrics, budgets) {
  const results = budgets.map((b) => {
    const value = metrics[b.metric];
    const op = OPS[b.operator] || OPS['<='];
    const pass = value == null ? true : op(value, b.threshold);
    return {
      metric: b.metric,
      value: value ?? null,
      operator: b.operator || '<=',
      threshold: b.threshold,
      severity: b.severity || 'error',
      pass,
    };
  });
  const failedErrors = results.filter((r) => !r.pass && r.severity === 'error');
  return {
    mode: 'budgets',
    results,
    pass: failedErrors.length === 0,
    errors: failedErrors.length,
    warnings: results.filter((r) => !r.pass && r.severity === 'warning').length,
  };
}

/** Map a flow baseline's field name for a given metric. */
function baselineValue(baseline, metric) {
  if (!baseline) return null;
  if (metric === 'tbt') return baseline.totalBlockingTime ?? null;
  return baseline[metric] ?? null;
}

/**
 * Regression mode: fail if a metric is more than `tolerance` (fraction) worse
 * than the recorded baseline, with a small absolute slack so tiny deltas pass.
 */
export function evaluateBaseline(metrics, baseline, tolerance = 0.2) {
  const metricsToCheck = ['lcp', 'cls', 'tbt'];
  const slack = { lcp: 50, tbt: 30, cls: 0.02 };
  const results = metricsToCheck.map((metric) => {
    const value = metrics[metric];
    const base = baselineValue(baseline, metric);
    if (value == null || base == null) {
      return { metric, value: value ?? null, baseline: base, allowed: null, pass: true, delta: null };
    }
    const allowed = base * (1 + tolerance) + (slack[metric] || 0);
    const pass = value <= allowed;
    return {
      metric,
      value,
      baseline: base,
      allowed: Math.round(allowed * 1000) / 1000,
      pass,
      delta: Math.round((value - base) * 1000) / 1000,
    };
  });
  return {
    mode: 'baseline',
    tolerance,
    results,
    pass: results.every((r) => r.pass),
    errors: results.filter((r) => !r.pass).length,
    warnings: 0,
  };
}
