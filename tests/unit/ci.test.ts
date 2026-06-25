import { describe, expect, it } from 'vitest';
// @ts-expect-error — plain ESM module, no types needed for this test
import { aggregateMetrics, evaluateBudgets, evaluateBaseline } from '../../perflex-ci/lib/evaluate.mjs';
// @ts-expect-error — plain ESM module
import { toMarkdown } from '../../perflex-ci/lib/report.mjs';

describe('aggregateMetrics', () => {
  it('takes worst LCP and sums CLS/TBT across pages', () => {
    const m = aggregateMetrics([
      { lcp: 1200, cls: 0.02, tbt: 50, fcp: 800 },
      { lcp: 2100, cls: 0.05, tbt: 120, fcp: 0 },
    ]);
    expect(m.lcp).toBe(2100);
    expect(m.cls).toBe(0.07);
    expect(m.tbt).toBe(170);
    expect(m.fcp).toBe(800);
  });
});

describe('evaluateBudgets', () => {
  const budgets = [
    { metric: 'lcp', operator: '<=', threshold: 2500, severity: 'error' },
    { metric: 'cls', operator: '<=', threshold: 0.1, severity: 'error' },
    { metric: 'tbt', operator: '<=', threshold: 300, severity: 'warning' },
  ];

  it('passes when every error-severity budget is met', () => {
    const e = evaluateBudgets({ lcp: 2000, cls: 0.05, tbt: 500 }, budgets);
    expect(e.pass).toBe(true); // tbt over budget but only a warning
    expect(e.warnings).toBe(1);
    expect(e.errors).toBe(0);
  });

  it('fails when an error-severity budget is exceeded', () => {
    const e = evaluateBudgets({ lcp: 3200, cls: 0.05, tbt: 100 }, budgets);
    expect(e.pass).toBe(false);
    expect(e.errors).toBe(1);
  });

  it('treats a missing metric as a pass (no data)', () => {
    const e = evaluateBudgets({ cls: 0.05 }, budgets);
    expect(e.results.find((r: { metric: string }) => r.metric === 'lcp').pass).toBe(true);
  });
});

describe('evaluateBaseline', () => {
  const baseline = { lcp: 2000, cls: 0.05, totalBlockingTime: 100 };

  it('passes when within tolerance of the baseline', () => {
    const e = evaluateBaseline({ lcp: 2100, cls: 0.05, tbt: 110 }, baseline, 0.2);
    expect(e.pass).toBe(true);
  });

  it('fails when a metric regresses beyond tolerance', () => {
    const e = evaluateBaseline({ lcp: 3000, cls: 0.05, tbt: 110 }, baseline, 0.2);
    expect(e.pass).toBe(false);
    expect(e.results.find((r: { metric: string }) => r.metric === 'lcp').pass).toBe(false);
  });
});

describe('toMarkdown', () => {
  it('renders a PR-comment table with pass/fail icons', () => {
    const evaluation = evaluateBudgets({ lcp: 3200, cls: 0.05, tbt: 100 }, [
      { metric: 'lcp', operator: '<=', threshold: 2500, severity: 'error' },
    ]);
    const md = toMarkdown({ flow: { name: 'Checkout', steps: [1, 2, 3] }, summary: { pages: 2 }, evaluation });
    expect(md).toContain('Perflex Performance Check — Checkout');
    expect(md).toContain('| LCP |');
    expect(md).toContain('❌');
    expect(md).toContain('check(s) failed');
  });
});
