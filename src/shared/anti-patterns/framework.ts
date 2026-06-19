import type { AnalysisInput, DetectedFramework, PerformanceFinding } from '../types';
import { makeFinding } from './base';

// Development-bundle filename signatures (per framework).
const DEV_BUNDLE_PATTERNS: Array<{ fw: string; re: RegExp }> = [
  { fw: 'React', re: /react(-dom)?\.development\.js/i },
  { fw: 'React', re: /react(-dom)?\.profiling\.js/i },
  { fw: 'Vue', re: /vue(\.global|\.esm-browser|\.runtime\.global)?\.js(\?|$)/i },
];

const UI_FRAMEWORKS = new Set(['React', 'Vue', 'Angular', 'Preact', 'jQuery', 'Svelte']);

// Minimum "current" major versions (below → flagged as outdated, info only).
const MIN_MAJOR: Record<string, number> = { React: 18, Angular: 15, Vue: 3 };

export function frameworkMatchers(input: AnalysisInput): PerformanceFinding[] {
  const out: PerformanceFinding[] = [];
  const fws = input.frameworks;
  if (fws.length === 0) return out;

  const named = (list: DetectedFramework[]) =>
    list.map((f) => `${f.name}${f.version ? ` ${f.version}` : ''}`).join(', ');

  // 1. Development build shipped to production
  const devByFlag = fws.filter((f) => f.devBuild);
  const devByUrl = new Set<string>();
  for (const r of input.resources) {
    for (const { fw, re } of DEV_BUNDLE_PATTERNS) {
      if (re.test(r.url) && !/\.prod(\.min)?\.js/i.test(r.url)) devByUrl.add(fw);
    }
  }
  const devNames = new Set<string>([...devByFlag.map((f) => f.name), ...devByUrl]);
  if (devNames.size > 0) {
    out.push(
      makeFinding('dev-build-shipped', 'critical', {
        confidence: devByFlag.length > 0 ? 0.95 : 0.7,
        description: `A development build of ${[...devNames].join(', ')} appears to be loaded. Dev builds include warnings and checks that are several times slower than production builds.`,
        evidence: { sampleEntries: [...devNames] },
        impact: { frequency: devNames.size, totalDuration: 0, estimatedUserImpact: 'high' },
      })
    );
  }

  // 2. Multiple UI frameworks loaded together
  const uiFws = fws.filter((f) => UI_FRAMEWORKS.has(f.name) && !f.meta);
  if (uiFws.length >= 2) {
    out.push(
      makeFinding('multiple-ui-frameworks', 'warning', {
        confidence: 0.7,
        description: `${uiFws.length} UI frameworks are loaded on the same page: ${named(uiFws)}. Each ships its own runtime, inflating bytes and main-thread work.`,
        evidence: { sampleEntries: uiFws },
        impact: { frequency: uiFws.length, totalDuration: 0 },
      })
    );
  }

  // 3. Outdated major version (informational)
  for (const f of fws) {
    const min = MIN_MAJOR[f.name];
    if (min && f.major !== undefined && f.major < min) {
      out.push(
        makeFinding('outdated-framework', 'info', {
          key: f.name,
          confidence: 0.8,
          description: `${f.name} ${f.version ?? `v${f.major}`} is behind the current major (v${min}+), which ships meaningful performance improvements.`,
          impact: { frequency: 1, totalDuration: 0, estimatedUserImpact: 'low' },
        })
      );
    }
  }

  return out;
}
