import type { FindingCategory, PerformanceFinding, Severity } from '../types';
import { REMEDIATIONS } from '../remediation-templates';

export interface PatternMeta {
  name: string;
  category: FindingCategory;
}

/** The full anti-pattern catalog: id → human name + category. */
export const PATTERN_META: Record<string, PatternMeta> = {
  // Loading
  'render-blocking-script': { name: 'Render-Blocking Script', category: 'loading' },
  'render-blocking-stylesheet': { name: 'Render-Blocking Stylesheet', category: 'loading' },
  'document-write': { name: 'document.write Usage', category: 'loading' },
  'unused-javascript': { name: 'Unused JavaScript', category: 'loading' },
  'chain-loaded-dependencies': { name: 'Chain-Loaded Dependencies', category: 'loading' },
  'duplicate-libraries': { name: 'Duplicate Libraries', category: 'loading' },
  'over-eager-preload': { name: 'Over-Eager Preload/Prefetch', category: 'loading' },
  'large-parse-compile': { name: 'Large Script Parse & Compile', category: 'loading' },
  // Execution
  'layout-thrashing': { name: 'Layout Thrashing', category: 'execution' },
  'long-main-thread-task': { name: 'Long Main-Thread Task', category: 'execution' },
  'suspected-memory-leak': { name: 'Suspected Memory Leak', category: 'execution' },
  'unthrottled-listeners': { name: 'Unthrottled Event Listeners', category: 'execution' },
  'synchronous-xhr': { name: 'Synchronous XHR', category: 'execution' },
  'large-json-parse': { name: 'Large Main-Thread JSON Parsing', category: 'execution' },
  'expensive-dom-query': { name: 'Expensive DOM Queries', category: 'execution' },
  'timer-flooding': { name: 'Timer Flooding', category: 'execution' },
  'recursive-raf': { name: 'Recursive rAF Chains', category: 'execution' },
  'excessive-console': { name: 'Excessive Console Logging', category: 'execution' },
  // Rendering
  'forced-sync-layout': { name: 'Forced Synchronous Layout', category: 'rendering' },
  'excessive-dom-size': { name: 'Excessive DOM Size', category: 'rendering' },
  'unbounded-list': { name: 'Unbounded List Rendering', category: 'rendering' },
  'missing-css-containment': { name: 'Missing CSS Containment', category: 'rendering' },
  'excessive-layer-promotion': { name: 'Excessive Layer Promotion', category: 'rendering' },
  'layout-shift-sources': { name: 'Layout Shift Sources', category: 'rendering' },
  // Network
  'redundant-fetch': { name: 'Redundant Fetches', category: 'network' },
  'uncached-api': { name: 'Uncached API Responses', category: 'network' },
  'sequential-waterfall': { name: 'Sequential Waterfalls', category: 'network' },
  'uncompressed-payload': { name: 'Uncompressed Payloads', category: 'network' },
  'oversized-payload': { name: 'Oversized Payloads', category: 'network' },
  'oversized-images': { name: 'Oversized Images', category: 'network' },
  // Framework
  'dev-build-shipped': { name: 'Development Build in Production', category: 'framework' },
  'multiple-ui-frameworks': { name: 'Multiple UI Frameworks', category: 'framework' },
  'outdated-framework': { name: 'Outdated Framework Version', category: 'framework' },
  // Third-party
  'third-party-blocking-paint': { name: 'Third-Party Blocking First Paint', category: 'third-party' },
  'tag-manager-cascade': { name: 'Tag Manager Cascade', category: 'third-party' },
  'third-party-layout-shift': { name: 'Third-Party Layout Shifts', category: 'third-party' },
  'third-party-main-thread': { name: 'Third-Party Main-Thread Domination', category: 'third-party' },
};

interface FindingOptions {
  key?: string;
  confidence: number;
  description: string;
  evidence?: Partial<PerformanceFinding['evidence']>;
  impact: {
    frequency: number;
    totalDuration: number;
    affectedInteractions?: string[];
    estimatedUserImpact?: 'high' | 'medium' | 'low';
    coreWebVitalAffected?: 'LCP' | 'INP' | 'CLS';
  };
}

function rankImpact(totalDuration: number, frequency: number): 'high' | 'medium' | 'low' {
  const weight = totalDuration + frequency * 20;
  if (weight >= 500) return 'high';
  if (weight >= 120) return 'medium';
  return 'low';
}

export function makeFinding(
  patternId: string,
  severity: Severity,
  opts: FindingOptions
): PerformanceFinding {
  const meta = PATTERN_META[patternId];
  return {
    id: opts.key ? `${patternId}:${opts.key}` : patternId,
    patternId,
    patternName: meta?.name ?? patternId,
    category: meta?.category ?? 'execution',
    severity,
    confidence: opts.confidence,
    description: opts.description,
    evidence: { sampleEntries: [], ...opts.evidence },
    impact: {
      frequency: opts.impact.frequency,
      totalDuration: Math.round(opts.impact.totalDuration),
      affectedInteractions: opts.impact.affectedInteractions ?? [],
      estimatedUserImpact:
        opts.impact.estimatedUserImpact ?? rankImpact(opts.impact.totalDuration, opts.impact.frequency),
      coreWebVitalAffected: opts.impact.coreWebVitalAffected,
    },
    remediation: REMEDIATIONS[patternId],
  };
}
