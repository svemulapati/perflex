import type { DomQueryEvent, JsonParseEvent, RuntimeStatsEvent } from '@/shared/types';
import { fingerprintStack } from '@/shared/hash';
import type { CollectorContext } from './context';

/**
 * Lightweight runtime instrumentation feeding several anti-pattern matchers:
 * JSON.parse cost, expensive querySelectorAll calls, and a low-frequency sampler
 * for DOM size / layer promotion / high-frequency input.
 *
 * NOTE: we deliberately do NOT wrap console.* — doing so rewrites the source
 * location of every page log to point at this file, which is hostile to the
 * developers who are Perflex's users.
 */
export function setupRuntimeHooks(ctx: CollectorContext): () => void {
  const restorers: Array<() => void> = [];

  // ---- JSON.parse cost ----
  const origParse = JSON.parse;
  JSON.parse = function (this: unknown, text: string, reviver?: Parameters<typeof JSON.parse>[1]) {
    const size = typeof text === 'string' ? text.length : 0;
    const start = performance.now();
    // Run the real parse OUTSIDE try/catch so invalid-JSON throws propagate
    // exactly as the page expects.
    const result = origParse.call(JSON, text, reviver as never);
    const duration = performance.now() - start;
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

  // ---- Expensive querySelectorAll (the call that actually gets costly) ----
  // We intentionally do NOT wrap the single-result querySelector: it's an
  // extremely hot path and rarely the performance problem.
  const complexity = (sel: string): number => {
    if (typeof sel !== 'string') return 0;
    return (sel.match(/[>~+\s]+/g)?.length ?? 0) + (sel.match(/::?|\[/g)?.length ?? 0);
  };
  const wrapQueryAll = (proto: object) => {
    const obj = proto as Record<string, (...a: unknown[]) => unknown>;
    const orig = obj.querySelectorAll;
    if (typeof orig !== 'function') return;
    obj.querySelectorAll = function (this: unknown, ...args: unknown[]) {
      const start = performance.now();
      const result = orig.apply(this, args);
      const duration = performance.now() - start;
      if (duration > 1) {
        ctx.measure(() => {
          const selector = String(args[0] ?? '');
          const event: DomQueryEvent = {
            seq: 0,
            kind: 'dom-query',
            timestamp: start,
            fingerprint: fingerprintStack(new Error().stack),
            selector: selector.slice(0, 120),
            complexity: complexity(selector),
            duration,
            resultCount: (result as NodeList)?.length ?? 0,
          };
          ctx.emit(event);
        });
      }
      return result;
    };
    restorers.push(() => {
      obj.querySelectorAll = orig;
    });
  };
  wrapQueryAll(Document.prototype);
  wrapQueryAll(Element.prototype);

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
  const SCAN_CAP = 4000; // bound the per-sample DOM work
  let timer = 0;
  const sample = () => {
    ctx.measure(() => {
      let elementCount = 0;
      let maxDepth = 0;
      let longestSiblingRun = 0;
      let willChangeCount = 0;
      // Skip the (relatively) expensive DOM scan while throttled — keep only the
      // cheap input counters so we never add load to an already-busy page.
      if (ctx.breaker.throttleLevel === 'none') {
        try {
          const all = document.querySelectorAll('*');
          elementCount = all.length;
          const limit = Math.min(elementCount, SCAN_CAP);
          for (let i = 0; i < limit; i++) {
            const el = all[i];
            // depth
            let depth = 0;
            let p: Node | null = el;
            while (p && depth < 64) {
              p = p.parentNode;
              depth++;
            }
            if (depth > maxDepth) maxDepth = depth;
            // same-tag sibling run (only worth checking on high-fanout parents)
            const children = el.children;
            if (children.length >= 50) {
              let run = 1;
              for (let j = 1; j < children.length; j++) {
                if (children[j].tagName === children[j - 1].tagName) {
                  if (++run > longestSiblingRun) longestSiblingRun = run;
                } else run = 1;
              }
            }
          }
          willChangeCount = document.querySelectorAll(
            '[style*="will-change"],[style*="translateZ"],[style*="translate3d"]'
          ).length;
        } catch {
          /* ignore */
        }
      }

      const event: RuntimeStatsEvent = {
        seq: 0,
        kind: 'runtime-stats',
        timestamp: performance.now(),
        consolePerSec: 0, // console is intentionally not instrumented
        domElementCount: elementCount,
        domMaxDepth: maxDepth,
        longestSiblingRun,
        willChangeCount,
        syncXhrCount: 0, // derived in the correlator from network events
        hiFreqScrollPerSec: scrollCount / (SAMPLE_MS / 1000),
        hiFreqMovePerSec: moveCount / (SAMPLE_MS / 1000),
      };
      ctx.emit(event);
      scrollCount = 0;
      moveCount = 0;
    });
    timer = ctx.clock.setTimeout(sample, SAMPLE_MS);
  };
  timer = ctx.clock.setTimeout(sample, SAMPLE_MS);
  restorers.push(() => ctx.clock.clearTimeout(timer));

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
