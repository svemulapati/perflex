import type { AnalysisInput, PerformanceFinding, Severity } from '../types';
import { loadingMatchers } from './loading';
import { executionMatchers } from './execution';
import { renderingMatchers } from './rendering';
import { networkMatchers } from './network';
import { thirdPartyMatchers } from './third-party';

export { PATTERN_META } from './base';

const SEVERITY_RANK: Record<Severity, number> = { critical: 0, warning: 1, info: 2 };
const IMPACT_RANK: Record<string, number> = { high: 0, medium: 1, low: 2 };

/**
 * Run every anti-pattern matcher over the correlated dataset and return ranked
 * findings. Each matcher is isolated so one throwing can't suppress the rest.
 */
export function analyze(input: AnalysisInput): PerformanceFinding[] {
  const matchers = [loadingMatchers, executionMatchers, renderingMatchers, networkMatchers, thirdPartyMatchers];
  const findings: PerformanceFinding[] = [];
  for (const matcher of matchers) {
    try {
      findings.push(...matcher(input));
    } catch {
      /* one matcher failing must not break analysis */
    }
  }

  return findings.sort((a, b) => {
    const bySeverity = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
    if (bySeverity !== 0) return bySeverity;
    const byImpact = IMPACT_RANK[a.impact.estimatedUserImpact] - IMPACT_RANK[b.impact.estimatedUserImpact];
    if (byImpact !== 0) return byImpact;
    return b.impact.totalDuration - a.impact.totalDuration;
  });
}
