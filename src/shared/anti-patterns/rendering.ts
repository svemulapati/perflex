import type { AnalysisInput, PerformanceFinding } from '../types';
import { CWV_THRESHOLDS } from '../constants';
import { makeFinding } from './base';

export function renderingMatchers(input: AnalysisInput): PerformanceFinding[] {
  const out: PerformanceFinding[] = [];
  const rt = input.runtime;

  // 16. Forced synchronous layout (fine-grained — any geometry read after a write)
  const methodReads = input.reflows.filter(
    (r) => r.property === 'getBoundingClientRect' || r.property === 'getComputedStyle'
  );
  if (methodReads.length > 0) {
    out.push(
      makeFinding('forced-sync-layout', 'warning', {
        confidence: 0.7,
        description: `${methodReads.length} geometry read(s) (getBoundingClientRect/getComputedStyle) occurred right after style writes.`,
        evidence: { sampleEntries: methodReads.slice(0, 5) },
        impact: { frequency: methodReads.length, totalDuration: methodReads.length * 2 },
      })
    );
  }

  // 17. Excessive DOM size
  if (rt && (rt.domElementCount > 1500 || rt.domMaxDepth > 32)) {
    const critical = rt.domElementCount > 3000;
    out.push(
      makeFinding('excessive-dom-size', critical ? 'critical' : 'warning', {
        confidence: 0.85,
        description: `DOM has ${rt.domElementCount} elements (max depth ${rt.domMaxDepth}). Large DOMs slow style & layout.`,
        impact: { frequency: rt.domElementCount, totalDuration: 0, coreWebVitalAffected: 'INP' },
      })
    );
  }

  // 18. Unbounded list rendering
  if (rt && rt.longestSiblingRun > 100) {
    const critical = rt.longestSiblingRun > 500;
    out.push(
      makeFinding('unbounded-list', critical ? 'critical' : 'warning', {
        confidence: 0.75,
        description: `A parent renders ${rt.longestSiblingRun} similar sibling elements without virtualization.`,
        impact: { frequency: rt.longestSiblingRun, totalDuration: 0 },
      })
    );
  }

  // 19. Missing CSS containment (heuristic)
  const totalMutations = input.interactions.reduce((s, i) => s + i.metrics.totalDOMMutations, 0);
  if (rt && totalMutations > 200 && input.timeline.frames.length > 5 && rt.willChangeCount === 0) {
    out.push(
      makeFinding('missing-css-containment', 'info', {
        confidence: 0.35,
        description: `Frequent DOM updates with frame drops and no CSS containment — isolating update regions may help.`,
        impact: { frequency: totalMutations, totalDuration: 0 },
      })
    );
  }

  // 20. Excessive layer promotion
  if (rt && rt.willChangeCount > 20) {
    out.push(
      makeFinding('excessive-layer-promotion', 'warning', {
        confidence: 0.6,
        description: `${rt.willChangeCount} elements are layer-promoted (will-change / translateZ) — high compositing/GPU cost.`,
        impact: { frequency: rt.willChangeCount, totalDuration: 0 },
      })
    );
  }

  // 21. Layout shift sources
  if (input.vitals.cls > CWV_THRESHOLDS.cls.good) {
    const shifts = input.timeline.layoutShifts;
    const critical = input.vitals.cls >= CWV_THRESHOLDS.cls.poor;
    out.push(
      makeFinding('layout-shift-sources', critical ? 'critical' : 'warning', {
        confidence: 0.8,
        description: `Cumulative Layout Shift is ${input.vitals.cls.toFixed(3)} across ${shifts.length} shift(s).`,
        evidence: { sampleEntries: shifts.slice(-5) },
        impact: { frequency: shifts.length, totalDuration: 0, coreWebVitalAffected: 'CLS' },
      })
    );
  }

  return out;
}
