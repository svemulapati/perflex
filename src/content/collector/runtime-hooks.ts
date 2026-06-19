import type { DomQueryEvent, JsonParseEvent, RuntimeStatsEvent } from '@/shared/types';
import { fingerprintStack } from '@/shared/hash';
import type { CollectorContext } from './context';

/**
 * Lightweight runtime instrumentation feeding several Phase-3 anti-pattern
 * matchers: JSON.parse cost, expensive DOM queries, console-spam rate, plus a
 * low-frequency sampler for DOM size / layer promotion / high-frequency input.
 */
export function setupRuntimeHooks(ctx: CollectorContext): () => void {
  const restorers: Array<() => void> = [];

  // ---- JSON.parse cost ----
  const origParse = JSON.parse;
  JSON.parse = function (this: unknown, text: string, reviver?: Parameters<typeof JSON.parse>[1]) {
    const size = typeof text === 'string' ? text.length : 0;
    const start = performance.now();
    const result = origParse.call(JSON, text, reviver as never);
    const duration = performance.now() - start;
    // Only report parses of non-trivial payloads to keep volume low.
    if (size > 10_000) {
      ctx.measure(() => {
        const event: JsonParseEvent = {
          seq: 0,
          kind: 'json-parse',
          timestamp: start,
          fingerprint: fingerprintStack(new Error().stack),
          size,
          duration,
        };
        ctx.emit(event);
      });
    }
    return result;
  } as typeof JSON.parse;
  restorers.push(() => {
    JSON.parse = origParse;
  });

  // ---- Expensive DOM queries ----
  const complexity = (sel: string): number => {
    if (typeof sel !== 'string') return 0;
    // Rough cost proxy: combinators + pseudo-selectors + attribute selectors.
    return (sel.match(/[>~+\s]+/g)?.length ?? 0) + (sel.match(/::?|\[/g)?.length ?? 0);
  };
  const wrapQuery = (proto: object, method: 'querySelectorAll' | 'querySelector') => {
    const obj = proto as Record<string, (...a: unknown[]) => unknown>;
    const orig = obj[method];
    if (typeof orig !== 'function') return;
    obj[method] = function (this: unknown, ...args: unknown[]) {
      const selector = String(args[0] ?? '');
      const start = performance.now();
      const result = orig.call(this, ...args);
      const duration = performance.now() - start;
      // Report only slow or complex queries.
      if (duration > 1 || complexity(selector) > 3) {
        ctx.measure(() => {
          const count =
            method === 'querySelectorAll' ? (result as NodeList)?.length ?? 0 : result ? 1 : 0;
          const event: DomQueryEvent = {
            seq: 0,
            kind: 'dom-query',
            timestamp: start,
            fingerprint: fingerprintStack(new Error().stack),
            selector: String(selector).slice(0, 120),
            complexity: complexity(selector),
            duration,
            resultCount: count,
          };
          ctx.emit(event);
        });
      }
      return result;
    };
    restorers.push(() => {
      obj[method] = orig;
    });
  };
  wrapQuery(Document.prototype, 'querySelectorAll');
  wrapQuery(Document.prototype, 'querySelector');
  wrapQuery(Element.prototype, 'querySelectorAll');
  wrapQuery(Element.prototype, 'querySelector');

  // ---- console spam counter ----
  let consoleCount = 0;
  const consoleMethods: Array<keyof Console> = ['log', 'warn', 'error', 'info', 'debug'];
  for (const m of consoleMethods) {
    const orig = console[m] as (...a: unknown[]) => void;
    if (typeof orig !== 'function') continue;
    (console as unknown as Record<string, unknown>)[m] = function (this: unknown, ...args: unknown[]) {
      consoleCount++;
      return orig.apply(this, args);
    };
    restorers.push(() => {
      (console as unknown as Record<string, unknown>)[m] = orig;
    });
  }

  // ---- high-frequency input counters (passive, no handler patching) ----
  let scrollCount = 0;
  let moveCount = 0;
  const onScroll = () => scrollCount++;
  const onMove = () => moveCount++;
  window.addEventListener('scroll', onScroll, { capture: true, passive: true });
  window.addEventListener('resize', onScroll, { capture: true, passive: true });
  window.addEventListener('mousemove', onMove, { capture: true, passive: true });
  window.addEventListener('pointermove', onMove, { capture: true, passive: true });
  window.addEventListener('touchmove', onMove, { capture: true, passive: true });
  restorers.push(() => {
    window.removeEventListener('scroll', onScroll, { capture: true });
    window.removeEventListener('resize', onScroll, { capture: true });
    window.removeEventListener('mousemove', onMove, { capture: true });
    window.removeEventListener('pointermove', onMove, { capture: true });
    window.removeEventListener('touchmove', onMove, { capture: true });
  });

  // ---- periodic DOM/runtime sampler ----
  const SAMPLE_MS = 3000;
  const sample = () => {
    ctx.measure(() => {
      let elementCount = 0;
      let maxDepth = 0;
      let longestSiblingRun = 0;
      let willChangeCount = 0;
      try {
        const all = document.querySelectorAll('*');
        elementCount = all.length;
        // Longest run of same-tag siblings (unbounded-list signal) + max depth,
        // computed in a single pass over a bounded sample.
        const limit = Math.min(all.length, 6000);
        for (let i = 0; i < limit; i++) {
          const el = all[i];
          let depth = 0;
          let p: Node | null = el;
          while (p && depth < 64) {
            p = p.parentNode;
            depth++;
          }
          if (depth > maxDepth) maxDepth = depth;
        }
        // Same-tag sibling runs: check children of elements with many children.
        const parents = document.querySelectorAll('*');
        for (let i = 0; i < Math.min(parents.length, 6000); i++) {
          const children = parents[i].children;
          if (children.length < 50) continue;
          let run = 1;
          for (let j = 1; j < children.length; j++) {
            if (children[j].tagName === children[j - 1].tagName) {
              run++;
              if (run > longestSiblingRun) longestSiblingRun = run;
            } else run = 1;
          }
        }
        willChangeCount = document.querySelectorAll(
          '[style*="will-change"],[style*="translateZ"],[style*="translate3d"]'
        ).length;
      } catch {
        /* ignore */
      }

      const event: RuntimeStatsEvent = {
        seq: 0,
        kind: 'runtime-stats',
        timestamp: performance.now(),
        consolePerSec: consoleCount / (SAMPLE_MS / 1000),
        domElementCount: elementCount,
        domMaxDepth: maxDepth,
        longestSiblingRun,
        willChangeCount,
        syncXhrCount: 0, // derived in the correlator from network events
        hiFreqScrollPerSec: scrollCount / (SAMPLE_MS / 1000),
        hiFreqMovePerSec: moveCount / (SAMPLE_MS / 1000),
      };
      ctx.emit(event);
      consoleCount = 0;
      scrollCount = 0;
      moveCount = 0;
    });
    timer = window.setTimeout(sample, SAMPLE_MS);
  };
  let timer = window.setTimeout(sample, SAMPLE_MS);
  restorers.push(() => clearTimeout(timer));

  return () => {
    for (const r of restorers) {
      try {
        r();
      } catch {
        /* ignore */
      }
    }
  };
}
