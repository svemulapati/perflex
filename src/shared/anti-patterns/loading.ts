import type { AnalysisInput, PerformanceFinding } from '../types';
import { classifyScript } from '../script-classifier';
import { matchKnownLibrary } from '../third-party-db';
import { makeFinding } from './base';

const KB = 1024;

export function loadingMatchers(input: AnalysisInput): PerformanceFinding[] {
  const out: PerformanceFinding[] = [];
  const scripts = input.resources.filter((r) => r.initiatorType === 'script');
  const fcp = input.fcp ?? Infinity;

  // 1. Render-blocking scripts
  const blocking = scripts.filter(
    (r) => r.renderBlockingStatus === 'blocking' || (r.startTime < fcp && r.renderBlockingStatus !== 'non-blocking')
  );
  if (blocking.length > 0) {
    out.push(
      makeFinding('render-blocking-script', 'critical', {
        confidence: blocking.some((b) => b.renderBlockingStatus === 'blocking') ? 0.9 : 0.5,
        description: `${blocking.length} script(s) loaded before first paint that may block rendering.`,
        evidence: { scriptUrl: blocking[0].url, sampleEntries: blocking.slice(0, 5) },
        impact: { frequency: blocking.length, totalDuration: blocking.reduce((s, b) => s + b.duration, 0), coreWebVitalAffected: 'LCP' },
      })
    );
  }

  // 1b. Render-blocking stylesheets
  const blockingCss = input.resources.filter(
    (r) =>
      (r.initiatorType === 'link' || r.initiatorType === 'css') &&
      (r.renderBlockingStatus === 'blocking' || (r.startTime < fcp && r.renderBlockingStatus !== 'non-blocking'))
  );
  if (blockingCss.length > 0) {
    out.push(
      makeFinding('render-blocking-stylesheet', 'warning', {
        confidence: blockingCss.some((b) => b.renderBlockingStatus === 'blocking') ? 0.8 : 0.5,
        description: `${blockingCss.length} stylesheet(s) blocked rendering before first paint.`,
        evidence: { scriptUrl: blockingCss[0].url, sampleEntries: blockingCss.slice(0, 5) },
        impact: { frequency: blockingCss.length, totalDuration: blockingCss.reduce((s, b) => s + b.duration, 0), coreWebVitalAffected: 'LCP' },
      })
    );
  }

  // 2. Unused JavaScript (downloaded but never executed this session)
  const unused = input.scripts.filter(
    (s) => s.metrics.totalTransferSize > 100 * KB && s.metrics.totalMainThreadTime === 0 && s.metrics.longTaskCount === 0
  );
  if (unused.length > 0) {
    out.push(
      makeFinding('unused-javascript', 'warning', {
        confidence: 0.4,
        description: `${unused.length} large script(s) were downloaded but recorded no main-thread execution.`,
        evidence: { scriptUrl: unused[0].url, sampleEntries: unused.slice(0, 5).map((u) => ({ url: u.url, bytes: u.metrics.totalTransferSize })) },
        impact: { frequency: unused.length, totalDuration: unused.reduce((s, u) => s + u.metrics.totalTransferSize / KB, 0) },
      })
    );
  }

  // 3. Chain-loaded dependencies (serial script loading ≥3 deep)
  const serial = [...scripts].sort((a, b) => a.startTime - b.startTime);
  let chain = 1;
  let maxChain = 1;
  for (let i = 1; i < serial.length; i++) {
    if (serial[i].startTime >= serial[i - 1].startTime + serial[i - 1].duration - 5) {
      chain++;
      maxChain = Math.max(maxChain, chain);
    } else chain = 1;
  }
  if (maxChain >= 3) {
    out.push(
      makeFinding('chain-loaded-dependencies', 'warning', {
        confidence: 0.45,
        description: `Detected a serial script-loading chain ~${maxChain} deep; each hop adds a round trip.`,
        impact: { frequency: maxChain, totalDuration: 0 },
      })
    );
  }

  // 4. Duplicate libraries
  const byLib = new Map<string, Set<string>>();
  for (const s of scripts) {
    const lib = matchKnownLibrary(s.url);
    if (!lib) continue;
    if (!byLib.has(lib)) byLib.set(lib, new Set());
    byLib.get(lib)!.add(s.url);
  }
  for (const [lib, urls] of byLib) {
    if (urls.size > 1) {
      out.push(
        makeFinding('duplicate-libraries', 'warning', {
          key: lib,
          confidence: 0.7,
          description: `${lib} appears to be loaded ${urls.size} times from different URLs.`,
          evidence: { sampleEntries: [...urls] },
          impact: { frequency: urls.size, totalDuration: 0 },
        })
      );
    }
  }

  // 6. Large parse & compile
  for (const s of scripts) {
    const sizeKB = s.transferSize / KB;
    if (sizeKB <= 100) continue;
    out.push(
      makeFinding('large-parse-compile', sizeKB > 500 ? 'critical' : 'warning', {
        key: s.url,
        confidence: 0.7,
        description: `${shortName(s.url)} is ${Math.round(sizeKB)}KB transferred — large parse/compile cost on the main thread.`,
        evidence: { scriptUrl: s.url, sampleEntries: [s] },
        impact: { frequency: 1, totalDuration: s.decodedBodySize / 10_240 },
      })
    );
  }

  // 7. document.write usage
  const dw = input.runtime?.documentWriteCount ?? 0;
  if (dw > 0) {
    out.push(
      makeFinding('document-write', 'warning', {
        confidence: 0.9,
        description: `document.write was called ${dw} time(s). It blocks the parser and, after load, wipes the document.`,
        impact: { frequency: dw, totalDuration: 0, coreWebVitalAffected: 'LCP' },
      })
    );
  }

  void classifyScript; // (used by third-party matchers; re-exported keeps imports stable)
  return out;
}

function shortName(url: string): string {
  try {
    return new URL(url).pathname.split('/').pop() || url;
  } catch {
    return url;
  }
}
