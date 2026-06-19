import type { AnalysisInput, PerformanceFinding } from '../types';
import { classifyScript } from '../script-classifier';
import { TAG_MANAGER_HOSTS } from '../third-party-db';
import { CWV_THRESHOLDS } from '../constants';
import { makeFinding } from './base';

export function thirdPartyMatchers(input: AnalysisInput): PerformanceFinding[] {
  const out: PerformanceFinding[] = [];
  const fcp = input.fcp ?? Infinity;

  const scriptRes = input.resources.filter((r) => r.initiatorType === 'script');
  const thirdPartyScripts = scriptRes.filter((r) => {
    const c = classifyScript(r.url, input.pageOrigin, input.allowlist);
    return c.classification === 'third-party-known' || c.classification === 'third-party-unknown';
  });

  // 27. Third-party blocking first paint
  const blockingTP = thirdPartyScripts.filter(
    (r) => r.renderBlockingStatus === 'blocking' || (r.startTime < fcp && r.renderBlockingStatus !== 'non-blocking')
  );
  if (blockingTP.length > 0) {
    out.push(
      makeFinding('third-party-blocking-paint', 'critical', {
        confidence: blockingTP.some((b) => b.renderBlockingStatus === 'blocking') ? 0.85 : 0.5,
        description: `${blockingTP.length} third-party script(s) loaded before first paint and may delay it.`,
        evidence: { scriptUrl: blockingTP[0].url, sampleEntries: blockingTP.slice(0, 5) },
        impact: { frequency: blockingTP.length, totalDuration: blockingTP.reduce((s, b) => s + b.duration, 0), coreWebVitalAffected: 'LCP' },
      })
    );
  }

  // 28. Tag manager cascade
  const hasTagManager = scriptRes.some((r) => TAG_MANAGER_HOSTS.some((h) => r.url.includes(h)));
  if (hasTagManager && thirdPartyScripts.length > 5) {
    out.push(
      makeFinding('tag-manager-cascade', thirdPartyScripts.length > 10 ? 'critical' : 'warning', {
        confidence: 0.5,
        description: `A tag manager is present alongside ${thirdPartyScripts.length} third-party scripts — likely a tag cascade.`,
        impact: { frequency: thirdPartyScripts.length, totalDuration: 0 },
      })
    );
  }

  // 29. Third-party layout shifts (heuristic)
  if (input.vitals.cls > CWV_THRESHOLDS.cls.good && thirdPartyScripts.length > 0) {
    out.push(
      makeFinding('third-party-layout-shift', 'warning', {
        confidence: 0.35,
        description: `Layout shift is elevated (${input.vitals.cls.toFixed(3)}) with third-party content present — third-party injection may be a cause.`,
        impact: { frequency: thirdPartyScripts.length, totalDuration: 0, coreWebVitalAffected: 'CLS' },
      })
    );
  }

  // 30. Third-party main-thread domination
  let firstParty = 0;
  let thirdParty = 0;
  for (const s of input.scripts) {
    if (s.classification === 'first-party' || s.classification === 'inline') firstParty += s.metrics.totalMainThreadTime;
    else thirdParty += s.metrics.totalMainThreadTime;
  }
  const total = firstParty + thirdParty;
  if (total > 0) {
    const share = thirdParty / total;
    if (share > 0.3) {
      out.push(
        makeFinding('third-party-main-thread', share > 0.5 ? 'critical' : 'warning', {
          confidence: 0.8,
          description: `Third-party scripts consumed ${Math.round(share * 100)}% of attributed main-thread time.`,
          impact: { frequency: 1, totalDuration: thirdParty, coreWebVitalAffected: 'INP' },
        })
      );
    }
  }

  return out;
}
